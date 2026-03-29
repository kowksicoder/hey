import {
  ArrowDownTrayIcon,
  ArrowsRightLeftIcon,
  ArrowUpRightIcon
} from "@heroicons/react/24/outline";
import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { isAddress } from "viem";
import Loader from "@/components/Shared/Loader";
import { Button, ErrorMessage, Modal } from "@/components/Shared/UI";
import { logActionError } from "@/helpers/actionErrorLogger";
import {
  readFiatWalletCache,
  type FiatWalletCacheEntry,
  writeFiatWalletCache
} from "@/helpers/fiatWalletCache";
import {
  getFiatWallet,
  getFiatWalletPublic,
  getFiatWalletTransactions,
  initiateFiatDepositPublic,
  withdrawFiat
} from "@/helpers/fiat";
import { formatNaira, USD_TO_NGN_RATE } from "@/helpers/formatNaira";
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

const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency"
  }).format(value);
const formatPercent = (value: number) =>
  `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: value > 0 && value < 0.01 ? 2 : 0
  }).format(value * 100)}%`;

const actionPillClassName =
  "inline-flex min-h-0 items-center justify-center gap-1.5 rounded-full bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-900 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 md:gap-2 md:px-4 md:py-3 md:text-sm dark:bg-white/7 dark:text-white dark:hover:bg-white/10";

const FiatWalletPanel = () => {
  const { user } = usePrivy();
  const { profile } = useEvery1Store();
  const { currentAccount } = useAccountStore();
  const queryClient = useQueryClient();
  const {
    identityWalletAddress,
    identityWalletClient
  } = useEvery1ExecutionWallet({ autoPrepare: true });
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [showDepositCheckout, setShowDepositCheckout] = useState(false);
  const [depositCheckoutUrl, setDepositCheckoutUrl] = useState<null | string>(
    null
  );
  const [depositCheckoutLoading, setDepositCheckoutLoading] = useState(false);
  const depositCheckoutFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [depositAmount, setDepositAmount] = useState("1000");
  const [depositEmail, setDepositEmail] = useState(user?.email?.address || "");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedBankId, setSelectedBankId] = useState<null | string>(null);
  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [walletAccessRequested, setWalletAccessRequested] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    null | "deposit" | "withdraw"
  >(null);
  const [cachedWalletEntry, setCachedWalletEntry] =
    useState<FiatWalletCacheEntry | null>(null);

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
  const profileReady = Boolean(profile?.id);
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
    enabled: authReady && walletAccessRequested,
    queryFn: async () =>
      await getFiatWallet({
        ...getAuthenticatedRequestContext()
      }),
    queryKey: ["fiat-wallet", profile?.id || null, walletAddress]
  });

  const publicWalletQuery = useQuery({
    enabled: profileReady,
    queryFn: async () => {
      if (!profile?.id) {
        throw new Error("Profile is not ready yet.");
      }

      return await getFiatWalletPublic(profile.id);
    },
    queryKey: ["fiat-wallet-public", profile?.id || null],
    staleTime: 30_000
  });

  const transactionsQuery = useQuery({
    enabled:
      authReady &&
      walletAccessRequested &&
      showHistory &&
      Boolean(walletQuery.data?.wallet),
    queryFn: async () =>
      await getFiatWalletTransactions({
        limit: 8,
        ...getAuthenticatedRequestContext()
      }),
    queryKey: ["fiat-wallet-transactions", profile?.id || null, walletAddress]
  });

  const depositMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) {
        throw new Error("Sign in to continue.");
      }

      return await initiateFiatDepositPublic({
        amountNaira: Number(depositAmount),
        email: depositEmail.trim(),
        name:
          getPrivyDisplayName(user) || profile?.displayName || "Every1 user",
        profileId: profile.id
      });
    },
    onError: (error) => {
      logActionError("wallet.deposit", error, {
        amountNaira: Number(depositAmount),
        hasEmail: Boolean(depositEmail.trim()),
        profileId: profile?.id || null,
        walletAddress
      });
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to start this deposit right now."
      );
    },
    onSuccess: (response) => {
      toast.success(response.message);
      setShowDepositForm(false);
      void publicWalletQuery.refetch();

      if (authReady && walletAccessRequested) {
        void walletQuery.refetch();
      }

      if (profile?.id) {
        void queryClient.invalidateQueries({
          queryKey: ["fiat-wallet-transactions-public", profile.id]
        });
      }

      if (response.transaction.checkoutUrl) {
        setDepositCheckoutUrl(response.transaction.checkoutUrl);
        setDepositCheckoutLoading(true);
        setShowDepositCheckout(true);
        return;
      }

      toast.error("Flutterwave checkout is not available for this deposit.");
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
      logActionError("wallet.withdraw", error, {
        amountNaira: Number(withdrawAmount),
        bankCode: selectedBankId ? null : bankCode.trim() || null,
        hasAccountNumber: Boolean(accountNumber.trim()),
        profileId: profile?.id || null,
        selectedBankId,
        walletAddress
      });
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

      if (profile?.id) {
        void queryClient.invalidateQueries({
          queryKey: ["fiat-wallet-transactions-public", profile.id]
        });
      }

      if (showHistory) {
        void transactionsQuery.refetch();
      }
    }
  });

  useEffect(() => {
    setCachedWalletEntry(readFiatWalletCache(profile?.id || null));
  }, [profile?.id]);

  useEffect(() => {
    const nextWallet =
      walletQuery.data?.wallet || publicWalletQuery.data?.wallet;

    if (nextWallet && profile?.id) {
      writeFiatWalletCache(profile.id, nextWallet);
      setCachedWalletEntry({
        cachedAt: new Date().toISOString(),
        wallet: nextWallet
      });
    }
  }, [profile?.id, publicWalletQuery.data?.wallet, walletQuery.data?.wallet]);

  const wallet =
    walletQuery.data?.wallet ||
    publicWalletQuery.data?.wallet ||
    cachedWalletEntry?.wallet ||
    null;
  const banks = walletQuery.data?.banks || [];
  const activeWalletError = walletQuery.error || publicWalletQuery.error;
  const shouldShowWalletError = Boolean(activeWalletError) && !wallet;
  const refetchWallet = walletQuery.error
    ? walletQuery.refetch
    : publicWalletQuery.refetch;
  const hasWalletData = Boolean(wallet);
  const balanceLabel = hasWalletData
    ? formatNaira(wallet?.availableBalance ?? 0)
    : "₦--";
  const pendingLabel = hasWalletData
    ? formatNaira(wallet?.pendingBalance ?? 0)
    : "—";
  const lockedLabel = hasWalletData
    ? formatNaira(wallet?.lockedBalance ?? 0)
    : "—";
  const balanceDisplayLabel = hasWalletData ? balanceLabel : "\u20a6--";
  const pendingDisplayLabel = hasWalletData ? pendingLabel : "--";
  const totalBalance = Number(wallet?.totalBalance ?? 0);
  const pendingPercent =
    hasWalletData && totalBalance > 0
      ? Number(wallet?.pendingBalance ?? 0) / totalBalance
      : 0;
  const pendingPercentLabel = hasWalletData
    ? formatPercent(Math.max(pendingPercent, 0))
    : "--";
  const lockedDisplayLabel = hasWalletData ? lockedLabel : "--";
  const usdEquivalentLabel = hasWalletData
    ? `(${formatUsd((wallet?.availableBalance ?? 0) / USD_TO_NGN_RATE)})`
    : null;
  const openDepositForm = () => {
    setDepositEmail(
      (currentValue) => currentValue || user?.email?.address || ""
    );
    setShowDepositForm(true);
  };
  const openWithdrawModal = () => {
    const defaultBankId =
      banks.find((bank) => bank.isDefault)?.id || banks[0]?.id || null;

    setSelectedBankId(defaultBankId);
    setShowWithdrawModal(true);
  };
  const ensureWalletAccess = (action: "deposit" | "withdraw") => {
    if (action === "deposit") {
      if (!profileReady) {
        toast.error("Sign in to add funds.");
        return;
      }

      openDepositForm();
      return;
    }

    if (!authReady) {
      toast.error("Sign in to manage your Naira wallet.");
      return;
    }

    if (walletQuery.data?.wallet) {
      if (action === "deposit") {
        openDepositForm();
      } else {
        openWithdrawModal();
      }
      return;
    }

    setPendingAction(action);
    setWalletAccessRequested(true);
  };

  useEffect(() => {
    if (!pendingAction || !walletQuery.data?.wallet) {
      return;
    }

    if (pendingAction === "deposit") {
      openDepositForm();
    } else {
      openWithdrawModal();
    }

    setPendingAction(null);
  }, [pendingAction, walletQuery.data?.wallet]);

  useEffect(() => {
    if (!pendingAction || !walletQuery.error) {
      return;
    }

    toast.error("Unable to unlock your wallet right now.");
    setPendingAction(null);
  }, [pendingAction, walletQuery.error]);

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

  useEffect(() => {
    if (depositCheckoutUrl) {
      setDepositCheckoutLoading(true);
    }
  }, [depositCheckoutUrl]);

  const closeDepositCheckout = (status?: string) => {
    setShowDepositCheckout(false);
    setDepositCheckoutUrl(null);
    setDepositCheckoutLoading(false);

    void publicWalletQuery.refetch();

    if (authReady && walletAccessRequested) {
      void walletQuery.refetch();
    }

    if (profile?.id) {
      void queryClient.invalidateQueries({
        queryKey: ["fiat-wallet-transactions-public", profile.id]
      });
    }

    if (showHistory) {
      void transactionsQuery.refetch();
    }

    if (status && ["cancelled", "failed"].includes(status.toLowerCase())) {
      toast.error("Deposit was not completed.");
    }
  };

  const handleDepositCheckoutLoad = () => {
    setDepositCheckoutLoading(false);

    const iframe = depositCheckoutFrameRef.current;

    if (!iframe) {
      return;
    }

    try {
      const href = iframe.contentWindow?.location.href;

      if (!href) {
        return;
      }

      const url = new URL(href);

      if (url.origin !== window.location.origin) {
        return;
      }

      const statusParam =
        url.searchParams.get("status") ||
        url.searchParams.get("payment_status") ||
        url.searchParams.get("transaction_status");

      closeDepositCheckout(statusParam || undefined);
    } catch {
      return;
    }
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
      <section className="mb-4 overflow-hidden rounded-[1.6rem] border border-gray-200/70 bg-white text-gray-900 dark:border-gray-800/75 dark:bg-black dark:text-white">
        <div className="px-3.5 pb-4 pt-5 md:px-5 md:py-5">
          {profileReady ? (
            shouldShowWalletError ? (
              <div className="space-y-3">
                <ErrorMessage
                  className="mt-1"
                  error={activeWalletError as { message?: string }}
                  title="Failed to load Naira wallet"
                />
                <Button
                  onClick={() => {
                    void refetchWallet();
                  }}
                  outline
                  size="sm"
                >
                  Try again
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-[11px] text-gray-500 uppercase tracking-[0.24em] dark:text-white/56">
                    Balance
                  </p>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <p
                      className={`font-semibold text-[2.2rem] leading-none tracking-tight md:text-[2.75rem] ${
                        hasWalletData ? "" : "text-gray-400 dark:text-white/60"
                      }`}
                    >
                      {balanceDisplayLabel}
                    </p>
                    {usdEquivalentLabel ? (
                      <span className="pb-0.5 text-[11px] text-gray-500 dark:text-white/60">
                        {usdEquivalentLabel}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 md:px-2.5 md:py-1 md:text-[11px] dark:bg-white/8 dark:text-white/72"
                    >
                      {pendingPercentLabel}
                    </span>
                    <span
                      className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 md:px-2.5 md:py-1 md:text-[11px] dark:bg-white/8 dark:text-white/72"
                    >
                      Pending {pendingDisplayLabel}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    className={`${actionPillClassName} !bg-emerald-500 !text-white hover:!bg-emerald-600 dark:!bg-emerald-400 dark:!text-black dark:hover:!bg-emerald-300`}
                    onClick={() => ensureWalletAccess("deposit")}
                    type="button"
                  >
                    <ArrowDownTrayIcon className="size-4" />
                    Deposit
                  </button>
                  <button
                    className={actionPillClassName}
                    onClick={() => ensureWalletAccess("withdraw")}
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

                {showDepositForm ? (
                  <div className="mt-3 rounded-[1rem] bg-gray-50 p-3 dark:bg-[#181a20]">
                    <div className="grid gap-2 md:grid-cols-[1fr,1.2fr,auto] md:items-end">
                      <label className="block">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          Amount
                        </span>
                        <input
                          className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-300 dark:border-white/10 dark:bg-[#111111] dark:focus:border-white/20"
                          inputMode="decimal"
                          onChange={(event) => setDepositAmount(event.target.value)}
                          value={depositAmount}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          Email
                        </span>
                        <input
                          className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-300 dark:border-white/10 dark:bg-[#111111] dark:focus:border-white/20"
                          onChange={(event) => setDepositEmail(event.target.value)}
                          type="email"
                          value={depositEmail}
                        />
                      </label>
                      <button
                        className="h-10 rounded-xl bg-gray-950 px-4 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-[#111111] dark:hover:bg-white/90"
                        disabled={depositMutation.isPending}
                        onClick={submitDeposit}
                        type="button"
                      >
                        {depositMutation.isPending ? "Starting..." : "Continue"}
                      </button>
                    </div>
                    <button
                      className="mt-2 text-[11px] text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      onClick={() => setShowDepositForm(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </>
            )
          ) : (
            <div className="rounded-[1.2rem] border border-gray-200/80 border-dashed px-4 py-4 text-sm text-gray-600 dark:border-white/10 dark:text-white/68">
              Sign in to view your Naira wallet.
            </div>
          )}

          {authReady && walletQuery.data?.wallet ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-gray-500 dark:text-white/58">
              <span>
                {banks.length
                  ? `${banks.length} bank${banks.length === 1 ? "" : "s"} linked`
                  : "No saved banks yet"}
              </span>
              <button
                className="rounded-full bg-gray-100 px-3 py-1.5 font-semibold text-gray-800 transition hover:bg-gray-200 dark:bg-white/7 dark:text-white/76 dark:hover:bg-white/10"
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
        onClose={() => closeDepositCheckout()}
        show={showDepositCheckout}
        size="sm"
      >
        <div className="bg-white p-0 text-gray-900 dark:bg-[#111111] dark:text-white">
          <div className="relative h-[480px] max-h-[70vh] overflow-hidden">
            {depositCheckoutLoading ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
                <Loader />
                <span className="text-xs">Loading Flutterwave checkout…</span>
              </div>
            ) : null}
            {depositCheckoutUrl ? (
              <iframe
                className="h-full w-full"
                onLoad={handleDepositCheckoutLoad}
                ref={depositCheckoutFrameRef}
                src={depositCheckoutUrl}
                title="Flutterwave checkout"
              />
            ) : (
              <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
                Checkout link unavailable.
              </div>
            )}
          </div>
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
