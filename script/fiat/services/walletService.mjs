import { asMoney, assert, createCheckoutReference, toKobo } from "../utils.mjs";
import { createCngnDepositReconciliationService } from "./cngnDepositReconciliationService.mjs";
import {
  getIdempotencyRecord,
  getWalletOverviewRow,
  insertFiatLedgerEntryIfMissing,
  logFiatEvent,
  saveIdempotencyRecord
} from "./serviceHelpers.mjs";

const mapBankAccount = (row) => ({
  accountName: row.account_name,
  accountNumber: row.account_number,
  bankCode: row.bank_code,
  bankName: row.bank_name,
  id: row.id,
  isDefault: Boolean(row.is_default),
  isVerified: Boolean(row.is_verified),
  provider: row.provider
});

const mapWalletSummary = (row) => ({
  availableBalance: asMoney(row.available_balance_kobo),
  availableBalanceKobo: row.available_balance_kobo,
  currency: row.currency,
  id: row.wallet_id,
  lastTransactionAt: row.last_transaction_at,
  lockedBalance: asMoney(row.locked_balance_kobo),
  lockedBalanceKobo: row.locked_balance_kobo,
  pendingBalance: asMoney(row.pending_balance_kobo),
  pendingBalanceKobo: row.pending_balance_kobo,
  profileId: row.profile_id,
  totalBalance: asMoney(row.total_balance_kobo),
  totalBalanceKobo: row.total_balance_kobo
});

const mapWalletTransaction = (row) => ({
  amountNaira: asMoney(row.amount_kobo),
  coinAddress: row.coin_address,
  coinSymbol: row.coin_symbol,
  createdAt: row.created_at,
  direction: row.direction,
  feeNaira: asMoney(row.fee_kobo),
  id: row.transaction_id,
  metadata: row.metadata || {},
  netAmountNaira: asMoney(row.net_amount_kobo),
  status: row.status,
  subtitle: row.subtitle,
  title: row.title,
  type: row.transaction_type,
  updatedAt: row.updated_at
});

const resolveTradeFundingRail = ({
  buyPrincipalModel,
  buySettlementReady,
  cngnConfigured,
  flutterwaveConfigured,
  preferCngnDeposits
}) => {
  if (buyPrincipalModel === "user_backed_cngn" && buySettlementReady) {
    return "cngn";
  }

  if (buyPrincipalModel === "user_backed_cngn") {
    return "every1_wallet";
  }

  if (preferCngnDeposits && cngnConfigured) {
    return "every1_wallet";
  }

  if (flutterwaveConfigured) {
    return "flutterwave";
  }

  return "every1_wallet";
};

const normalizePaymentStatus = (value) => {
  switch (String(value || "").toLowerCase()) {
    case "successful":
    case "completed":
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "processing":
    case "pending":
      return "processing";
    default:
      return "pending";
  }
};

const normalizeWithdrawalStatus = (value) => {
  switch (String(value || "").toLowerCase()) {
    case "successful":
    case "completed":
    case "success":
      return "completed";
    case "failed":
      return "failed";
    case "processing":
    case "pending":
      return "processing";
    default:
      return "pending";
  }
};

const resolveBankAccount = async ({ body, profileId, supabase }) => {
  if (body.bankAccountId) {
    const { data, error } = await supabase
      .from("fiat_bank_accounts")
      .select("*")
      .eq("id", body.bankAccountId)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    assert(data, "Selected bank account was not found.", 404);
    return data;
  }

  assert(body.bankCode, "bankCode is required for withdrawal.", 400);
  assert(body.bankName, "bankName is required for withdrawal.", 400);
  assert(body.accountNumber, "accountNumber is required for withdrawal.", 400);

  const { data, error } = await supabase
    .from("fiat_bank_accounts")
    .upsert(
      {
        account_name: body.accountName || null,
        account_number: String(body.accountNumber).trim(),
        bank_code: String(body.bankCode).trim(),
        bank_name: String(body.bankName).trim(),
        is_default: body.makeDefault !== false,
        profile_id: profileId,
        provider: "flutterwave"
      },
      {
        onConflict: "profile_id,provider,bank_code,account_number"
      }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const createWalletService = ({
  appOrigin,
  cngn = null,
  flutterwave,
  flutterwaveConfigured,
  flutterwaveInlineConfigured = false,
  preferCngnDeposits = false,
  requireCngnDeposits = false,
  sellSettlementService = null,
  supportSettlementService = null,
  supabase
}) => {
  const cngnDepositReconciliationService =
    cngn && supabase
      ? createCngnDepositReconciliationService({
          cngn,
          supabase
        })
      : null;

  const getCngnRailSummary = () => {
    const summary = cngn?.getRailSummary?.();

    return (
      summary || {
        configured: false,
        mode: "merchant_rail",
        readStatus: "unconfigured",
        supports: {
          balanceRead: true,
          bankListRead: true,
          transactionHistoryRead: true,
          virtualAccountWriteReady: false,
          walletWithdrawWriteReady: false,
          withdrawToBankWriteReady: false
        }
      }
    );
  };

  const buildTradeFundingState = ({ wallet }) => {
    const cngnRail = getCngnRailSummary();
    const buySettlementReadiness =
      supportSettlementService?.getReadiness?.() || {
        buySettlementMessage: null,
        buySettlementReady: false
      };
    const buyPrincipalModel =
      supportSettlementService?.getPrincipalModel?.() || "every1_wallet_ledger";

    return {
      availableBalance: asMoney(wallet.available_balance_kobo),
      availableBalanceKobo: wallet.available_balance_kobo,
      balanceSource: "every1_wallet_ledger",
      buySettlementMessage: buySettlementReadiness.buySettlementMessage,
      buySettlementReady: buySettlementReadiness.buySettlementReady,
      currency: wallet.currency,
      depositRail:
        requireCngnDeposits ||
        (preferCngnDeposits && cngn?.isRequestEncryptionConfigured)
          ? "cngn_virtual_account"
          : flutterwaveInlineConfigured
            ? "flutterwave_checkout"
            : "internal",
      payoutRail: cngn?.isWriteReady
        ? "cngn"
        : flutterwaveConfigured
          ? "flutterwave"
          : "internal",
      principalModel: buyPrincipalModel,
      rails: {
        cngn: cngnRail
      },
      tradeFundingRail: resolveTradeFundingRail({
        buyPrincipalModel,
        buySettlementReady: buySettlementReadiness.buySettlementReady,
        cngnConfigured: Boolean(cngnRail.configured),
        flutterwaveConfigured: flutterwaveInlineConfigured,
        preferCngnDeposits
      })
    };
  };

  const getSettlementProfile = async (profileId) => {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, username, display_name, wallet_address, execution_wallet_address"
      )
      .eq("id", profileId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    assert(data?.id, "Profile was not found.", 404);

    return data;
  };

  const getCngnRailStatus = async () => {
    const snapshot = await cngn?.getRailSnapshot?.();

    return (
      snapshot || {
        checkedAt: new Date().toISOString(),
        configured: false,
        merchant: null,
        mode: "merchant_rail",
        readStatus: "unconfigured",
        supports: getCngnRailSummary().supports
      }
    );
  };

  const listCngnBanks = async () => {
    const banks = await cngn?.getBankList?.();
    assert(
      banks,
      "cNGN bank list is not configured. Add the cNGN API key and private key first.",
      503
    );

    return {
      banks
    };
  };

  const createCngnVirtualAccount = async ({ body, profileId }) => {
    const idempotencyKey = body.idempotencyKey || null;
    const existing = await getIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      scope: "wallet.cngn.virtual-account",
      supabase
    });

    if (existing?.response_body && existing.response_status) {
      return {
        payload: existing.response_body,
        statusCode: existing.response_status
      };
    }

    const account = await cngn?.createVirtualAccount?.({
      provider: body.provider || "korapay"
    });

    assert(
      account,
      "cNGN virtual accounts are not configured. Add the cNGN keys first.",
      503
    );

    const payload = {
      account,
      message: "cNGN virtual account created successfully.",
      success: true
    };

    await saveIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      responseBody: payload,
      responseStatus: 200,
      scope: "wallet.cngn.virtual-account",
      supabase
    });

    logFiatEvent("wallet.cngn_virtual_account_created", {
      accountNumber:
        typeof account.accountNumber === "string"
          ? `${account.accountNumber.slice(0, 2)}***${account.accountNumber.slice(-2)}`
          : null,
      profileId
    });

    return {
      payload,
      statusCode: 200
    };
  };

  const redeemWithCngn = async ({ body, profileId }) => {
    const idempotencyKey = body.idempotencyKey || null;
    const existing = await getIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      scope: "wallet.cngn.redeem",
      supabase
    });

    if (existing?.response_body && existing.response_status) {
      return {
        payload: existing.response_body,
        statusCode: existing.response_status
      };
    }

    assert(body.amount, "amount is required.", 400);
    assert(body.bankCode, "bankCode is required.", 400);
    assert(body.accountNumber, "accountNumber is required.", 400);

    const redemption = await cngn?.redeemAsset?.({
      accountNumber: body.accountNumber,
      amount: body.amount,
      bankCode: body.bankCode,
      saveDetails: body.saveDetails === true
    });

    assert(
      redemption,
      "cNGN redeem is not configured. Add the cNGN encryption key and enable merchant writes when you are ready.",
      503
    );

    const payload = {
      message: "cNGN redeem request submitted.",
      redemption,
      success: true
    };

    await saveIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      responseBody: payload,
      responseStatus: 200,
      scope: "wallet.cngn.redeem",
      supabase
    });

    logFiatEvent("wallet.cngn_redeem_submitted", {
      profileId,
      reference: redemption.reference
    });

    return {
      payload,
      statusCode: 200
    };
  };

  const withdrawWithCngn = async ({ body, profileId }) => {
    const idempotencyKey = body.idempotencyKey || null;
    const existing = await getIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      scope: "wallet.cngn.withdraw",
      supabase
    });

    if (existing?.response_body && existing.response_status) {
      return {
        payload: existing.response_body,
        statusCode: existing.response_status
      };
    }

    assert(body.amount, "amount is required.", 400);
    assert(body.address, "address is required.", 400);
    assert(body.network, "network is required.", 400);

    const withdrawal = await cngn?.withdrawCngn?.({
      address: body.address,
      amount: body.amount,
      network: body.network,
      shouldSaveAddress: body.shouldSaveAddress === true
    });

    assert(
      withdrawal,
      "cNGN wallet withdraw is not configured. Add the cNGN encryption key and enable merchant writes when you are ready.",
      503
    );

    const payload = {
      message: "cNGN wallet withdrawal submitted.",
      success: true,
      withdrawal
    };

    await saveIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      responseBody: payload,
      responseStatus: 200,
      scope: "wallet.cngn.withdraw",
      supabase
    });

    logFiatEvent("wallet.cngn_withdraw_submitted", {
      profileId,
      reference: withdrawal.reference
    });

    return {
      payload,
      statusCode: 200
    };
  };

  const verifyCngnWithdrawal = async ({ transactionRef }) => {
    const withdrawal = await cngn?.verifyWithdrawal?.({
      transactionRef
    });

    assert(
      withdrawal,
      "cNGN withdrawal verification is not configured. Add the cNGN API key and private key first.",
      503
    );

    return {
      success: true,
      withdrawal
    };
  };

  const reconcileCngnDeposits = async ({ profileId }) => {
    assert(
      cngnDepositReconciliationService,
      "cNGN deposit reconciliation is not configured. Add the cNGN API key and private key first.",
      503
    );

    const result = await cngnDepositReconciliationService.syncPendingDeposits({
      profileId
    });

    return {
      message:
        result.succeeded > 0
          ? "cNGN deposit completed."
          : result.processing > 0
            ? "cNGN deposit detected and is still processing."
            : result.failed > 0
              ? "A cNGN deposit update failed."
              : "No new cNGN deposit updates were found.",
      success: true,
      sync: result
    };
  };

  const syncPendingDeposits = async ({ profileId }) => {
    if (flutterwaveConfigured) {
      const { data: pendingDeposits, error } = await supabase
        .from("payment_transactions")
        .select(
          "id, amount, checkout_reference, fee_amount, metadata, paid_at, profile_id, provider_transaction_id, purpose, status"
        )
        .eq("profile_id", profileId)
        .eq("provider", "flutterwave")
        .eq("purpose", "fiat_wallet_deposit")
        .in("status", ["initiated", "pending", "processing"])
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        throw error;
      }

      for (const payment of pendingDeposits || []) {
        try {
          const verification = await flutterwave.verifyTransactionByReference({
            txRef: payment.checkout_reference
          });
          const nextStatus = normalizePaymentStatus(
            verification.data?.status || verification.raw?.status
          );

          if (nextStatus === "pending") {
            continue;
          }

          const updatePayload = {
            metadata: {
              ...(payment.metadata || {}),
              providerVerification: verification.raw
            },
            paid_at:
              nextStatus === "succeeded"
                ? payment.paid_at || new Date().toISOString()
                : payment.paid_at,
            provider_transaction_id:
              verification.data?.id?.toString() ||
              payment.provider_transaction_id,
            status: nextStatus
          };

          const { error: updateError } = await supabase
            .from("payment_transactions")
            .update(updatePayload)
            .eq("id", payment.id)
            .neq("status", nextStatus);

          if (updateError) {
            throw updateError;
          }

          logFiatEvent("wallet.deposit_status_synced", {
            paymentId: payment.id,
            profileId,
            provider: "flutterwave",
            status: nextStatus
          });
        } catch (syncError) {
          logFiatEvent("wallet.deposit_status_sync_failed", {
            error:
              syncError instanceof Error
                ? syncError.message
                : "Unknown deposit verification error",
            paymentId: payment.id,
            profileId,
            provider: "flutterwave"
          });
        }
      }
    }

    if (!cngnDepositReconciliationService) {
      return;
    }

    try {
      await cngnDepositReconciliationService.syncPendingDeposits({
        profileId
      });
    } catch (syncError) {
      logFiatEvent("wallet.deposit_status_sync_failed", {
        error:
          syncError instanceof Error
            ? syncError.message
            : "Unknown cNGN deposit verification error",
        profileId,
        provider: "cngn"
      });
    }
  };

  const syncProcessingTrades = async ({ profileId }) => {
    const canReconcileSupport = Boolean(
      supportSettlementService?.isEnabled?.()
    );
    const canReconcileSell = Boolean(sellSettlementService?.isEnabled?.());

    const summary = {
      checked: 0,
      completed: 0,
      failed: 0,
      processing: 0
    };

    const countStatus = (status) => {
      switch (String(status || "").toLowerCase()) {
        case "completed":
        case "succeeded":
          summary.completed += 1;
          break;
        case "failed":
          summary.failed += 1;
          break;
        default:
          summary.processing += 1;
      }
    };

    if (!canReconcileSupport && !canReconcileSell) {
      return summary;
    }

    const [
      { data: supportRows, error: supportError },
      { data: sellRows, error: sellError }
    ] = await Promise.all([
      canReconcileSupport
        ? supabase
            .from("support_transactions")
            .select("*")
            .eq("profile_id", profileId)
            .eq("status", "processing")
            .order("processing_at", { ascending: true })
            .limit(12)
        : Promise.resolve({ data: [], error: null }),
      canReconcileSell
        ? supabase
            .from("sell_transactions")
            .select("*")
            .eq("profile_id", profileId)
            .eq("status", "processing")
            .order("created_at", { ascending: true })
            .limit(12)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (supportError) {
      throw supportError;
    }

    if (sellError) {
      throw sellError;
    }

    if (!(supportRows?.length || sellRows?.length)) {
      return summary;
    }

    const profile = await getSettlementProfile(profileId);

    for (const transaction of supportRows || []) {
      summary.checked += 1;
      if (
        !supportSettlementService?.shouldReconcileTransaction?.(transaction)
      ) {
        countStatus(transaction.status);
        continue;
      }

      try {
        const result =
          await supportSettlementService.reconcileSupportTransaction({
            profile,
            transaction
          });
        countStatus(result?.transaction?.status || transaction.status);
      } catch (syncError) {
        countStatus(transaction.status);
        logFiatEvent("wallet.sell_sync_failed", {
          error:
            syncError instanceof Error
              ? syncError.message
              : "Unknown support settlement sync error",
          profileId,
          supportId: transaction.id
        });
      }
    }

    for (const transaction of sellRows || []) {
      summary.checked += 1;
      const txHash =
        transaction.metadata?.transferTxHash ||
        transaction.zora_trade_hash ||
        null;

      if (!txHash) {
        countStatus(transaction.status);
        continue;
      }

      try {
        const result = await sellSettlementService.settleSellTransaction({
          profile,
          transaction,
          transactionHash: txHash
        });
        countStatus(result?.transaction?.status || transaction.status);
      } catch (syncError) {
        countStatus(transaction.status);
        logFiatEvent("wallet.support_sync_failed", {
          error:
            syncError instanceof Error
              ? syncError.message
              : "Unknown sell settlement sync error",
          profileId,
          sellId: transaction.id
        });
      }
    }

    return summary;
  };

  const reconcileTrades = async ({ profileId }) => {
    const sync = await syncProcessingTrades({ profileId });

    return {
      message:
        sync.completed > 0
          ? "Pending trades were refreshed."
          : sync.processing > 0
            ? "Pending trades are still settling."
            : sync.failed > 0
              ? "Some pending trades could not be refreshed yet."
              : "No pending trades were found.",
      success: true,
      sync
    };
  };

  const getTradeFundingState = async ({ profileId, syncDeposits = true }) => {
    if (syncDeposits) {
      await syncPendingDeposits({ profileId });
    }

    const wallet = await getWalletOverviewRow({
      profileId,
      supabase
    });

    return {
      funding: buildTradeFundingState({
        wallet
      }),
      wallet
    };
  };

  const syncProcessingWithdrawals = async ({ profileId }) => {
    if (!flutterwaveConfigured) {
      return;
    }

    const { data: processingWithdrawals, error } = await supabase
      .from("fiat_withdrawals")
      .select("*")
      .eq("profile_id", profileId)
      .in("status", ["pending", "processing"])
      .not("provider_payout_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    for (const withdrawal of processingWithdrawals || []) {
      try {
        const transfer = await flutterwave.getTransfer({
          transferId: withdrawal.provider_payout_id
        });
        const nextStatus = normalizeWithdrawalStatus(
          transfer.data?.status || transfer.raw?.status
        );

        if (nextStatus === "processing" || nextStatus === "pending") {
          if (withdrawal.status !== "processing") {
            const { error: processingError } = await supabase
              .from("fiat_withdrawals")
              .update({
                metadata: {
                  ...(withdrawal.metadata || {}),
                  providerVerification: transfer.raw
                },
                processing_at:
                  withdrawal.processing_at || new Date().toISOString(),
                status: "processing"
              })
              .eq("id", withdrawal.id);

            if (processingError) {
              throw processingError;
            }
          }

          continue;
        }

        if (nextStatus === "completed") {
          const { error: updateError } = await supabase
            .from("fiat_withdrawals")
            .update({
              completed_at: withdrawal.completed_at || new Date().toISOString(),
              metadata: {
                ...(withdrawal.metadata || {}),
                providerVerification: transfer.raw
              },
              status: "completed"
            })
            .eq("id", withdrawal.id)
            .neq("status", "completed");

          if (updateError) {
            throw updateError;
          }

          await insertFiatLedgerEntryIfMissing({
            entry: {
              description: "Withdrawal completed",
              entry_kind: "withdrawal_commit",
              locked_delta_kobo: -withdrawal.amount_kobo,
              metadata: {
                providerVerification: transfer.raw
              },
              profile_id: withdrawal.profile_id,
              reference_id: withdrawal.id,
              reference_kind: "fiat_withdrawal",
              wallet_id: withdrawal.wallet_id
            },
            supabase
          });
        }

        if (nextStatus === "failed") {
          const failureReason =
            transfer.data?.complete_message ||
            transfer.raw?.message ||
            "Withdrawal failed.";

          const { error: updateError } = await supabase
            .from("fiat_withdrawals")
            .update({
              failed_at: withdrawal.failed_at || new Date().toISOString(),
              failure_reason: failureReason,
              metadata: {
                ...(withdrawal.metadata || {}),
                providerVerification: transfer.raw
              },
              status: "failed"
            })
            .eq("id", withdrawal.id)
            .neq("status", "failed");

          if (updateError) {
            throw updateError;
          }

          await insertFiatLedgerEntryIfMissing({
            entry: {
              available_delta_kobo: withdrawal.amount_kobo,
              description: "Withdrawal funds returned",
              entry_kind: "withdrawal_release",
              locked_delta_kobo: -withdrawal.amount_kobo,
              metadata: {
                providerVerification: transfer.raw
              },
              profile_id: withdrawal.profile_id,
              reference_id: withdrawal.id,
              reference_kind: "fiat_withdrawal",
              wallet_id: withdrawal.wallet_id
            },
            supabase
          });
        }

        logFiatEvent("wallet.withdrawal_status_synced", {
          profileId,
          status: nextStatus,
          withdrawalId: withdrawal.id
        });
      } catch (syncError) {
        logFiatEvent("wallet.withdrawal_status_sync_failed", {
          error:
            syncError instanceof Error
              ? syncError.message
              : "Unknown withdrawal verification error",
          profileId,
          withdrawalId: withdrawal.id
        });
      }
    }
  };

  const getWallet = async ({ profileId }) => {
    await Promise.all([
      syncPendingDeposits({ profileId }),
      syncProcessingTrades({ profileId }),
      syncProcessingWithdrawals({ profileId })
    ]);

    const [
      { data: walletRows, error: walletError },
      { data: bankRows, error: bankError }
    ] = await Promise.all([
      supabase.rpc("get_fiat_wallet_overview", {
        input_profile_id: profileId
      }),
      supabase
        .from("fiat_bank_accounts")
        .select("*")
        .eq("profile_id", profileId)
        .order("is_default", { ascending: false })
        .order("updated_at", { ascending: false })
    ]);

    if (walletError) {
      throw walletError;
    }

    if (bankError) {
      throw bankError;
    }

    assert(walletRows?.[0], "Fiat wallet was not found.", 404);

    return {
      banks: (bankRows || []).map(mapBankAccount),
      providers: {
        paymentConfigured: requireCngnDeposits
          ? Boolean(cngn?.isRequestEncryptionConfigured)
          : flutterwaveInlineConfigured ||
            Boolean(cngn?.isRequestEncryptionConfigured),
        payoutConfigured: flutterwaveConfigured || Boolean(cngn?.isWriteReady),
        rails: {
          cngn: getCngnRailSummary()
        }
      },
      wallet: mapWalletSummary(walletRows?.[0])
    };
  };

  const listTransactions = async ({ limit, profileId }) => {
    await Promise.all([
      syncPendingDeposits({ profileId }),
      syncProcessingTrades({ profileId }),
      syncProcessingWithdrawals({ profileId })
    ]);

    const { data, error } = await supabase.rpc(
      "list_fiat_wallet_transactions",
      {
        input_limit: limit,
        input_profile_id: profileId
      }
    );

    if (error) {
      throw error;
    }

    return {
      transactions: (data || []).map(mapWalletTransaction)
    };
  };

  const initiateDeposit = async ({ body, profileId }) => {
    const amountKobo = toKobo(body.amountNaira);
    assert(amountKobo, "A valid deposit amount is required.");

    const idempotencyKey = body.idempotencyKey || null;
    const existing = await getIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      scope: "wallet.deposit.initiate",
      supabase
    });

    if (existing?.response_body && existing.response_status) {
      return {
        payload: existing.response_body,
        statusCode: existing.response_status
      };
    }

    assert(
      !requireCngnDeposits || cngn?.isRequestEncryptionConfigured,
      "cNGN virtual account deposits are selected, but cNGN is not fully configured yet. Add the cNGN API key, private key, and encryption key first.",
      503
    );

    const useCngnDepositRail = Boolean(
      (requireCngnDeposits || preferCngnDeposits) &&
        cngn?.isRequestEncryptionConfigured
    );
    const checkoutReference = createCheckoutReference("wallet");
    let payload;

    if (useCngnDepositRail) {
      const virtualAccount = await cngn.createVirtualAccount({
        provider: body.provider || "korapay"
      });
      const { data, error } = await supabase
        .from("payment_transactions")
        .insert({
          amount: amountKobo / 100,
          checkout_reference:
            virtualAccount.accountReference || checkoutReference,
          currency: "NGN",
          customer_email: body.email || null,
          customer_name: body.name || null,
          customer_phone: body.phone || null,
          fee_amount: 0,
          idempotency_key: idempotencyKey,
          metadata: {
            depositRail: "cngn_virtual_account",
            providerLabel: "cNGN virtual account",
            virtualAccount
          },
          profile_id: profileId,
          provider: "cngn",
          purpose: "fiat_wallet_deposit",
          status: "initiated"
        })
        .select(
          "id, amount, checkout_reference, checkout_url, checkout_expires_at, currency, provider, status"
        )
        .single();

      if (error) {
        throw error;
      }

      payload = {
        message: "Deposit account created successfully.",
        success: true,
        transaction: {
          amountNaira: Number(data.amount),
          checkoutReference: data.checkout_reference,
          checkoutUrl: data.checkout_url,
          currency: data.currency,
          expiresAt: data.checkout_expires_at,
          id: data.id,
          provider: data.provider,
          status: data.status
        },
        virtualAccount: {
          accountNumber: virtualAccount.accountNumber,
          accountReference: virtualAccount.accountReference,
          provider: "cngn"
        }
      };
    } else {
      assert(
        flutterwaveInlineConfigured,
        "Deposit is not configured yet. Add the Flutterwave public key or enable cNGN virtual account deposits.",
        503
      );
      assert(body.email, "Customer email is required to start a deposit.");

      const redirectUrl =
        body.redirectUrl?.trim() || `${appOrigin.replace(/\/+$/, "")}/wallet`;
      const flutterwavePublicKey = flutterwave?.getPublicKey?.();

      assert(
        flutterwavePublicKey,
        "Flutterwave inline checkout is not configured yet.",
        503
      );

      const { data, error } = await supabase
        .from("payment_transactions")
        .insert({
          amount: amountKobo / 100,
          callback_url: redirectUrl,
          checkout_expires_at: null,
          checkout_reference: checkoutReference,
          checkout_url: null,
          currency: "NGN",
          customer_email: body.email,
          customer_name: body.name || null,
          customer_phone: body.phone || null,
          fee_amount: 0,
          idempotency_key: idempotencyKey,
          metadata: {
            checkoutMode: "inline"
          },
          profile_id: profileId,
          provider: "flutterwave",
          purpose: "fiat_wallet_deposit",
          status: "initiated"
        })
        .select(
          "id, amount, checkout_reference, checkout_url, checkout_expires_at, currency, provider, status"
        )
        .single();

      if (error) {
        throw error;
      }

      payload = {
        checkout: {
          amountNaira: Number(data.amount),
          currency: data.currency,
          customer: {
            email: body.email,
            name: body.name || null,
            phoneNumber: body.phone || null
          },
          mode: "inline",
          publicKey: flutterwavePublicKey,
          redirectUrl,
          txRef: data.checkout_reference
        },
        message: "Deposit initiated successfully.",
        success: true,
        transaction: {
          amountNaira: Number(data.amount),
          checkoutReference: data.checkout_reference,
          checkoutUrl: data.checkout_url,
          currency: data.currency,
          expiresAt: data.checkout_expires_at,
          id: data.id,
          provider: data.provider,
          status: data.status
        }
      };
    }

    await saveIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      responseBody: payload,
      responseStatus: 200,
      scope: "wallet.deposit.initiate",
      supabase
    });

    return {
      payload,
      statusCode: 200
    };
  };

  const withdraw = async ({ body, profileId }) => {
    assert(
      flutterwaveConfigured,
      "Flutterwave payout is not configured yet. Add the Flutterwave key to enable withdrawals.",
      503
    );

    const idempotencyKey = body.idempotencyKey || null;
    const existing = await getIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      scope: "wallet.withdraw",
      supabase
    });

    if (existing?.response_body && existing.response_status) {
      return {
        payload: existing.response_body,
        statusCode: existing.response_status
      };
    }

    const amountKobo = toKobo(body.amountNaira);
    assert(amountKobo, "A valid withdrawal amount is required.");

    const { data: walletRows, error: walletError } = await supabase.rpc(
      "get_fiat_wallet_overview",
      {
        input_profile_id: profileId
      }
    );

    if (walletError) {
      throw walletError;
    }

    const wallet = mapWalletSummary(walletRows?.[0]);
    assert(wallet, "Fiat wallet was not found.", 404);
    assert(
      wallet.availableBalanceKobo >= amountKobo,
      "Insufficient available balance.",
      409
    );

    const bankAccount = await resolveBankAccount({ body, profileId, supabase });
    const reference = createCheckoutReference("withdraw");

    const { data: withdrawal, error: withdrawalError } = await supabase
      .from("fiat_withdrawals")
      .insert({
        amount_kobo: amountKobo,
        bank_account_id: bankAccount.id,
        fee_kobo: 0,
        idempotency_key: idempotencyKey,
        metadata: {},
        net_amount_kobo: amountKobo,
        profile_id: profileId,
        provider: "flutterwave",
        reference,
        wallet_id: wallet.id
      })
      .select("*")
      .single();

    if (withdrawalError) {
      throw withdrawalError;
    }

    try {
      const { error: holdError } = await supabase
        .from("fiat_wallet_ledger_entries")
        .insert({
          available_delta_kobo: -amountKobo,
          description: "Withdrawal funds locked",
          entry_kind: "withdrawal_hold",
          locked_delta_kobo: amountKobo,
          metadata: {
            bankAccountId: bankAccount.id
          },
          profile_id: profileId,
          reference_id: withdrawal.id,
          reference_kind: "fiat_withdrawal",
          wallet_id: wallet.id
        });

      if (holdError) {
        throw holdError;
      }

      const transfer = await flutterwave.createTransfer({
        accountBank: bankAccount.bank_code,
        accountNumber: bankAccount.account_number,
        amountNaira: amountKobo / 100,
        narration: body.narration || "Every1 withdrawal",
        reference
      });

      const { error: updateError } = await supabase
        .from("fiat_withdrawals")
        .update({
          metadata: {
            providerResponse: transfer.raw
          },
          processing_at: new Date().toISOString(),
          provider_payout_id: transfer.providerPayoutId,
          reference: transfer.reference,
          status: "processing"
        })
        .eq("id", withdrawal.id);

      if (updateError) {
        throw updateError;
      }
    } catch (error) {
      const { error: releaseError } = await supabase
        .from("fiat_wallet_ledger_entries")
        .insert({
          available_delta_kobo: amountKobo,
          description: "Withdrawal lock released",
          entry_kind: "withdrawal_release",
          locked_delta_kobo: -amountKobo,
          metadata: {},
          profile_id: profileId,
          reference_id: withdrawal.id,
          reference_kind: "fiat_withdrawal",
          wallet_id: wallet.id
        });

      if (releaseError) {
        throw releaseError;
      }

      await supabase
        .from("fiat_withdrawals")
        .update({
          failed_at: new Date().toISOString(),
          failure_reason:
            error instanceof Error ? error.message : "Withdrawal failed.",
          status: "failed"
        })
        .eq("id", withdrawal.id);

      throw error;
    }

    const payload = {
      message: "Withdrawal is processing.",
      success: true,
      withdrawal: {
        amountNaira: asMoney(amountKobo),
        bankAccount: mapBankAccount(bankAccount),
        id: withdrawal.id,
        status: "processing"
      }
    };

    await saveIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      responseBody: payload,
      responseStatus: 200,
      scope: "wallet.withdraw",
      supabase
    });

    return {
      payload,
      statusCode: 200
    };
  };

  return {
    createCngnVirtualAccount,
    getCngnRailStatus,
    getTradeFundingState,
    getWallet,
    initiateDeposit,
    listCngnBanks,
    listTransactions,
    reconcileCngnDeposits,
    reconcileTrades,
    redeemWithCngn,
    verifyCngnWithdrawal,
    withdraw,
    withdrawWithCngn
  };
};
