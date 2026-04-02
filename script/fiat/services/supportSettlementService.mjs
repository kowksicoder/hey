import { createTradeCall, tradeCoin } from "@zoralabs/coins-sdk";
import { erc20Abi, isAddress, maxUint256, parseEther } from "viem";
import { base } from "viem/chains";
import { asMoney, assert } from "../utils.mjs";
import {
  getWalletOverviewRow,
  insertFiatLedgerEntryIfMissing,
  logFiatEvent,
  recordReferralTradeRewardIfEligible
} from "./serviceHelpers.mjs";

const CNGN_BASE_MAINNET_ADDRESS = "0x46C85152bFe9f96829aA94755D9f915F9B10EF5F";
const CNGN_DECIMALS = 18n;
const KOBO_TO_CNGN_RAW_MULTIPLIER = 10n ** (CNGN_DECIMALS - 2n);
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const PERMIT2_ALLOWANCE_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" }
    ],
    name: "allowance",
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" }
    ],
    stateMutability: "view",
    type: "function"
  }
];
const PERMIT_SINGLE_TYPES = {
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" }
  ],
  PermitSingle: [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" }
  ]
};
const normalizeDecimalAmount = (value) => {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "0";
  }

  const [whole = "0", fraction = ""] = normalized.split(".");
  const safeWhole = whole.replace(/^0+(?=\d)/, "") || "0";
  const safeFraction = fraction.replace(/0+$/, "");

  return safeFraction ? `${safeWhole}.${safeFraction}` : safeWhole;
};

const toCngnAmountDisplay = (amountKobo) => {
  const amount = BigInt(Math.max(Number(amountKobo || 0), 0));
  const whole = amount / 100n;
  const fraction = amount % 100n;

  if (fraction === 0n) {
    return whole.toString();
  }

  return normalizeDecimalAmount(
    `${whole.toString()}.${fraction.toString().padStart(2, "0")}`
  );
};

const toCngnAmountRaw = (amountKobo) =>
  BigInt(Math.max(Number(amountKobo || 0), 0)) * KOBO_TO_CNGN_RAW_MULTIPLIER;

const convertPermitBigIntToString = (permit) => ({
  ...permit,
  details: {
    ...permit.details,
    amount: `${permit.details.amount}`
  },
  sigDeadline: `${permit.sigDeadline}`
});

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
  buySettlementModel = "user_backed_cngn",
  cngn = null,
  cngnBaseTokenAddress = CNGN_BASE_MAINNET_ADDRESS,
  executionEnabled = false,
  marketPriceClient,
  platformAccount = null,
  publicClient = null,
  supabase,
  telegramService = null,
  walletClient = null
}) => {
  let telegramServiceRef = telegramService;
  const principalModel =
    buySettlementModel === "platform_treasury"
      ? "platform_treasury"
      : "user_backed_cngn";
  const normalizedCngnBaseTokenAddress =
    cngnBaseTokenAddress && isAddress(cngnBaseTokenAddress)
      ? cngnBaseTokenAddress
      : null;
  const settlementExecutorAddress =
    platformAccount?.address && isAddress(platformAccount.address)
      ? platformAccount.address
      : null;
  const resolveExecutionWalletAddress = (profile, transaction) =>
    transaction.metadata?.recipientWalletAddress ||
    transaction.metadata?.walletAddress ||
    profile.execution_wallet_address ||
    profile.wallet_address;
  const getTransactionMetadata = (transaction) =>
    transaction.metadata && typeof transaction.metadata === "object"
      ? transaction.metadata
      : {};
  const isCngnReady = () =>
    Boolean(
      executionEnabled &&
        cngn?.isWriteReady &&
        settlementExecutorAddress &&
        walletClient &&
        publicClient &&
        supabase &&
        normalizedCngnBaseTokenAddress
    );

  const isEnabled = () =>
    Boolean(
      principalModel === "user_backed_cngn"
        ? isCngnReady()
        : principalModel === "platform_treasury" &&
            executionEnabled &&
            marketPriceClient &&
            platformAccount &&
            walletClient &&
            publicClient &&
            supabase
    );

  const getReadiness = () => {
    if (principalModel === "user_backed_cngn") {
      return {
        buySettlementMessage: isCngnReady()
          ? null
          : "User-funded cNGN settlement is not configured yet on this server.",
        buySettlementReady: isCngnReady()
      };
    }

    if (!isEnabled()) {
      return {
        buySettlementMessage:
          "Platform-funded settlement is configured off on this server.",
        buySettlementReady: false
      };
    }

    return {
      buySettlementMessage: null,
      buySettlementReady: true
    };
  };
  const shouldReconcileTransaction = (transaction) => {
    if (String(transaction?.status || "").toLowerCase() !== "processing") {
      return false;
    }

    const metadata = getTransactionMetadata(transaction);

    if (principalModel === "user_backed_cngn") {
      return Boolean(
        transaction.zora_trade_hash ||
          metadata.txHash ||
          metadata.cngnWithdrawalReference ||
          metadata.executionStage
      );
    }

    return Boolean(transaction.zora_trade_hash || metadata.txHash);
  };
  const buildCngnSettlementSummary = (transaction, metadata) => ({
    cngnWithdrawalExternalHash: metadata.cngnWithdrawalExternalHash || null,
    cngnWithdrawalReference: metadata.cngnWithdrawalReference || null,
    cngnWithdrawalTransactionHash:
      metadata.cngnWithdrawalTransactionHash || null,
    network: "base",
    principalAmount: toCngnAmountDisplay(transaction.naira_amount_kobo),
    principalAmountRaw: toCngnAmountRaw(
      transaction.naira_amount_kobo
    ).toString(),
    principalAsset: "CNGN",
    principalModel,
    settlementWalletAddress: settlementExecutorAddress,
    tokenAddress: normalizedCngnBaseTokenAddress,
    tradeFundingRail: "cngn"
  });

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
  const updateSupportTransaction = async ({
    metadataPatch = {},
    select = true,
    transaction,
    updates = {}
  }) => {
    const nextMetadata = {
      ...getTransactionMetadata(transaction),
      ...metadataPatch
    };
    const query = supabase
      .from("support_transactions")
      .update({
        ...updates,
        metadata: nextMetadata
      })
      .eq("id", transaction.id);

    if (!select) {
      const { error } = await query;

      if (error) {
        throw error;
      }

      return {
        ...transaction,
        ...updates,
        metadata: nextMetadata
      };
    }

    const { data, error } = await query.select("*").single();

    if (error) {
      throw error;
    }

    return data;
  };
  const getMerchantCngnBalance = async () => {
    const balances = await cngn.getBalance();
    const cngnBalance = balances.find(
      (entry) => String(entry.assetCode || "").toUpperCase() === "CNGN"
    );

    return Number.parseFloat(String(cngnBalance?.balance || "0")) || 0;
  };
  const getSettlementWalletCngnBalanceRaw = async () =>
    await publicClient.readContract({
      abi: erc20Abi,
      address: normalizedCngnBaseTokenAddress,
      args: [settlementExecutorAddress],
      functionName: "balanceOf"
    });
  const signTradePermits = async ({ account, quote }) => {
    const signatures = [];

    if (!quote?.permits?.length) {
      return signatures;
    }

    for (const permit of quote.permits) {
      const [, , nonce] = await publicClient.readContract({
        abi: PERMIT2_ALLOWANCE_ABI,
        address: PERMIT2_ADDRESS,
        args: [
          account.address,
          permit.permit.details.token,
          permit.permit.spender
        ],
        functionName: "allowance"
      });
      const permitToken = permit.permit.details.token;
      const allowance = await publicClient.readContract({
        abi: erc20Abi,
        address: permitToken,
        args: [account.address, PERMIT2_ADDRESS],
        functionName: "allowance"
      });

      if (allowance < BigInt(permit.permit.details.amount)) {
        const approvalTx = await walletClient.writeContract({
          abi: erc20Abi,
          account,
          address: permitToken,
          args: [PERMIT2_ADDRESS, maxUint256],
          chain: base,
          functionName: "approve"
        });

        await publicClient.waitForTransactionReceipt({
          hash: approvalTx
        });
      }

      const message = {
        details: {
          amount: BigInt(permit.permit.details.amount),
          expiration: Number(permit.permit.details.expiration),
          nonce,
          token: permit.permit.details.token
        },
        sigDeadline: BigInt(permit.permit.sigDeadline),
        spender: permit.permit.spender
      };
      const signature = await walletClient.signTypedData({
        account,
        domain: {
          chainId: base.id,
          name: "Permit2",
          verifyingContract: PERMIT2_ADDRESS
        },
        message,
        primaryType: "PermitSingle",
        types: PERMIT_SINGLE_TYPES
      });

      signatures.push({
        permit: convertPermitBigIntToString(message),
        signature
      });
    }

    return signatures;
  };
  const submitCngnTrade = async ({
    amountIn,
    buyCoinAddress,
    recipientWalletAddress
  }) => {
    const baseTradeParameters = {
      amountIn,
      buy: { address: buyCoinAddress, type: "erc20" },
      recipient: recipientWalletAddress,
      sell: { address: normalizedCngnBaseTokenAddress, type: "erc20" },
      sender: settlementExecutorAddress,
      slippage: 0.1
    };
    const quote = await createTradeCall(baseTradeParameters);
    const signatures = await signTradePermits({
      account: platformAccount,
      quote
    });
    const finalQuote =
      signatures.length > 0
        ? await createTradeCall({
            ...baseTradeParameters,
            signatures
          })
        : quote;
    const call = {
      account: platformAccount,
      chain: base,
      data: finalQuote.call.data,
      to: finalQuote.call.target,
      value: BigInt(finalQuote.call.value || "0")
    };

    await publicClient.call(call);

    const [gasEstimate, gasPrice] = await Promise.all([
      publicClient.estimateGas(call),
      publicClient.getGasPrice()
    ]);

    return await walletClient.sendTransaction({
      ...call,
      gas: gasEstimate,
      gasPrice
    });
  };
  const markSupportRetryPending = async ({
    errorMessage,
    metadataPatch = {},
    profile,
    transaction
  }) => {
    const now = new Date().toISOString();
    const nextTransaction = await updateSupportTransaction({
      metadataPatch: {
        executionStage: "trade_retry_pending",
        lastSettlementError: errorMessage,
        lastSettlementErrorAt: now,
        ...metadataPatch
      },
      transaction,
      updates: {
        error_code: "support_settlement_retry_pending",
        error_message: errorMessage,
        processing_at: now,
        status: "processing"
      }
    });

    logFiatEvent("support.settlement_retry_pending", {
      error: errorMessage,
      profileId: profile.id,
      supportId: transaction.id
    });

    return {
      transaction: nextTransaction,
      wallet: await getWalletOverviewRow({
        profileId: transaction.profile_id,
        supabase
      })
    };
  };

  const finalizeSupportSettlement = async ({
    profile,
    recipientWalletAddress,
    settlementSummary,
    transaction,
    txHash
  }) => {
    const now = new Date().toISOString();
    const transactionMetadata = getTransactionMetadata(transaction);
    let nextTransaction = {
      ...transaction,
      completed_at: now,
      metadata: {
        ...transactionMetadata,
        executionStage: "settlement_completed",
        recipientWalletAddress,
        settledAt: now,
        settlement: settlementSummary,
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
        executionStage: "settlement_reconcile_pending",
        recipientWalletAddress,
        settledAt: now,
        settlement: settlementSummary,
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
      tradeAmountIn: Number(
        settlementSummary?.principalAmount ||
          toCngnAmountDisplay(transaction.naira_amount_kobo)
      ),
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
      principalAsset: settlementSummary?.principalAsset || null,
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

  const markSupportFailed = async ({
    errorMessage,
    metadataPatch = {},
    profile,
    releaseLockedFunds = true,
    transaction
  }) => {
    const now = new Date().toISOString();
    const nextTransaction = {
      ...transaction,
      error_code: "support_settlement_failed",
      error_message: errorMessage,
      failed_at: now,
      metadata: {
        ...getTransactionMetadata(transaction),
        executionStage: releaseLockedFunds
          ? "settlement_failed"
          : "funded_trade_failed",
        settlementFailedAt: now,
        ...metadataPatch
      },
      status: "failed"
    };

    await updateSupportTransaction({
      metadataPatch: nextTransaction.metadata,
      select: false,
      transaction,
      updates: {
        error_code: nextTransaction.error_code,
        error_message: nextTransaction.error_message,
        failed_at: nextTransaction.failed_at,
        status: nextTransaction.status
      }
    });

    if (releaseLockedFunds) {
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
    }

    logFiatEvent("support.settlement_failed", {
      error: errorMessage,
      profileId: profile.id,
      released: releaseLockedFunds,
      supportId: transaction.id
    });

    return {
      transaction: nextTransaction,
      wallet: await getWalletOverviewRow({
        profileId: transaction.profile_id,
        supabase
      })
    };
  };

  const coinLabel = (transaction) =>
    transaction.coin_symbol || transaction.coin_address || "creator";

  const settleWithTreasuryEth = async ({
    profile,
    recipientWalletAddress,
    transaction
  }) => {
    try {
      const ethNgnPrice = await marketPriceClient.getEthNgnPrice();
      const amountNaira = transaction.naira_amount_kobo / 100;
      const amountIn = parseEther(toEthAmountString(amountNaira, ethNgnPrice));
      assert(
        amountIn > 0n,
        "Trade amount is too small to settle onchain.",
        400
      );

      const platformBalance = await publicClient.getBalance({
        address: platformAccount.address
      });
      assert(
        platformBalance >= amountIn,
        "Platform liquidity is not available for this buy trade right now.",
        503
      );

      const receipt = await tradeCoin({
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

      return await finalizeSupportSettlement({
        profile,
        recipientWalletAddress,
        settlementSummary: {
          legacyEthAmount: toEthAmountString(amountNaira, ethNgnPrice),
          principalAmount: toEthAmountString(amountNaira, ethNgnPrice),
          principalAsset: "ETH",
          principalModel,
          settlementEthNgnPrice: ethNgnPrice,
          tradeFundingRail: "platform_treasury"
        },
        transaction,
        txHash: receipt.transactionHash
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Support settlement failed unexpectedly.";

      return await markSupportFailed({
        errorMessage: message,
        metadataPatch: {
          settlement: {
            principalAsset: "ETH",
            principalModel,
            tradeFundingRail: "platform_treasury"
          }
        },
        profile,
        transaction
      });
    }
  };

  const settleWithUserBackedCngn = async ({
    profile,
    recipientWalletAddress,
    transaction
  }) => {
    const metadata = getTransactionMetadata(transaction);
    const cngnAmountDisplay = toCngnAmountDisplay(
      transaction.naira_amount_kobo
    );
    const cngnAmountRaw = toCngnAmountRaw(transaction.naira_amount_kobo);
    const settlementSummary = buildCngnSettlementSummary(transaction, metadata);
    const processingWallet = async () =>
      await getWalletOverviewRow({
        profileId: transaction.profile_id,
        supabase
      });

    if (!metadata.cngnWithdrawalReference) {
      try {
        const merchantBalance = await getMerchantCngnBalance();
        const requiredCngn = Number.parseFloat(cngnAmountDisplay);

        assert(
          merchantBalance >= requiredCngn,
          "User-backed cNGN liquidity is not available for this buy trade right now.",
          503
        );

        const withdrawal = await cngn.withdrawCngn({
          address: settlementExecutorAddress,
          amount: cngnAmountDisplay,
          network: "base",
          shouldSaveAddress: false
        });
        const nextTransaction = await updateSupportTransaction({
          metadataPatch: {
            ...settlementSummary,
            cngnWithdrawalReference: withdrawal.reference,
            executionStage: "cngn_withdrawal_submitted"
          },
          transaction,
          updates: {
            error_code: null,
            error_message: null,
            processing_at: new Date().toISOString(),
            status: "processing"
          }
        });

        return {
          transaction: nextTransaction,
          wallet: await processingWallet()
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "User-backed cNGN settlement could not be started.";

        return await markSupportFailed({
          errorMessage: message,
          metadataPatch: settlementSummary,
          profile,
          transaction
        });
      }
    }

    const withdrawal = await cngn.verifyWithdrawal({
      transactionRef: metadata.cngnWithdrawalReference
    });
    const normalizedWithdrawalStatus = String(
      withdrawal?.status || "pending"
    ).toLowerCase();

    if (normalizedWithdrawalStatus !== "completed") {
      if (normalizedWithdrawalStatus === "failed") {
        const errorMessage =
          "Your cNGN-funded buy could not be completed. Your Naira balance has been returned.";

        await markSupportFailed({
          errorMessage,
          metadataPatch: {
            ...settlementSummary,
            cngnWithdrawalExternalHash: withdrawal.externalTransactionHash,
            cngnWithdrawalReference: metadata.cngnWithdrawalReference,
            cngnWithdrawalStatus: normalizedWithdrawalStatus,
            cngnWithdrawalTransactionHash: withdrawal.transactionHash
          },
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
          wallet: await processingWallet()
        };
      }

      const nextTransaction = await updateSupportTransaction({
        metadataPatch: {
          ...settlementSummary,
          cngnWithdrawalCheckedAt: new Date().toISOString(),
          cngnWithdrawalExternalHash: withdrawal.externalTransactionHash,
          cngnWithdrawalReference: metadata.cngnWithdrawalReference,
          cngnWithdrawalStatus: normalizedWithdrawalStatus,
          cngnWithdrawalTransactionHash: withdrawal.transactionHash,
          executionStage: "cngn_withdrawal_processing"
        },
        transaction,
        updates: {
          processing_at: new Date().toISOString(),
          status: "processing"
        }
      });

      return {
        transaction: nextTransaction,
        wallet: await processingWallet()
      };
    }

    const withdrawalReadyTransaction = await updateSupportTransaction({
      metadataPatch: {
        ...settlementSummary,
        cngnWithdrawalCheckedAt: new Date().toISOString(),
        cngnWithdrawalExplorerLink: withdrawal.explorerLink,
        cngnWithdrawalExternalHash: withdrawal.externalTransactionHash,
        cngnWithdrawalReference: metadata.cngnWithdrawalReference,
        cngnWithdrawalStatus: "completed",
        cngnWithdrawalTransactionHash: withdrawal.transactionHash,
        executionStage: "cngn_withdrawal_completed"
      },
      transaction,
      updates: {
        error_code: null,
        error_message: null,
        processing_at: new Date().toISOString(),
        status: "processing"
      }
    });
    const settlementWalletBalanceRaw =
      await getSettlementWalletCngnBalanceRaw();

    if (settlementWalletBalanceRaw < cngnAmountRaw) {
      const nextTransaction = await updateSupportTransaction({
        metadataPatch: {
          executionStage: "cngn_wallet_funding_pending"
        },
        transaction: withdrawalReadyTransaction,
        updates: {
          processing_at: new Date().toISOString(),
          status: "processing"
        }
      });

      return {
        transaction: nextTransaction,
        wallet: await processingWallet()
      };
    }

    const existingTradeHash =
      withdrawalReadyTransaction.zora_trade_hash ||
      withdrawalReadyTransaction.metadata?.txHash;

    if (!existingTradeHash) {
      let submittedTradeHash = null;

      try {
        submittedTradeHash = await submitCngnTrade({
          amountIn: cngnAmountRaw,
          buyCoinAddress: withdrawalReadyTransaction.coin_address,
          recipientWalletAddress
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The cNGN-funded creator coin buy could not be submitted yet.";

        return await markSupportRetryPending({
          errorMessage: message,
          metadataPatch: {
            ...settlementSummary,
            cngnWithdrawalReference: metadata.cngnWithdrawalReference,
            executionStage: "zora_trade_retry_pending"
          },
          profile,
          transaction: withdrawalReadyTransaction
        });
      }

      const nextTransaction = await updateSupportTransaction({
        metadataPatch: {
          ...settlementSummary,
          cngnWithdrawalReference: metadata.cngnWithdrawalReference,
          executionStage: "zora_trade_submitted",
          txHash: submittedTradeHash
        },
        transaction: withdrawalReadyTransaction,
        updates: {
          error_code: null,
          error_message: null,
          processing_at: new Date().toISOString(),
          status: "processing",
          zora_trade_hash: submittedTradeHash
        }
      });

      return {
        transaction: nextTransaction,
        wallet: await processingWallet()
      };
    }

    return await reconcileSupportTransaction({
      profile,
      transaction: withdrawalReadyTransaction
    });
  };

  const settleSupportTransaction = async ({ profile, transaction }) => {
    assert(
      isEnabled(),
      principalModel === "user_backed_cngn"
        ? "User-funded cNGN settlement is not configured on this server."
        : "Fiat buy trade settlement is not configured on this server.",
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

    return principalModel === "user_backed_cngn"
      ? await settleWithUserBackedCngn({
          profile,
          recipientWalletAddress,
          transaction
        })
      : await settleWithTreasuryEth({
          profile,
          recipientWalletAddress,
          transaction
        });
  };

  const reconcileSupportTransaction = async ({ profile, transaction }) => {
    assert(
      isEnabled(),
      principalModel === "user_backed_cngn"
        ? "User-funded cNGN settlement is not configured on this server."
        : "Fiat buy trade settlement is not configured on this server.",
      503
    );

    if (principalModel === "user_backed_cngn") {
      const metadata = getTransactionMetadata(transaction);
      const txHash = transaction.zora_trade_hash || metadata.txHash;

      if (!txHash) {
        return await settleSupportTransaction({
          profile,
          transaction
        });
      }

      try {
        const receipt = await publicClient.getTransactionReceipt({
          hash: txHash
        });

        if (receipt.status !== "success") {
          const nextTransaction = await updateSupportTransaction({
            metadataPatch: {
              executionStage: "zora_trade_retry_pending",
              lastFailedTradeHash: txHash,
              lastSettlementError:
                "The last creator coin buy transaction failed and is waiting for a retry.",
              lastSettlementErrorAt: new Date().toISOString(),
              txHash: null
            },
            transaction,
            updates: {
              error_code: "support_settlement_retry_pending",
              error_message:
                "The last creator coin buy transaction failed and is waiting for a retry.",
              processing_at: new Date().toISOString(),
              status: "processing",
              zora_trade_hash: null
            }
          });

          return {
            transaction: nextTransaction,
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

      return await finalizeSupportSettlement({
        profile,
        recipientWalletAddress,
        settlementSummary: buildCngnSettlementSummary(
          transaction,
          getTransactionMetadata(transaction)
        ),
        transaction,
        txHash
      });
    }

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
      profile,
      recipientWalletAddress,
      settlementSummary: {
        legacyEthAmount: settledEthAmount,
        principalAmount: settledEthAmount,
        principalAsset: "ETH",
        principalModel,
        settlementEthNgnPrice: ethNgnPrice,
        tradeFundingRail: "platform_treasury"
      },
      transaction,
      txHash
    });
  };

  return {
    getPrincipalModel() {
      return principalModel;
    },
    getReadiness,
    isEnabled,
    reconcileSupportTransaction,
    setTelegramService(nextTelegramService) {
      telegramServiceRef = nextTelegramService;
    },
    settleSupportTransaction,
    shouldReconcileTransaction
  };
};
