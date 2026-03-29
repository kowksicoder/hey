import { asMoney, assert, createCheckoutReference, toKobo } from "../utils.mjs";
import {
  getIdempotencyRecord,
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
  flutterwave,
  flutterwaveConfigured,
  supabase
}) => {
  const syncPendingDeposits = async ({ profileId }) => {
    if (!flutterwaveConfigured) {
      return;
    }

    const { data: pendingDeposits, error } = await supabase
      .from("payment_transactions")
      .select(
        "id, amount, checkout_reference, fee_amount, metadata, paid_at, profile_id, provider_transaction_id, purpose, status"
      )
      .eq("profile_id", profileId)
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
          status: nextStatus
        });
      } catch (syncError) {
        logFiatEvent("wallet.deposit_status_sync_failed", {
          error:
            syncError instanceof Error
              ? syncError.message
              : "Unknown deposit verification error",
          paymentId: payment.id,
          profileId
        });
      }
    }
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
        paymentConfigured: flutterwaveConfigured,
        payoutConfigured: flutterwaveConfigured
      },
      wallet: mapWalletSummary(walletRows?.[0])
    };
  };

  const listTransactions = async ({ limit, profileId }) => {
    await Promise.all([
      syncPendingDeposits({ profileId }),
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
    assert(
      flutterwaveConfigured,
      "Flutterwave is not configured yet. Add the Flutterwave key to enable deposits.",
      503
    );

    const amountKobo = toKobo(body.amountNaira);
    assert(amountKobo, "A valid deposit amount is required.");
    assert(body.email, "Customer email is required to start a deposit.");

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

    const checkoutReference = createCheckoutReference("wallet");
    const redirectUrl =
      body.redirectUrl?.trim() || `${appOrigin.replace(/\/+$/, "")}/wallet`;
    const depositLink = await flutterwave.createDepositPaymentLink({
      amountNaira: amountKobo / 100,
      customer: {
        email: body.email,
        name: body.name || "Every1 user",
        phone: body.phone || null
      },
      redirectUrl,
      txRef: checkoutReference
    });

    const { data, error } = await supabase
      .from("payment_transactions")
      .insert({
        amount: amountKobo / 100,
        callback_url: redirectUrl,
        checkout_expires_at: depositLink.expiresAt,
        checkout_reference: checkoutReference,
        checkout_url: depositLink.checkoutUrl,
        currency: "NGN",
        customer_email: body.email,
        customer_name: body.name || null,
        customer_phone: body.phone || null,
        fee_amount: 0,
        idempotency_key: idempotencyKey,
        metadata: {
          providerResponse: depositLink.raw,
          checkoutMode: "redirect"
        },
        profile_id: profileId,
        provider: "flutterwave",
        purpose: "fiat_wallet_deposit",
        status: "initiated"
      })
      .select(
        "id, amount, checkout_reference, checkout_url, checkout_expires_at, currency, status"
      )
      .single();

    if (error) {
      throw error;
    }

    const payload = {
      message: "Deposit initiated successfully.",
      success: true,
      transaction: {
        amountNaira: Number(data.amount),
        checkoutReference: data.checkout_reference,
        checkoutUrl: data.checkout_url,
        currency: data.currency,
        expiresAt: data.checkout_expires_at,
        id: data.id,
        status: data.status
      }
    };

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
    getWallet,
    initiateDeposit,
    listTransactions,
    withdraw
  };
};
