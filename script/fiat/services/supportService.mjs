import { isAddress } from "viem";
import { asMoney, assert, toKobo } from "../utils.mjs";
import {
  expireQuoteIfNeeded,
  getIdempotencyRecord,
  getWalletOverviewRow,
  logFiatEvent,
  saveIdempotencyRecord
} from "./serviceHelpers.mjs";

const QUOTE_TTL_MS = 10 * 60 * 1000;

const resolveCoinIdentifier = async ({ body, supabase }) => {
  const directIdentifier =
    body.creatorCoinId ||
    body.coinId ||
    body.coinAddress ||
    body.launchId ||
    body.ticker;

  if (directIdentifier) {
    return directIdentifier;
  }

  if (!body.creatorId) {
    return null;
  }

  const { data, error } = await supabase
    .from("creator_launches")
    .select("id")
    .eq("created_by", body.creatorId)
    .eq("status", "launched")
    .order("launched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id || null;
};

const computeEstimatedCoinAmount = ({ feeKobo, grossKobo, priceNaira }) => {
  const tradableNaira = Math.max((grossKobo - feeKobo) / 100, 0);

  if (!priceNaira || priceNaira <= 0) {
    return 0;
  }

  return Number((tradableNaira / priceNaira).toFixed(10));
};

const mapWalletSummary = (wallet) => ({
  availableBalance: asMoney(wallet.available_balance_kobo),
  availableBalanceKobo: wallet.available_balance_kobo,
  currency: wallet.currency,
  id: wallet.wallet_id,
  lastTransactionAt: wallet.last_transaction_at,
  lockedBalance: asMoney(wallet.locked_balance_kobo),
  lockedBalanceKobo: wallet.locked_balance_kobo,
  pendingBalance: asMoney(wallet.pending_balance_kobo),
  pendingBalanceKobo: wallet.pending_balance_kobo,
  profileId: wallet.profile_id,
  totalBalance: asMoney(wallet.total_balance_kobo),
  totalBalanceKobo: wallet.total_balance_kobo
});

export const createSupportService = ({
  creatorService,
  executionEnabled = false,
  settlementService = null,
  supportFeeBps = 250,
  supabase,
  walletService = null
}) => {
  const resolveExecutionWalletAddress = (profile, body = null) => {
    const requestedExecutionWalletAddress = String(
      body?.executionWalletAddress || ""
    )
      .trim()
      .toLowerCase();

    if (
      requestedExecutionWalletAddress &&
      isAddress(requestedExecutionWalletAddress)
    ) {
      return requestedExecutionWalletAddress;
    }

    return profile?.execution_wallet_address || profile?.wallet_address || null;
  };

  const getFundingState = async ({ profileId, syncDeposits = true }) => {
    if (walletService?.getTradeFundingState) {
      return await walletService.getTradeFundingState({
        profileId,
        syncDeposits
      });
    }

    const wallet = await getWalletOverviewRow({
      profileId,
      supabase
    });

    return {
      funding: null,
      wallet
    };
  };

  const assertBuySettlementReady = (fundingState) => {
    if (!fundingState?.funding) {
      return;
    }

    assert(
      fundingState.funding.buySettlementReady !== false,
      fundingState.funding.buySettlementMessage ||
        "Naira buy settlement is not available right now.",
      503
    );
  };

  const buildExecutionPayload = ({ transaction, wallet }) => ({
    funding: null,
    message:
      transaction.status === "completed"
        ? "You bought this creator coin successfully and the coins were sent to your wallet."
        : transaction.status === "processing"
          ? "Your buy trade is processing. Your Naira balance is locked while we confirm the creator coin purchase."
          : transaction.status === "failed"
            ? "This buy trade could not be completed. Your Naira balance has been returned."
            : "Your buy trade was recorded successfully.",
    new_naira_balance: asMoney(wallet.available_balance_kobo),
    refreshAfterMs: transaction.status === "processing" ? 5000 : undefined,
    shouldPoll: transaction.status === "processing",
    status: transaction.status,
    success: true,
    support: {
      coinAddress: transaction.coin_address,
      coinSymbol: transaction.coin_symbol,
      estimatedCoinAmount: Number(
        Number.parseFloat(
          transaction.estimated_coin_amount_raw ||
            String(transaction.estimated_coin_amount || 0)
        ).toFixed(6)
      ),
      feeNaira: asMoney(transaction.fee_kobo),
      id: transaction.id,
      quoteId: transaction.quote_id,
      status: transaction.status,
      supportAmountNaira: asMoney(transaction.naira_amount_kobo),
      totalNaira: asMoney(transaction.total_kobo)
    },
    wallet: {
      ...mapWalletSummary(wallet)
    }
  });

  const getTransactionStatus = async ({ profile, transactionId }) => {
    assert(transactionId, "transactionId is required.");

    const { data: transaction, error: transactionError } = await supabase
      .from("support_transactions")
      .select("*")
      .eq("id", transactionId)
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (transactionError) {
      throw transactionError;
    }

    assert(transaction, "Support transaction was not found.", 404);

    const settlementResult =
      transaction.status === "processing" &&
      executionEnabled &&
      settlementService?.isEnabled?.() &&
      settlementService?.shouldReconcileTransaction?.(transaction)
        ? await settlementService.reconcileSupportTransaction({
            profile,
            transaction
          })
        : null;
    const fundingState = await getFundingState({
      profileId: profile.id,
      syncDeposits: false
    });
    const wallet = settlementResult?.wallet || fundingState.wallet;
    const payload = buildExecutionPayload({
      transaction: settlementResult?.transaction || transaction,
      wallet
    });

    payload.funding = fundingState.funding;
    return {
      payload,
      statusCode: 200
    };
  };

  const quote = async ({ body, profileId }) => {
    const fundingState = await getFundingState({
      profileId
    });
    const amountKobo = toKobo(body.nairaAmount);
    assert(amountKobo, "A valid Naira trade amount is required.");

    const idempotencyKey = body.idempotencyKey || null;
    const existing = await getIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      scope: "support.quote",
      supabase
    });

    if (existing?.response_body && existing.response_status) {
      return {
        payload: existing.response_body,
        statusCode: existing.response_status
      };
    }

    const coinIdentifier = await resolveCoinIdentifier({ body, supabase });
    assert(coinIdentifier, "A creator coin identifier is required.");

    const coin = await creatorService.resolveCreatorCoin(coinIdentifier);
    const feeKobo = Math.min(
      Math.round((amountKobo * supportFeeBps) / 10_000),
      amountKobo
    );
    const supportAmountKobo = Math.max(amountKobo - feeKobo, 0);
    const estimatedCoinAmount = computeEstimatedCoinAmount({
      feeKobo,
      grossKobo: amountKobo,
      priceNaira: coin.live?.priceNaira || 0
    });
    const expiresAt = new Date(Date.now() + QUOTE_TTL_MS).toISOString();

    const { data, error } = await supabase
      .from("support_quotes")
      .insert({
        coin_address: coin.coinAddress,
        coin_symbol: coin.live?.symbol || coin.ticker,
        creator_launch_id: coin.id,
        creator_profile_id: coin.creator.id,
        estimated_coin_amount: estimatedCoinAmount,
        estimated_coin_amount_raw: estimatedCoinAmount.toString(),
        expires_at: expiresAt,
        fee_kobo: feeKobo,
        metadata: {
          requestedBy: "api"
        },
        naira_amount_kobo: supportAmountKobo,
        profile_id: profileId,
        source_snapshot: {
          marketCapNaira: coin.live?.marketCapNaira || 0,
          priceNaira: coin.live?.priceNaira || 0,
          volume24hNaira: coin.live?.volume24hNaira || 0
        },
        total_kobo: amountKobo
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    const payload = {
      creator: {
        id: coin.creator.id,
        name: coin.creator.displayName || coin.creator.username || coin.name
      },
      estimated_coin_amount: Number(estimatedCoinAmount.toFixed(6)),
      expires_at: expiresAt,
      fee_naira: asMoney(feeKobo),
      funding: fundingState.funding,
      naira_amount: asMoney(amountKobo),
      quote_id: data.id,
      support_amount_naira: asMoney(supportAmountKobo),
      total_naira: asMoney(amountKobo),
      wallet: mapWalletSummary(fundingState.wallet)
    };

    await saveIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      responseBody: payload,
      responseStatus: 200,
      scope: "support.quote",
      supabase
    });

    return {
      payload,
      statusCode: 200
    };
  };

  const execute = async ({ body, profile }) => {
    assert(body.quoteId, "quoteId is required.");
    const profileId = profile.id;
    const executionWalletAddress = resolveExecutionWalletAddress(profile, body);
    const idempotencyKey = body.idempotencyKey || body.quoteId;
    const existing = await getIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      scope: "support.execute",
      supabase
    });

    if (existing?.response_body && existing.response_status) {
      return {
        payload: existing.response_body,
        statusCode: existing.response_status
      };
    }

    const { data: existingTransaction, error: existingTransactionError } =
      await supabase
        .from("support_transactions")
        .select("*")
        .eq("profile_id", profileId)
        .eq("quote_id", body.quoteId)
        .maybeSingle();

    if (existingTransactionError) {
      throw existingTransactionError;
    }

    if (existingTransaction) {
      const settlementResult =
        existingTransaction.status === "processing" &&
        executionEnabled &&
        settlementService?.isEnabled?.() &&
        settlementService?.shouldReconcileTransaction?.(existingTransaction)
          ? await settlementService.reconcileSupportTransaction({
              profile,
              transaction: existingTransaction
            })
          : null;
      const fundingState = await getFundingState({
        profileId,
        syncDeposits: false
      });
      const wallet = settlementResult?.wallet || fundingState.wallet;
      const payload = buildExecutionPayload({
        transaction: settlementResult?.transaction || existingTransaction,
        wallet
      });

      payload.funding = fundingState.funding;

      await saveIdempotencyRecord({
        key: idempotencyKey,
        profileId,
        responseBody: payload,
        responseStatus: 200,
        scope: "support.execute",
        supabase
      });

      return {
        payload,
        statusCode: 200
      };
    }

    const { data: quote, error: quoteError } = await supabase
      .from("support_quotes")
      .select("*")
      .eq("id", body.quoteId)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (quoteError) {
      throw quoteError;
    }

    assert(quote, "Trade quote was not found.", 404);

    const quoteExpired = await expireQuoteIfNeeded({
      quote,
      quoteTable: "support_quotes",
      supabase
    });
    assert(
      !quoteExpired,
      "This trade quote has expired. Please request a new quote.",
      409
    );
    assert(
      ["quoted", "awaiting_confirmation"].includes(quote.status),
      "This trade quote is no longer available.",
      409
    );

    const fundingState = await getFundingState({
      profileId
    });
    assertBuySettlementReady(fundingState);
    const wallet = fundingState.wallet;
    assert(
      wallet.available_balance_kobo >= quote.total_kobo,
      "Insufficient available balance.",
      409
    );

    const now = new Date().toISOString();
    const estimatedCoinAmount = Number.parseFloat(
      quote.estimated_coin_amount_raw ||
        String(quote.estimated_coin_amount || 0)
    );
    const transactionPayload = {
      coin_address: quote.coin_address,
      coin_symbol: quote.coin_symbol,
      confirmed_at: now,
      creator_launch_id: quote.creator_launch_id,
      creator_profile_id: quote.creator_profile_id,
      estimated_coin_amount: estimatedCoinAmount,
      estimated_coin_amount_raw:
        quote.estimated_coin_amount_raw || estimatedCoinAmount.toString(),
      fee_kobo: quote.fee_kobo,
      idempotency_key: idempotencyKey,
      metadata: {
        executionEnabled,
        executionStage: executionEnabled
          ? "queued_for_trade_execution"
          : "wallet_locked_awaiting_settlement",
        quoteMetadata: quote.metadata || {},
        sourceSnapshot: quote.source_snapshot || {},
        walletAddress: executionWalletAddress
      },
      naira_amount_kobo: quote.naira_amount_kobo,
      processing_at: now,
      profile_id: profileId,
      quote_expires_at: quote.expires_at,
      quote_id: quote.id,
      status: "processing",
      total_kobo: quote.total_kobo,
      wallet_id: wallet.wallet_id
    };

    const { data: transaction, error: transactionError } = await supabase
      .from("support_transactions")
      .insert(transactionPayload)
      .select("*")
      .single();

    if (transactionError) {
      throw transactionError;
    }

    logFiatEvent("support.executed", {
      profileId,
      quoteId: quote.id,
      supportId: transaction.id,
      totalKobo: quote.total_kobo
    });

    try {
      const { error: holdError } = await supabase
        .from("fiat_wallet_ledger_entries")
        .insert({
          available_delta_kobo: -quote.total_kobo,
          description: "Support funds locked",
          entry_kind: "support_hold",
          locked_delta_kobo: quote.total_kobo,
          metadata: {
            coinAddress: quote.coin_address,
            quoteId: quote.id,
            settlementMode: executionEnabled ? "live" : "manual",
            walletAddress: executionWalletAddress
          },
          profile_id: profileId,
          reference_id: transaction.id,
          reference_kind: "support_transaction",
          wallet_id: wallet.wallet_id
        });

      if (holdError) {
        throw holdError;
      }
    } catch (error) {
      await supabase
        .from("support_transactions")
        .update({
          error_code: "support_hold_failed",
          error_message:
            error instanceof Error
              ? error.message
              : "Support balance lock failed.",
          failed_at: new Date().toISOString(),
          status: "failed"
        })
        .eq("id", transaction.id);

      logFiatEvent("support.failed", {
        error:
          error instanceof Error
            ? error.message
            : "Support balance lock failed.",
        profileId,
        quoteId: quote.id,
        supportId: transaction.id
      });

      throw error;
    }

    const { error: quoteUpdateError } = await supabase
      .from("support_quotes")
      .update({
        consumed_at: now,
        metadata: {
          ...(quote.metadata || {}),
          executedAt: now,
          executionStage: executionEnabled
            ? "queued_for_trade_execution"
            : "wallet_locked_awaiting_settlement"
        },
        status: "consumed"
      })
      .eq("id", quote.id);

    if (quoteUpdateError) {
      logFiatEvent("support.quote_update_failed", {
        error: quoteUpdateError.message,
        profileId,
        quoteId: quote.id,
        supportId: transaction.id
      });
    }

    const settlementResult =
      settlementService?.isEnabled?.() && executionEnabled
        ? await settlementService.settleSupportTransaction({
            profile,
            transaction
          })
        : null;
    const settledTransaction = settlementResult?.transaction || transaction;
    const refreshedWallet = settlementResult?.wallet || fundingState.wallet;
    const payload = buildExecutionPayload({
      transaction: settledTransaction,
      wallet: refreshedWallet
    });

    payload.funding = fundingState.funding;

    await saveIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      responseBody: payload,
      responseStatus: 200,
      scope: "support.execute",
      supabase
    });

    return {
      payload,
      statusCode: 200
    };
  };

  return {
    execute,
    getTransactionStatus,
    quote
  };
};
