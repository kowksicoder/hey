import { logFiatEvent } from "./serviceHelpers.mjs";

const DEFAULT_HISTORY_LIMIT = 50;
const DEFAULT_MAX_PAGES = 3;
const PAYMENT_MAX_MATCH_AGE_MS = 72 * 60 * 60 * 1000;
const PAYMENT_LOOKBACK_BUFFER_MS = 5 * 60 * 1000;

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const parseDateValue = (value) => {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? date : null;
};

const toComparableAmountVariants = (value) => {
  const amount = Number.parseFloat(String(value || "0"));

  if (!Number.isFinite(amount) || amount <= 0) {
    return [];
  }

  return [amount, amount * 100, amount * 1000, amount * 1_000_000];
};

const matchesLooseAmount = (paymentAmount, transactionAmount) => {
  const transactionValue = Number.parseFloat(String(transactionAmount || "0"));

  if (!Number.isFinite(transactionValue) || transactionValue <= 0) {
    return false;
  }

  return toComparableAmountVariants(paymentAmount).some(
    (candidate) => Math.abs(candidate - transactionValue) < 0.000001
  );
};

const normalizeDepositStatus = (value) => {
  switch (normalizeText(value)) {
    case "completed":
    case "successful":
    case "succeeded":
    case "success":
      return "succeeded";
    case "failed":
    case "cancelled":
    case "canceled":
      return "failed";
    case "pending":
    case "pending_redeem":
    case "processing":
    case "initiated":
      return "processing";
    default:
      return "pending";
  }
};

const looksLikeDepositTransaction = (transaction) => {
  const type = normalizeText(transaction.type);
  const description = normalizeText(transaction.description);

  return (
    type === "fiat_buy" ||
    type === "deposit" ||
    description.includes("deposit") ||
    description.includes("mint")
  );
};

const buildDepositKeys = (payment) => {
  const metadata =
    typeof payment.metadata === "object" && payment.metadata
      ? payment.metadata
      : {};
  const virtualAccount =
    typeof metadata.virtualAccount === "object" && metadata.virtualAccount
      ? metadata.virtualAccount
      : {};

  return {
    accountNumber: normalizeText(virtualAccount.accountNumber),
    accountReference: normalizeText(virtualAccount.accountReference),
    checkoutReference: normalizeText(payment.checkout_reference)
  };
};

const scoreTransactionMatch = ({ payment, transaction }) => {
  const keys = buildDepositKeys(payment);
  const reasons = [];
  let identifierMatches = 0;
  let score = 0;

  const transactionReference = normalizeText(transaction.reference);
  const receiverAccountNumber = normalizeText(
    transaction.receiverAccountNumber
  );
  const receiverAddress = normalizeText(transaction.receiverAddress);

  if (
    transactionReference &&
    (transactionReference === keys.accountReference ||
      transactionReference === keys.checkoutReference)
  ) {
    identifierMatches += 1;
    score += 10;
    reasons.push("reference");
  }

  if (receiverAccountNumber && receiverAccountNumber === keys.accountNumber) {
    identifierMatches += 1;
    score += 9;
    reasons.push("account_number");
  }

  if (
    receiverAddress &&
    (receiverAddress === keys.accountReference ||
      receiverAddress === keys.checkoutReference ||
      receiverAddress === keys.accountNumber)
  ) {
    identifierMatches += 1;
    score += 8;
    reasons.push("receiver_address");
  }

  const amountMatched = matchesLooseAmount(payment.amount, transaction.amount);

  if (amountMatched) {
    score += 2;
    reasons.push("amount");
  }

  if (looksLikeDepositTransaction(transaction)) {
    score += 1;
    reasons.push("deposit_like");
  }

  const paymentDate = parseDateValue(payment.created_at);
  const transactionDate = parseDateValue(transaction.createdAt);

  if (
    paymentDate &&
    transactionDate &&
    transactionDate.getTime() >=
      paymentDate.getTime() - PAYMENT_LOOKBACK_BUFFER_MS &&
    transactionDate.getTime() <=
      paymentDate.getTime() + PAYMENT_MAX_MATCH_AGE_MS
  ) {
    score += 1;
    reasons.push("timeline");
  }

  return {
    amountMatched,
    identifierMatches,
    reasons,
    score
  };
};

const findMatchingTransaction = ({ payment, transactions }) => {
  const candidates = transactions
    .filter((transaction) => looksLikeDepositTransaction(transaction))
    .map((transaction) => ({
      match: scoreTransactionMatch({
        payment,
        transaction
      }),
      transaction
    }))
    .filter(
      ({ match }) =>
        match.identifierMatches > 0 &&
        (match.identifierMatches > 1 || match.amountMatched)
    )
    .sort((left, right) => {
      if (right.match.score !== left.match.score) {
        return right.match.score - left.match.score;
      }

      const rightDate = parseDateValue(right.transaction.createdAt);
      const leftDate = parseDateValue(left.transaction.createdAt);

      return (rightDate?.getTime() || 0) - (leftDate?.getTime() || 0);
    });

  if (!candidates.length) {
    return null;
  }

  const [best, secondBest] = candidates;

  if (best.match.score < 11) {
    return null;
  }

  if (secondBest && secondBest.match.score === best.match.score) {
    return null;
  }

  return best;
};

const getTransactionIdentity = (transaction) =>
  normalizeText(
    transaction.id ||
      transaction.reference ||
      [
        transaction.receiverAccountNumber,
        transaction.receiverAddress,
        transaction.createdAt,
        transaction.amount
      ]
        .filter(Boolean)
        .join(":")
  );

const loadRecentTransactions = async ({ cngn, historyLimit, maxPages }) => {
  const transactions = [];
  let page = 1;
  let lastPage = false;

  while (!lastPage && page <= maxPages) {
    const result = await cngn.getTransactionHistoryPage({
      limit: historyLimit,
      page
    });

    transactions.push(...(result.transactions || []));
    lastPage =
      Boolean(result.pagination?.isLastPage) || !result.transactions?.length;
    page += 1;
  }

  return transactions;
};

export const createCngnDepositReconciliationService = ({
  cngn,
  historyLimit = DEFAULT_HISTORY_LIMIT,
  maxPages = DEFAULT_MAX_PAGES,
  supabase
}) => {
  const syncPendingDeposits = async ({ profileId }) => {
    if (!cngn?.isReadConfigured) {
      return {
        checked: 0,
        failed: 0,
        matched: 0,
        processing: 0,
        succeeded: 0,
        updated: 0
      };
    }

    const { data: pendingDeposits, error } = await supabase
      .from("payment_transactions")
      .select(
        "id, amount, checkout_reference, created_at, metadata, paid_at, profile_id, provider_transaction_id, purpose, status"
      )
      .eq("profile_id", profileId)
      .eq("provider", "cngn")
      .eq("purpose", "fiat_wallet_deposit")
      .in("status", ["initiated", "pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    if (!pendingDeposits?.length) {
      return {
        checked: 0,
        failed: 0,
        matched: 0,
        processing: 0,
        succeeded: 0,
        updated: 0
      };
    }

    const transactions = await loadRecentTransactions({
      cngn,
      historyLimit,
      maxPages
    });
    let failed = 0;
    let matched = 0;
    let processing = 0;
    let succeeded = 0;
    let updated = 0;
    const consumedTransactionKeys = new Set();

    for (const payment of pendingDeposits) {
      const result = findMatchingTransaction({
        payment,
        transactions: transactions.filter((transaction) => {
          const key = getTransactionIdentity(transaction);
          return key ? !consumedTransactionKeys.has(key) : true;
        })
      });

      if (!result) {
        continue;
      }

      const transactionKey = getTransactionIdentity(result.transaction);

      if (transactionKey) {
        consumedTransactionKeys.add(transactionKey);
      }

      matched += 1;

      const nextStatus = normalizeDepositStatus(result.transaction.status);

      if (nextStatus === "succeeded") {
        succeeded += 1;
      } else if (nextStatus === "failed") {
        failed += 1;
      } else {
        processing += 1;
      }

      const nextMetadata = {
        ...(payment.metadata || {}),
        providerTransaction: result.transaction.raw,
        providerVerification: {
          matchedAt: new Date().toISOString(),
          matchedStatus: nextStatus,
          matchReasons: result.match.reasons,
          provider: "cngn_transaction_history"
        }
      };

      const { error: updateError } = await supabase
        .from("payment_transactions")
        .update({
          metadata: nextMetadata,
          paid_at:
            nextStatus === "succeeded"
              ? payment.paid_at ||
                result.transaction.createdAt ||
                new Date().toISOString()
              : payment.paid_at,
          provider_transaction_id:
            result.transaction.id || payment.provider_transaction_id,
          status: nextStatus
        })
        .eq("id", payment.id)
        .neq("status", nextStatus);

      if (updateError) {
        throw updateError;
      }

      updated += 1;

      logFiatEvent("wallet.cngn_deposit_status_synced", {
        checkoutReference: payment.checkout_reference,
        matchedBy: result.match.reasons,
        paymentId: payment.id,
        profileId,
        status: nextStatus,
        transactionId: result.transaction.id
      });
    }

    return {
      checked: pendingDeposits.length,
      failed,
      matched,
      processing,
      succeeded,
      updated,
      waiting: Math.max(pendingDeposits.length - matched, 0)
    };
  };

  return {
    syncPendingDeposits
  };
};
