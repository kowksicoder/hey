import { erc20Abi, formatUnits, isAddress, parseUnits } from "viem";
import { asMoney, assert } from "../utils.mjs";
import {
  expireQuoteIfNeeded,
  getIdempotencyRecord,
  getWalletOverviewRow,
  logFiatEvent,
  saveIdempotencyRecord
} from "./serviceHelpers.mjs";

const QUOTE_TTL_MS = 10 * 60 * 1000;

const toCoinAmount = (value) => {
  const parsed = Number.parseFloat(
    String(value ?? "")
      .replace(/,/g, "")
      .trim()
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const resolveCoinIdentifier = (body) =>
  body.creatorCoinId ||
  body.coinId ||
  body.coinAddress ||
  body.launchId ||
  body.ticker ||
  null;

export const createSellService = ({
  creatorService,
  executionEnabled = false,
  publicClient = null,
  settlementService = null,
  sellFeeBps = 250,
  supabase
}) => {
  const resolveExecutionWalletAddress = (profile) =>
    profile?.execution_wallet_address || profile?.wallet_address || null;

  const buildExecutionPayload = ({ transaction, wallet }) => ({
    message:
      transaction.status === "completed"
        ? "Your sell completed successfully and your Naira wallet has been credited."
        : "Your sell request is processing. We are finalizing your Naira wallet credit.",
    new_naira_balance: asMoney(wallet.available_balance_kobo),
    sell: {
      coinAddress: transaction.coin_address,
      coinAmount: Number(
        Number.parseFloat(
          transaction.coin_amount_raw || transaction.coin_amount
        ).toFixed(6)
      ),
      coinSymbol: transaction.coin_symbol,
      estimatedNairaReturn: asMoney(transaction.net_naira_return_kobo),
      feeNaira: asMoney(transaction.fee_kobo),
      grossNairaReturn: asMoney(transaction.estimated_naira_return_kobo),
      id: transaction.id,
      quoteId: transaction.quote_id,
      settlementAddress:
        transaction.metadata?.settlementAddress ||
        settlementService?.normalizedSettlementAddress ||
        undefined,
      status: transaction.status,
      tokenDecimals:
        typeof transaction.metadata?.tokenDecimals === "number"
          ? transaction.metadata.tokenDecimals
          : undefined,
      transferAmountLabel:
        transaction.metadata?.transferAmountLabel || undefined,
      transferAmountRaw: transaction.metadata?.transferAmountRaw || undefined
    },
    status: transaction.status,
    success: true,
    wallet: {
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
    }
  });

  const quote = async ({ body, profileId }) => {
    const coinAmount = toCoinAmount(body.coinAmount);
    assert(coinAmount, "A valid creator coin amount is required.");
    assert(publicClient, "Sell quote is not configured on this server.", 503);
    assert(
      settlementService?.isEnabled?.(),
      "Naira sell settlement is not configured on this server.",
      503
    );

    const idempotencyKey = body.idempotencyKey || null;
    const existing = await getIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      scope: "sell.quote",
      supabase
    });

    if (existing?.response_body && existing.response_status) {
      return {
        payload: existing.response_body,
        statusCode: existing.response_status
      };
    }

    const coinIdentifier = resolveCoinIdentifier(body);
    assert(coinIdentifier, "A creator coin identifier is required.");

    const coin = await creatorService.resolveCreatorCoin(coinIdentifier);
    const decimals = await publicClient.readContract({
      abi: erc20Abi,
      address: coin.coinAddress,
      functionName: "decimals"
    });
    const grossReturnKobo = Math.round(
      coinAmount * (coin.live?.priceNaira || 0) * 100
    );
    const feeKobo = Math.min(
      Math.round((grossReturnKobo * sellFeeBps) / 10_000),
      grossReturnKobo
    );
    const netReturnKobo = Math.max(grossReturnKobo - feeKobo, 0);
    const expiresAt = new Date(Date.now() + QUOTE_TTL_MS).toISOString();

    const { data, error } = await supabase
      .from("sell_quotes")
      .insert({
        coin_address: coin.coinAddress,
        coin_amount: coinAmount,
        coin_amount_raw: coinAmount.toString(),
        coin_symbol: coin.live?.symbol || coin.ticker,
        creator_launch_id: coin.id,
        creator_profile_id: coin.creator.id,
        estimated_naira_return_kobo: grossReturnKobo,
        expires_at: expiresAt,
        fee_kobo: feeKobo,
        metadata: {
          requestedBy: "api",
          settlementAddress: settlementService.normalizedSettlementAddress,
          tokenDecimals: Number(decimals),
          transferAmountLabel: `${Number(coinAmount.toFixed(6))} ${
            coin.live?.symbol || coin.ticker
          }`,
          transferAmountRaw: parseUnits(
            coinAmount.toString(),
            Number(decimals)
          ).toString()
        },
        net_naira_return_kobo: netReturnKobo,
        profile_id: profileId,
        source_snapshot: {
          marketCapNaira: coin.live?.marketCapNaira || 0,
          priceNaira: coin.live?.priceNaira || 0,
          volume24hNaira: coin.live?.volume24hNaira || 0
        }
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    const payload = {
      coin: {
        address: coin.coinAddress,
        id: coin.id,
        name: coin.name,
        symbol: coin.live?.symbol || coin.ticker
      },
      coin_amount: Number(coinAmount.toFixed(6)),
      estimated_naira_return: asMoney(netReturnKobo),
      expires_at: expiresAt,
      fee_naira: asMoney(feeKobo),
      gross_naira_return: asMoney(grossReturnKobo),
      quote_id: data.id,
      settlement: {
        address: settlementService.normalizedSettlementAddress,
        token_decimals: Number(decimals),
        transfer_amount_label: `${Number(coinAmount.toFixed(6))} ${
          coin.live?.symbol || coin.ticker
        }`,
        transfer_amount_raw: parseUnits(
          coinAmount.toString(),
          Number(decimals)
        ).toString()
      }
    };

    await saveIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      responseBody: payload,
      responseStatus: 200,
      scope: "sell.quote",
      supabase
    });

    return {
      payload,
      statusCode: 200
    };
  };

  const execute = async ({ body, profile }) => {
    assert(body.quoteId, "quoteId is required.");
    assert(
      publicClient,
      "Sell execution is not configured on this server.",
      503
    );
    assert(
      settlementService?.isEnabled?.(),
      "Naira sell settlement is not configured on this server.",
      503
    );
    const executionWalletAddress = resolveExecutionWalletAddress(profile);
    assert(
      executionWalletAddress && isAddress(executionWalletAddress),
      "A connected execution wallet is required to sell creator coins.",
      401
    );
    const profileId = profile.id;
    const idempotencyKey = body.idempotencyKey || body.quoteId;
    const existing = await getIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      scope: "sell.execute",
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
        .from("sell_transactions")
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
        (existingTransaction.metadata?.transferTxHash || body.transactionHash)
          ? await settlementService.settleSellTransaction({
              profile,
              transaction: existingTransaction,
              transactionHash: body.transactionHash
            })
          : null;
      const wallet =
        settlementResult?.wallet ||
        (await getWalletOverviewRow({
          profileId,
          supabase
        }));
      const payload = buildExecutionPayload({
        transaction: settlementResult?.transaction || existingTransaction,
        wallet
      });

      await saveIdempotencyRecord({
        key: idempotencyKey,
        profileId,
        responseBody: payload,
        responseStatus: 200,
        scope: "sell.execute",
        supabase
      });

      return {
        payload,
        statusCode: 200
      };
    }

    const { data: quote, error: quoteError } = await supabase
      .from("sell_quotes")
      .select("*")
      .eq("id", body.quoteId)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (quoteError) {
      throw quoteError;
    }

    assert(quote, "Sell quote was not found.", 404);
    assert(
      body.transactionHash,
      "transactionHash is required to complete this sell.",
      400
    );

    const quoteExpired = await expireQuoteIfNeeded({
      quote,
      quoteTable: "sell_quotes",
      supabase
    });
    assert(
      !quoteExpired,
      "This sell quote has expired. Please request a new quote.",
      409
    );
    assert(
      ["quoted", "awaiting_confirmation"].includes(quote.status),
      "This sell quote is no longer available.",
      409
    );

    const [decimals, balanceRaw, wallet] = await Promise.all([
      publicClient.readContract({
        abi: erc20Abi,
        address: quote.coin_address,
        functionName: "decimals"
      }),
      publicClient.readContract({
        abi: erc20Abi,
        address: quote.coin_address,
        args: [executionWalletAddress],
        functionName: "balanceOf"
      }),
      getWalletOverviewRow({
        profileId,
        supabase
      })
    ]);
    const requestedAmount = parseUnits(
      quote.coin_amount_raw || String(quote.coin_amount),
      Number(decimals)
    );
    assert(
      balanceRaw >= requestedAmount,
      "Insufficient creator coin balance for this sell quote.",
      409
    );

    await settlementService.validateTransfer({
      profile,
      transaction: {
        coin_address: quote.coin_address,
        metadata: {
          transferAmountRaw:
            quote.metadata?.transferAmountRaw || requestedAmount.toString()
        },
        zora_trade_hash: body.transactionHash
      },
      transactionHash: body.transactionHash
    });

    const now = new Date().toISOString();
    const transactionPayload = {
      coin_address: quote.coin_address,
      coin_amount: quote.coin_amount,
      coin_amount_raw: quote.coin_amount_raw || String(quote.coin_amount),
      coin_symbol: quote.coin_symbol,
      creator_launch_id: quote.creator_launch_id,
      creator_profile_id: quote.creator_profile_id,
      estimated_naira_return_kobo: quote.estimated_naira_return_kobo,
      fee_kobo: quote.fee_kobo,
      idempotency_key: idempotencyKey,
      metadata: {
        chainBalanceFormatted: formatUnits(balanceRaw, Number(decimals)),
        chainBalanceRaw: balanceRaw.toString(),
        executionEnabled,
        executionStage: "awaiting_sell_settlement_credit",
        quoteMetadata: quote.metadata || {},
        settlementAddress:
          quote.metadata?.settlementAddress ||
          settlementService.normalizedSettlementAddress,
        sourceSnapshot: quote.source_snapshot || {},
        tokenDecimals: Number(decimals),
        transferAmountLabel:
          quote.metadata?.transferAmountLabel ||
          `${Number(quote.coin_amount).toFixed(6)} ${quote.coin_symbol || "TOKEN"}`,
        transferAmountRaw:
          quote.metadata?.transferAmountRaw || requestedAmount.toString(),
        transferTxHash: body.transactionHash,
        walletAddress: executionWalletAddress
      },
      net_naira_return_kobo: quote.net_naira_return_kobo,
      profile_id: profileId,
      quote_id: quote.id,
      status: "processing",
      wallet_id: wallet.wallet_id,
      zora_trade_hash: body.transactionHash
    };

    const { data: transaction, error: transactionError } = await supabase
      .from("sell_transactions")
      .insert(transactionPayload)
      .select("*")
      .single();

    if (transactionError) {
      throw transactionError;
    }

    logFiatEvent("sell.executed", {
      coinAddress: quote.coin_address,
      coinAmount: quote.coin_amount_raw || String(quote.coin_amount),
      profileId,
      quoteId: quote.id,
      sellId: transaction.id
    });

    const { error: quoteUpdateError } = await supabase
      .from("sell_quotes")
      .update({
        consumed_at: now,
        metadata: {
          ...(quote.metadata || {}),
          executedAt: now,
          executionStage: "awaiting_sell_settlement_credit",
          transferTxHash: body.transactionHash
        },
        status: "consumed"
      })
      .eq("id", quote.id);

    if (quoteUpdateError) {
      logFiatEvent("sell.quote_update_failed", {
        error: quoteUpdateError.message,
        profileId,
        quoteId: quote.id,
        sellId: transaction.id
      });
    }

    const settlementResult = await settlementService.settleSellTransaction({
      profile,
      transaction
    });
    const payload = buildExecutionPayload({
      transaction: settlementResult.transaction,
      wallet: settlementResult.wallet
    });

    await saveIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      responseBody: payload,
      responseStatus: 200,
      scope: "sell.execute",
      supabase
    });

    return {
      payload,
      statusCode: 200
    };
  };

  return {
    execute,
    quote
  };
};
