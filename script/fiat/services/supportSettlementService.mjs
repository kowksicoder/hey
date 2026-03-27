import { tradeCoin } from "@zoralabs/coins-sdk";
import { isAddress, parseEther } from "viem";
import { asMoney, assert } from "../utils.mjs";
import {
  getWalletOverviewRow,
  insertFiatLedgerEntryIfMissing,
  logFiatEvent,
  recordReferralTradeRewardIfEligible
} from "./serviceHelpers.mjs";

const toEthAmountString = (amountNaira, ethNgnPrice) => {
  const ethAmount = amountNaira / ethNgnPrice;
  const normalized = Number.isFinite(ethAmount) ? ethAmount : 0;

  return normalized > 0 ? normalized.toFixed(18) : "0";
};

const buildNotificationPayload = ({
  amountNaira,
  coinAddress,
  coinSymbol,
  status
}) => ({
  amountNaira,
  coinAddress,
  coinSymbol,
  status
});

export const createSupportSettlementService = ({
  executionEnabled = false,
  marketPriceClient,
  platformAccount = null,
  publicClient = null,
  supabase,
  telegramService = null,
  walletClient = null
}) => {
  let telegramServiceRef = telegramService;
  const resolveExecutionWalletAddress = (profile, transaction) =>
    transaction.metadata?.recipientWalletAddress ||
    transaction.metadata?.walletAddress ||
    profile.execution_wallet_address ||
    profile.wallet_address;

  const isEnabled = () =>
    Boolean(
      executionEnabled &&
        marketPriceClient &&
        platformAccount &&
        walletClient &&
        publicClient &&
        supabase
    );

  const createNotification = async ({
    amountNaira,
    status,
    coinAddress,
    coinSymbol,
    profileId,
    title,
    body
  }) => {
    const { error } = await supabase.from("notifications").insert({
      actor_id: null,
      body,
      data: buildNotificationPayload({
        amountNaira,
        coinAddress,
        coinSymbol,
        status
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

  const finalizeSupportSettlement = async ({
    ethNgnPrice,
    profile,
    recipientWalletAddress,
    settledEthAmount,
    transaction,
    txHash
  }) => {
    const now = new Date().toISOString();
    const transactionMetadata =
      transaction.metadata && typeof transaction.metadata === "object"
        ? transaction.metadata
        : {};
    let nextTransaction = {
      ...transaction,
      completed_at: now,
      metadata: {
        ...transactionMetadata,
        recipientWalletAddress,
        settledAt: now,
        settledEthAmount,
        settlementEthNgnPrice: ethNgnPrice,
        txHash
      },
      status: "completed",
      zora_trade_hash: txHash
    };

    try {
      const { data: completedTransaction, error: updateError } = await supabase
        .from("support_transactions")
        .update({
          completed_at: now,
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
          : "Buy trade settlement reconciliation failed.";

      logFiatEvent("support.settlement_update_failed", {
        error: message,
        profileId: profile.id,
        supportId: transaction.id,
        txHash
      });

      const reconciliationMetadata = {
        ...transactionMetadata,
        recipientWalletAddress,
        settledAt: now,
        settledEthAmount,
        settlementEthNgnPrice: ethNgnPrice,
        settlementPendingReconciliationAt: now,
        settlementReconciliationError: message,
        txHash
      };

      await supabase
        .from("support_transactions")
        .update({
          error_code: "support_settlement_reconcile_pending",
          error_message: message,
          metadata: reconciliationMetadata,
          processing_at: now,
          status: "processing",
          zora_trade_hash: txHash
        })
        .eq("id", transaction.id);

      nextTransaction = {
        ...transaction,
        error_code: "support_settlement_reconcile_pending",
        error_message: message,
        metadata: reconciliationMetadata,
        processing_at: now,
        status: "processing",
        zora_trade_hash: txHash
      };
    }

    try {
      await insertFiatLedgerEntryIfMissing({
        entry: {
          description: "Buy trade completed",
          entry_kind: "support_commit",
          locked_delta_kobo: -transaction.total_kobo,
          metadata: {
            recipientWalletAddress,
            txHash
          },
          profile_id: transaction.profile_id,
          reference_id: transaction.id,
          reference_kind: "support_transaction",
          wallet_id: transaction.wallet_id
        },
        supabase
      });
    } catch (error) {
      logFiatEvent("support.commit_entry_failed", {
        error:
          error instanceof Error
            ? error.message
            : "Unknown commit entry failure",
        profileId: profile.id,
        supportId: transaction.id,
        txHash
      });
    }

    await createNotification({
      amountNaira: asMoney(transaction.naira_amount_kobo),
      body: `You bought ${coinLabel(
        transaction
      )} successfully and the coins were sent to your wallet.`,
      coinAddress: transaction.coin_address,
      coinSymbol: transaction.coin_symbol,
      profileId: profile.id,
      status: nextTransaction.status,
      title:
        nextTransaction.status === "completed"
          ? "Buy trade completed"
          : "Buy trade settling"
    }).catch((notificationError) => {
      logFiatEvent("support.notification_failed", {
        error:
          notificationError instanceof Error
            ? notificationError.message
            : "Unknown notification error",
        profileId: profile.id,
        supportId: transaction.id
      });
    });

    await recordReferralTradeRewardIfEligible({
      coinAddress: transaction.coin_address,
      coinSymbol: transaction.coin_symbol || coinLabel(transaction),
      profileId: profile.id,
      supabase,
      tradeAmountIn: Number(settledEthAmount || 0),
      tradeAmountOut: Number(transaction.estimated_coin_amount || 0),
      tradeSide: "buy",
      txHash
    }).catch((rewardError) => {
      logFiatEvent("support.referral_reward_failed", {
        error:
          rewardError instanceof Error
            ? rewardError.message
            : "Unknown referral reward error",
        profileId: profile.id,
        supportId: transaction.id,
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
          coinName: transaction.coin_symbol || coinLabel(transaction),
          coinSymbol: transaction.coin_symbol,
          nairaAmount: asMoney(transaction.naira_amount_kobo),
          profile,
          source: "naira_buy",
          tokenAmount:
            transaction.estimated_coin_amount_raw ||
            transaction.estimated_coin_amount ||
            null,
          tradeSide: "buy",
          transactionHash: txHash
        })
        .catch((telegramError) => {
          logFiatEvent("support.telegram_failed", {
            error:
              telegramError instanceof Error
                ? telegramError.message
                : "Unknown telegram announcement error",
            profileId: profile.id,
            supportId: transaction.id,
            txHash
          });
        });
    }

    logFiatEvent("support.settlement_completed", {
      ethNgnPrice,
      profileId: profile.id,
      supportId: transaction.id,
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

  const markSupportFailed = async ({ errorMessage, profile, transaction }) => {
    const now = new Date().toISOString();
    const transactionMetadata =
      transaction.metadata && typeof transaction.metadata === "object"
        ? transaction.metadata
        : {};

    await supabase
      .from("support_transactions")
      .update({
        error_code: "support_settlement_failed",
        error_message: errorMessage,
        failed_at: now,
        metadata: {
          ...transactionMetadata,
          settlementFailedAt: now
        },
        status: "failed"
      })
      .eq("id", transaction.id);

    await insertFiatLedgerEntryIfMissing({
      entry: {
        available_delta_kobo: transaction.total_kobo,
        description: "Support funds returned",
        entry_kind: "support_release",
        locked_delta_kobo: -transaction.total_kobo,
        metadata: {
          reason: errorMessage
        },
        profile_id: transaction.profile_id,
        reference_id: transaction.id,
        reference_kind: "support_transaction",
        wallet_id: transaction.wallet_id
      },
      supabase
    });

    await createNotification({
      amountNaira: asMoney(transaction.naira_amount_kobo),
      body: `We couldn't complete your ${coinLabel(
        transaction
      )} buy trade right now. Your Naira balance has been returned.`,
      coinAddress: transaction.coin_address,
      coinSymbol: transaction.coin_symbol,
      profileId: profile.id,
      status: "failed",
      title: "Buy trade returned"
    }).catch((notificationError) => {
      logFiatEvent("support.notification_failed", {
        error:
          notificationError instanceof Error
            ? notificationError.message
            : "Unknown notification error",
        profileId: profile.id,
        supportId: transaction.id
      });
    });

    logFiatEvent("support.settlement_failed", {
      error: errorMessage,
      profileId: profile.id,
      supportId: transaction.id
    });
  };

  const coinLabel = (transaction) =>
    transaction.coin_symbol || transaction.coin_address || "creator";

  const settleSupportTransaction = async ({ profile, transaction }) => {
    assert(
      isEnabled(),
      "Fiat buy trade settlement is not configured on this server.",
      503
    );

    const recipientWalletAddress = resolveExecutionWalletAddress(
      profile,
      transaction
    );

    assert(
      recipientWalletAddress && isAddress(recipientWalletAddress),
      "A valid recipient wallet is required for buy trade settlement.",
      400
    );

    assert(
      transaction.coin_address && isAddress(transaction.coin_address),
      "A valid creator coin address is required for buy trade settlement.",
      400
    );

    const ethNgnPrice = await marketPriceClient.getEthNgnPrice();
    const amountNaira = transaction.naira_amount_kobo / 100;
    const amountIn = parseEther(toEthAmountString(amountNaira, ethNgnPrice));
    assert(amountIn > 0n, "Trade amount is too small to settle onchain.", 400);

    const platformBalance = await publicClient.getBalance({
      address: platformAccount.address
    });
    assert(
      platformBalance >= amountIn,
      "Platform liquidity is not available for this buy trade right now.",
      503
    );

    let receipt = null;

    try {
      receipt = await tradeCoin({
        account: platformAccount,
        publicClient,
        tradeParameters: {
          amountIn,
          buy: { address: transaction.coin_address, type: "erc20" },
          recipient: recipientWalletAddress,
          sell: { type: "eth" },
          sender: platformAccount.address,
          slippage: 0.1
        },
        validateTransaction: false,
        walletClient
      });
    } catch (error) {
      if (receipt?.transactionHash) {
        throw error;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Support settlement failed unexpectedly.";

      await markSupportFailed({
        errorMessage: message,
        profile,
        transaction
      });

      throw error;
    }

    const settledEthAmount = toEthAmountString(amountNaira, ethNgnPrice);
    return await finalizeSupportSettlement({
      ethNgnPrice,
      profile,
      recipientWalletAddress,
      settledEthAmount,
      transaction,
      txHash: receipt.transactionHash
    });
  };

  const reconcileSupportTransaction = async ({ profile, transaction }) => {
    assert(
      isEnabled(),
      "Fiat buy trade settlement is not configured on this server.",
      503
    );

    const txHash = transaction.zora_trade_hash || transaction.metadata?.txHash;

    assert(txHash, "This buy trade is still waiting for settlement.", 409);

    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash
      });

      if (receipt.status !== "success") {
        const errorMessage =
          "The creator coin buy did not complete successfully. Your Naira balance has been returned.";

        await markSupportFailed({
          errorMessage,
          profile,
          transaction
        });

        return {
          transaction: {
            ...transaction,
            error_code: "support_settlement_failed",
            error_message: errorMessage,
            failed_at: new Date().toISOString(),
            status: "failed"
          },
          wallet: await getWalletOverviewRow({
            profileId: transaction.profile_id,
            supabase
          })
        };
      }
    } catch {
      return {
        transaction,
        wallet: await getWalletOverviewRow({
          profileId: transaction.profile_id,
          supabase
        })
      };
    }

    const recipientWalletAddress = resolveExecutionWalletAddress(
      profile,
      transaction
    );
    assert(
      recipientWalletAddress && isAddress(recipientWalletAddress),
      "A valid recipient wallet is required for buy trade reconciliation.",
      400
    );

    const knownEthNgnPrice = Number(
      transaction.metadata?.settlementEthNgnPrice
    );
    const ethNgnPrice =
      Number.isFinite(knownEthNgnPrice) && knownEthNgnPrice > 0
        ? knownEthNgnPrice
        : await marketPriceClient.getEthNgnPrice();
    const amountNaira = transaction.naira_amount_kobo / 100;
    const settledEthAmount =
      transaction.metadata?.settledEthAmount ||
      toEthAmountString(amountNaira, ethNgnPrice);

    return await finalizeSupportSettlement({
      ethNgnPrice,
      profile,
      recipientWalletAddress,
      settledEthAmount,
      transaction,
      txHash
    });
  };

  return {
    isEnabled,
    reconcileSupportTransaction,
    setTelegramService(nextTelegramService) {
      telegramServiceRef = nextTelegramService;
    },
    settleSupportTransaction
  };
};
