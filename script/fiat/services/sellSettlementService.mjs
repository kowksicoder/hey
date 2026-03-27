import { decodeFunctionData, erc20Abi, isAddress } from "viem";
import { asMoney, assert } from "../utils.mjs";
import {
  getWalletOverviewRow,
  insertFiatLedgerEntryIfMissing,
  logFiatEvent,
  recordReferralTradeRewardIfEligible
} from "./serviceHelpers.mjs";

const isHash = (value) => /^0x[a-fA-F0-9]{64}$/.test(String(value || ""));

const buildNotificationPayload = ({
  amountNaira,
  coinAddress,
  coinSymbol,
  status,
  txHash
}) => ({
  amountNaira,
  coinAddress,
  coinSymbol,
  status,
  txHash
});

export const createSellSettlementService = ({
  publicClient = null,
  settlementAddress = null,
  supabase,
  telegramService = null
}) => {
  let telegramServiceRef = telegramService;
  const resolveExecutionWalletAddress = (profile, transaction) =>
    transaction.metadata?.walletAddress ||
    profile?.execution_wallet_address ||
    profile?.wallet_address ||
    null;

  const normalizedSettlementAddress =
    settlementAddress && isAddress(settlementAddress)
      ? settlementAddress.toLowerCase()
      : null;

  const isEnabled = () =>
    Boolean(publicClient && normalizedSettlementAddress && supabase);

  const createNotification = async ({
    amountNaira,
    body,
    coinAddress,
    coinSymbol,
    profileId,
    status,
    title,
    txHash
  }) => {
    const { error } = await supabase.from("notifications").insert({
      actor_id: null,
      body,
      data: buildNotificationPayload({
        amountNaira,
        coinAddress,
        coinSymbol,
        status,
        txHash
      }),
      kind: "reward",
      recipient_id: profileId,
      target_key: `/coins/${coinAddress}`,
      title
    });

    if (error) {
      throw error;
    }
  };

  const validateTransfer = async ({
    profile,
    transaction,
    transactionHash
  }) => {
    const executionWalletAddress = resolveExecutionWalletAddress(
      profile,
      transaction
    );

    assert(
      isEnabled(),
      "Fiat sell settlement is not configured on this server.",
      503
    );

    const txHash =
      transactionHash ||
      transaction.metadata?.transferTxHash ||
      transaction.zora_trade_hash;

    assert(
      txHash && isHash(txHash),
      "A valid transfer transaction hash is required to complete this sell.",
      400
    );
    assert(
      executionWalletAddress && isAddress(executionWalletAddress),
      "A connected execution wallet is required to complete this sell.",
      401
    );
    assert(
      transaction.coin_address && isAddress(transaction.coin_address),
      "A valid creator coin address is required to complete this sell.",
      400
    );

    const [receipt, onchainTransaction] = await Promise.all([
      publicClient.getTransactionReceipt({ hash: txHash }),
      publicClient.getTransaction({ hash: txHash })
    ]);
    const decodedCall = decodeFunctionData({
      abi: erc20Abi,
      data: onchainTransaction.input
    });
    const recipient = String(decodedCall.args?.[0] || "").toLowerCase();
    const amountRaw = BigInt(decodedCall.args?.[1] || 0n);
    const expectedAmountRaw = BigInt(
      transaction.metadata?.transferAmountRaw || "0"
    );

    assert(
      receipt.status === "success",
      "Your sell transfer has not been confirmed yet.",
      409
    );
    assert(
      onchainTransaction.from?.toLowerCase() ===
        executionWalletAddress.toLowerCase(),
      "This transfer was not sent from your linked wallet.",
      403
    );
    assert(
      onchainTransaction.to?.toLowerCase() ===
        transaction.coin_address.toLowerCase(),
      "This transfer does not match the creator coin contract.",
      409
    );
    assert(
      decodedCall.functionName === "transfer",
      "This transaction is not a valid creator coin transfer.",
      409
    );
    assert(
      recipient === normalizedSettlementAddress,
      "This transfer was not sent to the Every1 settlement wallet.",
      409
    );
    assert(
      expectedAmountRaw > 0n,
      "Sell transfer amount is missing from this quote.",
      409
    );
    assert(
      amountRaw === expectedAmountRaw,
      "This transfer amount does not match the quoted sell amount.",
      409
    );

    return {
      amountRaw,
      txHash
    };
  };

  const settleSellTransaction = async ({
    profile,
    transaction,
    transactionHash
  }) => {
    const { txHash } = await validateTransfer({
      profile,
      transaction,
      transactionHash
    });
    const now = new Date().toISOString();
    const transactionMetadata =
      transaction.metadata && typeof transaction.metadata === "object"
        ? transaction.metadata
        : {};

    let creditApplied = false;

    try {
      await insertFiatLedgerEntryIfMissing({
        entry: {
          available_delta_kobo: transaction.net_naira_return_kobo,
          description: "Sell completed",
          entry_kind: "sell_settled",
          metadata: {
            settlementAddress: normalizedSettlementAddress,
            txHash
          },
          profile_id: transaction.profile_id,
          reference_id: transaction.id,
          reference_kind: "sell_transaction",
          wallet_id: transaction.wallet_id
        },
        supabase
      });

      creditApplied = true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Sell credit reconciliation failed.";

      logFiatEvent("sell.credit_entry_failed", {
        error: message,
        profileId: profile.id,
        sellId: transaction.id,
        txHash
      });

      await supabase
        .from("sell_transactions")
        .update({
          error_code: "sell_settlement_reconcile_pending",
          error_message: message,
          metadata: {
            ...transactionMetadata,
            settlementAddress: normalizedSettlementAddress,
            settlementPendingReconciliationAt: now,
            settlementReconciliationError: message,
            transferSettledAt: now,
            transferTxHash: txHash
          },
          zora_trade_hash: txHash
        })
        .eq("id", transaction.id);

      return {
        transaction: {
          ...transaction,
          error_code: "sell_settlement_reconcile_pending",
          error_message: message,
          metadata: {
            ...transactionMetadata,
            settlementAddress: normalizedSettlementAddress,
            settlementPendingReconciliationAt: now,
            settlementReconciliationError: message,
            transferSettledAt: now,
            transferTxHash: txHash
          },
          zora_trade_hash: txHash
        },
        wallet: await getWalletOverviewRow({
          profileId: transaction.profile_id,
          supabase
        })
      };
    }

    let nextTransaction = {
      ...transaction,
      completed_at: now,
      credited_naira_kobo: transaction.net_naira_return_kobo,
      metadata: {
        ...transactionMetadata,
        settlementAddress: normalizedSettlementAddress,
        transferSettledAt: now,
        transferTxHash: txHash
      },
      status: "completed",
      zora_trade_hash: txHash
    };

    try {
      const { data: completedTransaction, error: updateError } = await supabase
        .from("sell_transactions")
        .update({
          completed_at: now,
          credited_naira_kobo: transaction.net_naira_return_kobo,
          metadata: nextTransaction.metadata,
          status: "completed",
          zora_trade_hash: txHash
        })
        .eq("id", transaction.id)
        .select("*")
        .single();

      if (updateError) {
        throw updateError;
      }

      nextTransaction = completedTransaction;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Sell status reconciliation failed.";

      logFiatEvent("sell.status_update_failed", {
        creditApplied,
        error: message,
        profileId: profile.id,
        sellId: transaction.id,
        txHash
      });

      await supabase
        .from("sell_transactions")
        .update({
          error_code: "sell_status_reconcile_pending",
          error_message: message,
          metadata: {
            ...transactionMetadata,
            settlementAddress: normalizedSettlementAddress,
            settlementStatusReconciliationAt: now,
            settlementStatusReconciliationError: message,
            transferSettledAt: now,
            transferTxHash: txHash
          },
          zora_trade_hash: txHash
        })
        .eq("id", transaction.id);

      nextTransaction = {
        ...transaction,
        error_code: "sell_status_reconcile_pending",
        error_message: message,
        metadata: {
          ...transactionMetadata,
          settlementAddress: normalizedSettlementAddress,
          settlementStatusReconciliationAt: now,
          settlementStatusReconciliationError: message,
          transferSettledAt: now,
          transferTxHash: txHash
        },
        zora_trade_hash: txHash
      };
    }

    await createNotification({
      amountNaira: asMoney(transaction.net_naira_return_kobo),
      body: `You sold ${transaction.coin_symbol || "your creator coin"} and your Naira wallet has been credited.`,
      coinAddress: transaction.coin_address,
      coinSymbol: transaction.coin_symbol,
      profileId: profile.id,
      status: nextTransaction.status,
      title:
        nextTransaction.status === "completed"
          ? "Sell completed"
          : "Sell settling",
      txHash
    }).catch((notificationError) => {
      logFiatEvent("sell.notification_failed", {
        error:
          notificationError instanceof Error
            ? notificationError.message
            : "Unknown notification error",
        profileId: profile.id,
        sellId: transaction.id,
        txHash
      });
    });

    await recordReferralTradeRewardIfEligible({
      coinAddress: transaction.coin_address,
      coinSymbol: transaction.coin_symbol || "COIN",
      profileId: profile.id,
      supabase,
      tradeAmountIn: Number(transaction.coin_amount || 0),
      tradeAmountOut: Number(transaction.net_naira_return_kobo || 0) / 100,
      tradeSide: "sell",
      txHash
    }).catch((rewardError) => {
      logFiatEvent("sell.referral_reward_failed", {
        error:
          rewardError instanceof Error
            ? rewardError.message
            : "Unknown referral reward error",
        profileId: profile.id,
        sellId: transaction.id,
        txHash
      });
    });

    if (
      nextTransaction.status === "completed" &&
      telegramServiceRef?.isEnabled()
    ) {
      await telegramServiceRef
        .announceTrade({
          coinAddress: transaction.coin_address,
          coinName: transaction.coin_symbol || "Creator coin",
          coinSymbol: transaction.coin_symbol,
          nairaAmount: asMoney(transaction.net_naira_return_kobo),
          profile,
          source: "naira_sell",
          tokenAmount:
            transaction.coin_amount_raw || transaction.coin_amount || null,
          tradeSide: "sell",
          transactionHash: txHash
        })
        .catch((telegramError) => {
          logFiatEvent("sell.telegram_failed", {
            error:
              telegramError instanceof Error
                ? telegramError.message
                : "Unknown telegram announcement error",
            profileId: profile.id,
            sellId: transaction.id,
            txHash
          });
        });
    }

    logFiatEvent("sell.settlement_completed", {
      creditedNairaKobo: transaction.net_naira_return_kobo,
      profileId: profile.id,
      sellId: transaction.id,
      txHash
    });

    return {
      transaction: nextTransaction,
      wallet: await getWalletOverviewRow({
        profileId: transaction.profile_id,
        supabase
      })
    };
  };

  return {
    isEnabled,
    normalizedSettlementAddress,
    setTelegramService(nextTelegramService) {
      telegramServiceRef = nextTelegramService;
    },
    settleSellTransaction,
    validateTransfer
  };
};
