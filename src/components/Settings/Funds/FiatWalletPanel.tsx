import {
  ArrowDownTrayIcon,
  ArrowsRightLeftIcon,
  ArrowUpRightIcon
} from "@heroicons/react/24/outline";
import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { isAddress } from "viem";
import Loader from "@/components/Shared/Loader";
import { ErrorMessage, Modal } from "@/components/Shared/UI";
import { getExecutionWalletStatus } from "@/helpers/executionWallet";
import {
  getFiatWallet,
  getFiatWalletTransactions,
  initiateFiatDeposit,
  withdrawFiat
} from "@/helpers/fiat";
import { formatNaira } from "@/helpers/formatNaira";
import { getPrivyDisplayName } from "@/helpers/privy";
import useEvery1ExecutionWallet from "@/hooks/useEvery1ExecutionWallet";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";

const formatRelativeDate = (value?: null | string) => {
  if (!value) {
    return "Just now";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short"
  }).format(date);
};

const actionPillClassName =
  "inline-flex min-h-0 items-center justify-center gap-2 rounded-full bg-white/7 px-4 py-3 font-semibold text-sm text-white transition hover:bg-white/10";

const FiatWalletPanel = () => {
  const { user } = usePrivy();
  const { profile } = useEvery1Store();
  const { currentAccount } = useAccountStore();
  const {
    identityWalletAddress,
    identityWalletClient,
    isLinkingExecutionWallet,
    smartWalletEnabled,
    smartWalletError,
    smartWalletLoading
  } = useEvery1ExecutionWallet();
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [depositAmount, setDepositAmount] = useState("1000");
  const [depositEmail, setDepositEmail] = useState(user?.email?.address || "");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedBankId, setSelectedBankId] = useState<null | string>(null);
  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  const walletAddress = useMemo(() => {
    const candidate =
      identityWalletAddress ||
      currentAccount?.owner ||
      currentAccount?.address ||
      profile?.walletAddress ||
      null;

    return candidate && isAddress(candidate) ? candidate : null;
  }, [
    identityWalletAddress,
    currentAccount?.address,
    currentAccount?.owner,
    profile?.walletAddress
  ]);
  const walletStatus = getExecutionWalletStatus({
    executionWalletAddress: walletAddress,
    executionWalletClient: identityWalletClient || null,
    isLinkingExecutionWallet,
    smartWalletEnabled,
    smartWalletError,
    smartWalletLoading
  });
  const authReady = Boolean(
    profile?.id && walletAddress && identityWalletClient?.account
  );
  const getAuthenticatedRequestContext = () => {
    if (!profile?.id || !walletAddress || !identityWalletClient) {
      throw new Error("Fiat wallet authentication is not ready yet.");
    }

    return {
      profileId: profile.id,
      walletAddress: walletAddress as `0x${string}`,
      walletClient: identityWalletClient
    };
  };

  const walletQuery = useQuery({
    enabled: authReady,
    queryFn: async () =>
      await getFiatWallet({
        ...getAuthenticatedRequestContext()
      }),
    queryKey: ["fiat-wallet", profile?.id || null, walletAddress]
  });

  const transactionsQuery = useQuery({
    enabled: authReady && showHistory,
    queryFn: async () =>
      await getFiatWalletTransactions({
        limit: 8,
        ...getAuthenticatedRequestContext()
      }),
    queryKey: ["fiat-wallet-transactions", profile?.id || null, walletAddress]
  });

  const depositMutation = useMutation({
    mutationFn: async () =>
      await initiateFiatDeposit({
        amountNaira: Number(depositAmount),
        email: depositEmail.trim(),
        name:
          getPrivyDisplayName(user) || profile?.displayName || "Every1 user",
        ...getAuthenticatedRequestContext()
      }),
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to start this deposit right now."
      );
    },
    onSuccess: (response) => {
      toast.success(response.message);
      setShowDepositModal(false);
      void walletQuery.refetch();

      if (response.transaction.checkoutUrl) {
        window.open(
          response.transaction.checkoutUrl,
          "_blank",
          "noopener,noreferrer"
        );
      }
    }
  });

  const withdrawMutation = useMutation({
    mutationFn: async () =>
      await withdrawFiat({
        accountName: selectedBankId
          ? undefined
          : accountName.trim() || undefined,
        accountNumber: selectedBankId ? undefined : accountNumber.trim(),
        amountNaira: Number(withdrawAmount),
        bankAccountId: selectedBankId || undefined,
        bankCode: selectedBankId ? undefined : bankCode.trim(),
        bankName: selectedBankId ? undefined : bankName.trim(),
        makeDefault: true,
        ...getAuthenticatedRequestContext()
      }),
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to process this withdrawal right now."
      );
    },
    onSuccess: (response) => {
      toast.success(response.message);
      setShowWithdrawModal(false);
      setWithdrawAmount("");
      void walletQuery.refetch();

      if (showHistory) {
        void transactionsQuery.refetch();
      }
    }
  });

  const banks = walletQuery.data?.banks || [];
  const openDepositModal = () => {
    setDepositEmail(
      (currentValue) => currentValue || user?.email?.address || ""
    );
    setShowDepositModal(true);
  };
  const openWithdrawModal = () => {
    const defaultBankId =
      banks.find((bank) => bank.isDefault)?.id || banks[0]?.id || null;

    setSelectedBankId(defaultBankId);
    setShowWithdrawModal(true);
  };

  const submitDeposit = () => {
    if (!Number.isFinite(Number(depositAmount)) || Number(depositAmount) <= 0) {
      toast.error("Enter a valid deposit amount.");
      return;
    }

    if (!depositEmail.trim()) {
      toast.error("Add an email for this deposit.");
      return;
    }

    depositMutation.mutate();
  };

  const submitWithdraw = () => {
    if (
      !Number.isFinite(Number(withdrawAmount)) ||
      Number(withdrawAmount) <= 0
    ) {
      toast.error("Enter a valid withdrawal amount.");
      return;
    }

    if (
      !selectedBankId &&
      (!bankCode.trim() || !bankName.trim() || !accountNumber.trim())
    ) {
      toast.error("Add the bank details for this withdrawal.");
      return;
    }

    withdrawMutation.mutate();
  };

  return (
    <>
      <section className="mb-4 overflow-hidden rounded-[1.6rem] bg-[#090909] text-white md:border md:border-white/10 md:bg-[#111111]">
        <div className="px-3.5 py-4 md:px-5 md:py-5">
          {authReady ? (
            walletQuery.isLoading ? (
              <Loader className="my-8" />
            ) : walletQuery.error ? (
              <ErrorMessage
                className="mt-1"
                error={walletQuery.error as { message?: string }}
                title="Failed to load Naira wallet"
              />
            ) : walletQuery.data?.wallet ? (
              <>
                <div>
                  <p className="text-[11px] text-white/56 uppercase tracking-[0.24em]">
                    Naira balance
                  </p>
                  <p className="mt-2 font-semibold text-[3rem] leading-none tracking-tight md:text-[4rem]">
                    {formatNaira(walletQuery.data.wallet.availableBalance)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-white/72">
                      Pending{" "}
                      {formatNaira(walletQuery.data.wallet.pendingBalance)}
                    </span>
                    <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-white/72">
                      Locked{" "}
                      {formatNaira(walletQuery.data.wallet.lockedBalance)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    className={actionPillClassName}
                    onClick={openDepositModal}
                    type="button"
                  >
                    <ArrowDownTrayIcon className="size-4" />
                    Deposit
                  </button>
                  <button
                    className={actionPillClassName}
                    onClick={openWithdrawModal}
                    type="button"
                  >
                    <ArrowUpRightIcon className="size-4" />
                    Withdraw
                  </button>
                  <Link className={actionPillClassName} to="/swap">
                    <ArrowsRightLeftIcon className="size-4" />
                    Swap
                  </Link>
                </div>
              </>
            ) : null
          ) : (
            <div className="rounded-[1.2rem] border border-white/10 border-dashed px-4 py-4 text-sm text-white/68">
              {walletStatus.message ||
                "Preparing your Every1 wallet so we can load your Naira balance."}
            </div>
          )}

          {authReady && walletQuery.data?.wallet ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-white/58">
              <span>
                {banks.length
                  ? `${banks.length} bank${banks.length === 1 ? "" : "s"} linked`
                  : "No saved banks yet"}
              </span>
              <button
                className="rounded-full bg-white/7 px-3 py-1.5 font-semibold text-white/76 transition hover:bg-white/10"
                onClick={() => {
                  setShowHistory(true);
                  void transactionsQuery.refetch();
                }}
                type="button"
              >
                {showHistory ? "Refresh" : "History"}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <Modal
        onClose={() => setShowDepositModal(false)}
        show={showDepositModal}
        size="xs"
        title="Add funds"
      >
        <div className="space-y-3 bg-white p-4 text-gray-900 dark:bg-[#111111] dark:text-white">
          <label className="block">
            <span className="text-gray-500 text-xs dark:text-gray-400">
              Amount
            </span>
            <input
              className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 outline-none transition focus:border-gray-300 dark:border-white/10 dark:bg-[#181a20] dark:focus:border-white/20"
              inputMode="decimal"
              onChange={(event) => setDepositAmount(event.target.value)}
              value={depositAmount}
            />
          </label>
          <label className="block">
            <span className="text-gray-500 text-xs dark:text-gray-400">
              Email
            </span>
            <input
              className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 outline-none transition focus:border-gray-300 dark:border-white/10 dark:bg-[#181a20] dark:focus:border-white/20"
              onChange={(event) => setDepositEmail(event.target.value)}
              type="email"
              value={depositEmail}
            />
          </label>
          <button
            className="w-full rounded-2xl bg-gray-950 px-4 py-3 font-semibold text-sm text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-[#111111] dark:hover:bg-white/90"
            disabled={depositMutation.isPending}
            onClick={submitDeposit}
            type="button"
          >
            {depositMutation.isPending ? "Starting deposit..." : "Continue"}
          </button>
        </div>
      </Modal>

      <Modal
        onClose={() => setShowWithdrawModal(false)}
        show={showWithdrawModal}
        size="sm"
        title="Withdraw to bank"
      >
        <div className="space-y-3 bg-white p-4 text-gray-900 dark:bg-[#111111] dark:text-white">
          <label className="block">
            <span className="text-gray-500 text-xs dark:text-gray-400">
              Amount
            </span>
            <input
              className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 outline-none transition focus:border-gray-300 dark:border-white/10 dark:bg-[#181a20] dark:focus:border-white/20"
              inputMode="decimal"
              onChange={(event) => setWithdrawAmount(event.target.value)}
              placeholder="5000"
              value={withdrawAmount}
            />
          </label>

          {banks.length ? (
            <div>
              <p className="text-gray-500 text-xs dark:text-gray-400">
                Saved banks
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {banks.map((bank) => (
                  <button
                    className={`rounded-full px-3 py-2 font-semibold text-[11px] transition ${
                      selectedBankId === bank.id
                        ? "bg-gray-950 text-white dark:bg-white dark:text-[#111111]"
                        : "bg-gray-100 text-gray-900 dark:bg-white/8 dark:text-white"
                    }`}
                    key={bank.id}
                    onClick={() => setSelectedBankId(bank.id)}
                    type="button"
                  >
                    {bank.bankName} ****{bank.accountNumber.slice(-4)}
                  </button>
                ))}
                <button
                  className="rounded-full bg-gray-100 px-3 py-2 font-semibold text-[11px] text-gray-900 transition dark:bg-white/8 dark:text-white"
                  onClick={() => setSelectedBankId(null)}
                  type="button"
                >
                  Add new
                </button>
              </div>
            </div>
          ) : null}

          {selectedBankId ? null : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-gray-500 text-xs dark:text-gray-400">
                  Bank name
                </span>
                <input
                  className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 outline-none transition focus:border-gray-300 dark:border-white/10 dark:bg-[#181a20] dark:focus:border-white/20"
                  onChange={(event) => setBankName(event.target.value)}
                  value={bankName}
                />
              </label>
              <label className="block">
                <span className="text-gray-500 text-xs dark:text-gray-400">
                  Bank code
                </span>
                <input
                  className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 outline-none transition focus:border-gray-300 dark:border-white/10 dark:bg-[#181a20] dark:focus:border-white/20"
                  onChange={(event) => setBankCode(event.target.value)}
                  value={bankCode}
                />
              </label>
              <label className="block">
                <span className="text-gray-500 text-xs dark:text-gray-400">
                  Account number
                </span>
                <input
                  className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 outline-none transition focus:border-gray-300 dark:border-white/10 dark:bg-[#181a20] dark:focus:border-white/20"
                  onChange={(event) => setAccountNumber(event.target.value)}
                  value={accountNumber}
                />
              </label>
              <label className="block">
                <span className="text-gray-500 text-xs dark:text-gray-400">
                  Account name
                </span>
                <input
                  className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 outline-none transition focus:border-gray-300 dark:border-white/10 dark:bg-[#181a20] dark:focus:border-white/20"
                  onChange={(event) => setAccountName(event.target.value)}
                  value={accountName}
                />
              </label>
            </div>
          )}

          <button
            className="w-full rounded-2xl bg-gray-950 px-4 py-3 font-semibold text-sm text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-[#111111] dark:hover:bg-white/90"
            disabled={withdrawMutation.isPending}
            onClick={submitWithdraw}
            type="button"
          >
            {withdrawMutation.isPending ? "Submitting..." : "Withdraw"}
          </button>
        </div>
      </Modal>

      <Modal
        onClose={() => setShowHistory(false)}
        show={showHistory}
        size="sm"
        title="Naira history"
      >
        <div className="space-y-3 bg-white p-4 text-gray-900 dark:bg-[#111111] dark:text-white">
          {transactionsQuery.isLoading ? (
            <Loader className="my-8" />
          ) : transactionsQuery.error ? (
            <ErrorMessage
              error={transactionsQuery.error as { message?: string }}
              title="Failed to load Naira activity"
            />
          ) : transactionsQuery.data?.transactions?.length ? (
            <div className="space-y-2">
              {transactionsQuery.data.transactions.map((transaction) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-[1rem] bg-gray-50 px-3 py-2.5 dark:bg-[#181a20]"
                  key={transaction.id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-sm">
                      {transaction.title}
                    </p>
                    <p className="truncate text-gray-500 text-xs dark:text-gray-400">
                      {transaction.subtitle || transaction.type}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-500">
                      {[
                        transaction.status,
                        formatRelativeDate(transaction.createdAt)
                      ]
                        .filter(Boolean)
                        .join(" - ")}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-sm">
                    {transaction.direction === "credit" ? "+" : "-"}
                    {formatNaira(transaction.netAmountNaira)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm dark:text-gray-400">
              No Naira activity yet.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
};

export default FiatWalletPanel;
