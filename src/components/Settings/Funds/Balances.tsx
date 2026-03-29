import {
  BanknotesIcon,
  ChevronRightIcon,
  ClockIcon,
  SparklesIcon
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { Address } from "viem";
import TopUpButton from "@/components/Shared/Account/TopUp/Button";
import Loader from "@/components/Shared/Loader";
import { Button, EmptyState, ErrorMessage, Image, Modal } from "@/components/Shared/UI";
import {
  DEFAULT_COLLECT_TOKEN,
  NATIVE_TOKEN_SYMBOL,
  WRAPPED_NATIVE_TOKEN_SYMBOL
} from "@/data/constants";
import { tokens } from "@/data/tokens";
import cn from "@/helpers/cn";
import formatRelativeOrAbsolute from "@/helpers/datetime/formatRelativeOrAbsolute";
import {
  EVERY1_WALLET_ACTIVITY_QUERY_KEY,
  EVERY1_WALLET_REWARD_TOKENS_QUERY_KEY,
  listProfileRewardTokens,
  listProfileWalletActivity
} from "@/helpers/every1";
import { getFiatWalletTransactionsPublic } from "@/helpers/fiat";
import formatAddress from "@/helpers/formatAddress";
import { formatNaira } from "@/helpers/formatNaira";
import getTokenImage from "@/helpers/getTokenImage";
import useEnsureIndexerAuth from "@/hooks/useEnsureIndexerAuth";
import { useBalancesBulkQuery } from "@/indexer/generated";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";
import FiatWalletPanel from "./FiatWalletPanel";
import Unwrap from "./Unwrap";
import Withdraw from "./Withdraw";
import Wrap from "./Wrap";

type FundsTab = "collectibles" | "history" | "tokens";

interface FundsAsset {
  amount: number;
  amountLabel: string;
  amountValue: string;
  currency?: Address;
  id: string;
  kind: "erc20" | "native";
  name: string;
  symbol: string;
  usdValue: number | null;
}

const CASH_BALANCE_PRICES: Record<string, number> = {
  [NATIVE_TOKEN_SYMBOL]: 1,
  [WRAPPED_NATIVE_TOKEN_SYMBOL]: 1
};

const modalActionClassName =
  "w-full !rounded-2xl !border-gray-200 !bg-gray-100 !py-2.5 !font-semibold !text-gray-900 hover:!border-gray-300 hover:!bg-gray-200 dark:!border-white/12 dark:!bg-white/6 dark:!text-white dark:hover:!border-white/20 dark:hover:!bg-white/10";
const modalDepositClassName =
  "w-full !rounded-2xl !border-emerald-500 !bg-emerald-500 !py-2.5 !font-semibold !text-white hover:!border-emerald-600 hover:!bg-emerald-600 dark:!border-emerald-400 dark:!bg-emerald-400 dark:!text-black dark:hover:!border-emerald-300 dark:hover:!bg-emerald-300";

const formatCurrency = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return formatNaira(0);
  }

  if (value < 0.01) {
    return `<${formatNaira(0.01, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    })}`;
  }

  return formatNaira(value, {
    maximumFractionDigits: value >= 100 ? 0 : 2,
    minimumFractionDigits: value >= 100 ? 0 : 2
  });
};

const formatTokenAmount = (amount: number, symbol: string) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    return `0 ${symbol}`;
  }

  if (amount < 0.0001) {
    return `<0.0001 ${symbol}`;
  }

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: amount >= 1 ? 4 : 6
  }).format(amount)} ${symbol}`;
};

const buildAssetFromBalance = (balance: any): FundsAsset | null => {
  if (!("asset" in balance)) {
    return null;
  }

  if (balance.__typename === "NativeAmount") {
    const amount = Number.parseFloat(balance.value);

    return {
      amount,
      amountLabel: formatTokenAmount(amount, NATIVE_TOKEN_SYMBOL),
      amountValue: balance.value,
      id: "native",
      kind: "native",
      name: balance.asset.name || NATIVE_TOKEN_SYMBOL,
      symbol: NATIVE_TOKEN_SYMBOL,
      usdValue: amount * (CASH_BALANCE_PRICES[NATIVE_TOKEN_SYMBOL] ?? 0)
    };
  }

  if (balance.__typename === "Erc20Amount") {
    const amount = Number.parseFloat(balance.value);
    const symbol = balance.asset.symbol || "TOKEN";

    return {
      amount,
      amountLabel: formatTokenAmount(amount, symbol),
      amountValue: balance.value,
      currency: balance.asset.contract.address,
      id: balance.asset.contract.address,
      kind: "erc20",
      name: balance.asset.name || symbol,
      symbol,
      usdValue:
        CASH_BALANCE_PRICES[symbol] !== undefined
          ? amount * CASH_BALANCE_PRICES[symbol]
          : null
    };
  }

  return null;
};

interface AssetActionsModalProps {
  asset: FundsAsset | null;
  onClose: () => void;
  refetch: () => void;
}

const AssetActionsModal = ({
  asset,
  onClose,
  refetch
}: AssetActionsModalProps) => {
  return (
    <Modal onClose={onClose} show={Boolean(asset)} title={asset?.name}>
      {asset ? (
        <div className="space-y-3 bg-white p-4 text-gray-900 md:space-y-4 md:p-5 dark:bg-[#111111] dark:text-white">
          <div className="rounded-[1.2rem] bg-gray-100 p-3.5 md:rounded-[1.5rem] md:p-4 dark:bg-white/5">
            <div className="flex items-center gap-2.5 md:gap-3">
              <Image
                alt={asset.symbol}
                className="size-10 rounded-full object-cover md:size-12"
                src={getTokenImage(asset.symbol)}
              />
              <div className="min-w-0">
                <p className="truncate font-semibold text-base md:text-lg">
                  {asset.name}
                </p>
                <p className="truncate text-gray-500 text-xs md:text-sm dark:text-gray-400">
                  {asset.amountLabel}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3 md:mt-4">
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-[0.2em] dark:text-gray-500">
                  Available
                </p>
                <p className="mt-1 font-semibold text-xl md:text-2xl">
                  {asset.usdValue !== null
                    ? formatCurrency(asset.usdValue)
                    : asset.amountLabel}
                </p>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-gray-600 text-xs shadow-sm dark:bg-white/8 dark:text-gray-300 dark:shadow-none">
                {asset.symbol}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 md:gap-2.5">
            <TopUpButton
              className={modalDepositClassName}
              label="Deposit"
              size="md"
              token={
                asset.currency
                  ? {
                      contractAddress: asset.currency,
                      symbol: asset.symbol
                    }
                  : undefined
              }
            />
            <Withdraw
              buttonLabel="Send"
              className={modalActionClassName}
              currency={asset.currency}
              outline
              refetch={refetch}
              size="md"
              successMessage="Transfer successful"
              title="Send"
              value={asset.amountValue}
            />
            {asset.kind === "native" ? (
              <Wrap
                buttonLabel={`Wrap ${asset.symbol}`}
                className={modalActionClassName}
                outline
                refetch={refetch}
                size="md"
                title="Wrap"
                value={asset.amountValue}
              />
            ) : null}
            {asset.currency === DEFAULT_COLLECT_TOKEN ? (
              <Unwrap
                buttonLabel={`Unwrap ${asset.symbol}`}
                className={modalActionClassName}
                outline
                refetch={refetch}
                size="md"
                title="Unwrap"
                value={asset.amountValue}
              />
            ) : null}
            <Link
              className="inline-flex w-full items-center justify-center rounded-2xl bg-gray-100 px-4 py-2.5 font-semibold text-gray-900 transition hover:bg-gray-200 dark:bg-white/6 dark:text-white dark:hover:bg-white/10"
              onClick={onClose}
              to="/swap"
            >
              Swap
            </Link>
          </div>
        </div>
      ) : null}
    </Modal>
  );
};

const SectionRow = ({
  asset,
  onOpen
}: {
  asset: FundsAsset;
  onOpen: (asset: FundsAsset) => void;
}) => {
  const rightValue =
    asset.usdValue !== null
      ? formatCurrency(asset.usdValue)
      : asset.amount > 0
        ? asset.amountLabel
        : formatNaira(0);

  return (
    <button
      className="group flex w-full items-center justify-between gap-2.5 py-2.5 text-left md:gap-2.5 md:py-2.5"
      onClick={() => onOpen(asset)}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
        <Image
          alt={asset.symbol}
          className="size-8 rounded-full object-cover md:size-10"
          src={getTokenImage(asset.symbol)}
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-sm md:text-lg">
            {asset.name}
          </p>
          <p className="truncate text-gray-500 text-xs md:text-sm dark:text-gray-400">
            {asset.amountLabel}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <p className="whitespace-nowrap font-semibold text-sm md:text-lg">
          {rightValue}
        </p>
        <ChevronRightIcon className="size-3.5 text-gray-600 transition group-hover:text-gray-300 md:size-4" />
      </div>
    </button>
  );
};

const ActivityRow = ({
  amountLabel,
  amountTone,
  caption,
  href,
  statusLabel,
  symbol,
  timeLabel,
  title,
  txHash
}: {
  amountLabel: string;
  amountTone: "credit" | "debit" | "neutral";
  caption: string;
  href?: null | string;
  statusLabel: string;
  symbol: string;
  timeLabel: string;
  title: string;
  txHash?: null | string;
}) => {
  const amountToneClass =
    amountTone === "credit"
      ? "text-emerald-600 dark:text-emerald-400"
      : amountTone === "debit"
        ? "text-rose-600 dark:text-rose-400"
        : "text-gray-950 dark:text-white";
  const normalizedStatus = statusLabel.toLowerCase();
  const statusTone =
    normalizedStatus.includes("success") ||
    normalizedStatus.includes("succeeded") ||
    normalizedStatus.includes("paid")
      ? "success"
      : normalizedStatus.includes("failed") ||
          normalizedStatus.includes("cancelled") ||
          normalizedStatus.includes("refunded")
        ? "danger"
        : normalizedStatus.includes("processing")
          ? "info"
          : normalizedStatus.includes("pending") ||
              normalizedStatus.includes("initiated")
            ? "warning"
            : "neutral";
  const statusBadgeClass = cn(
    "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]",
    statusTone === "success" &&
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    statusTone === "danger" &&
      "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
    statusTone === "warning" &&
      "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    statusTone === "info" &&
      "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
    statusTone === "neutral" &&
      "bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400"
  );
  const content = (
    <div className="flex items-center justify-between gap-2 py-2 md:gap-3 md:py-2.5">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <Image
          alt={symbol}
          className="size-8 rounded-full object-cover md:size-9"
          src={getTokenImage(symbol)}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-[13px] text-gray-950 dark:text-white md:text-sm">
              {title}
            </p>
            <span className={statusBadgeClass}>
              {statusLabel}
            </span>
          </div>
          <p className="mt-0.5 truncate text-gray-500 text-xs dark:text-gray-400">
            {caption}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500 md:mt-1 dark:text-gray-500">
            {timeLabel}
            {txHash ? ` | ${formatAddress(txHash, 6)}` : ""}
          </p>
        </div>
      </div>

      <p
        className={`shrink-0 font-semibold text-[13px] ${amountToneClass} md:text-sm`}
      >
        {amountLabel}
      </p>
    </div>
  );

  if (href) {
    return (
      <Link
        className="block rounded-xl px-0.5 transition hover:bg-gray-50 md:rounded-2xl md:px-1 dark:hover:bg-white/[0.04]"
        to={href}
      >
        {content}
      </Link>
    );
  }

  return <div className="rounded-xl px-0.5 md:rounded-2xl md:px-1">{content}</div>;
};

const Balances = () => {
  const { currentAccount } = useAccountStore();
  const { profile } = useEvery1Store();
  const [activeTab, setActiveTab] = useState<FundsTab>("tokens");
  const {
    authenticateIndexer,
    authenticating,
    canUseAuthenticatedIndexer,
    needsAuthenticatedIndexer
  } = useEnsureIndexerAuth({ enabled: Boolean(currentAccount?.address) });
  const [selectedAsset, setSelectedAsset] = useState<FundsAsset | null>(null);
  const rewardTokensQuery = useQuery({
    enabled: Boolean(profile?.id),
    queryFn: async () => await listProfileRewardTokens(profile?.id || ""),
    queryKey: [EVERY1_WALLET_REWARD_TOKENS_QUERY_KEY, profile?.id || null]
  });
  const walletActivityQuery = useQuery({
    enabled: Boolean(profile?.id),
    queryFn: async () => await listProfileWalletActivity(profile?.id || ""),
    queryKey: [EVERY1_WALLET_ACTIVITY_QUERY_KEY, profile?.id || null]
  });
  const fiatTransactionsQuery = useQuery({
    enabled: Boolean(profile?.id),
    queryFn: async () =>
      await getFiatWalletTransactionsPublic(profile?.id || "", 12),
    queryKey: ["fiat-wallet-transactions-public", profile?.id || null]
  });
  const tokenContracts = useMemo(
    () =>
      Array.from(
        new Set([
          ...tokens.map((token) => token.contractAddress),
          ...(rewardTokensQuery.data?.map((token) => token.tokenAddress) || [])
        ])
      ),
    [rewardTokensQuery.data]
  );
  const { data, loading, error, refetch } = useBalancesBulkQuery({
    pollInterval: 5000,
    skip: !currentAccount?.address || !canUseAuthenticatedIndexer,
    variables: {
      request: {
        address: currentAccount?.address,
        includeNative: true,
        tokens: tokenContracts
      }
    }
  });

  const assets = useMemo(() => {
    const nextAssets =
      data?.balancesBulk
        .map((balance) => buildAssetFromBalance(balance))
        .filter((balance): balance is FundsAsset => Boolean(balance)) ?? [];

    return [...nextAssets].sort((a, b) => {
      const aHasBalance = a.amount > 0 ? 1 : 0;
      const bHasBalance = b.amount > 0 ? 1 : 0;

      if (aHasBalance !== bHasBalance) {
        return bHasBalance - aHasBalance;
      }

      return (b.usdValue ?? b.amount) - (a.usdValue ?? a.amount);
    });
  }, [data]);

  const cashAssets = useMemo(
    () =>
      assets.filter((asset) =>
        [NATIVE_TOKEN_SYMBOL, WRAPPED_NATIVE_TOKEN_SYMBOL].includes(
          asset.symbol
        )
      ),
    [assets]
  );
  const otherAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          ![NATIVE_TOKEN_SYMBOL, WRAPPED_NATIVE_TOKEN_SYMBOL].includes(
            asset.symbol
          )
      ),
    [assets]
  );
  const walletActivity = walletActivityQuery.data || [];
  const fiatTransactions = fiatTransactionsQuery.data?.transactions || [];
  const historyItems = useMemo(() => {
    const fiatItems = fiatTransactions.map((transaction) => ({
      amountLabel: `${transaction.direction === "credit" ? "+" : "-"}${formatNaira(
        transaction.netAmountNaira
      )}`,
      amountTone: transaction.direction === "credit" ? "credit" : "debit",
      caption: transaction.subtitle || "Naira wallet",
      createdAt: transaction.createdAt,
      href: null,
      id: `fiat-${transaction.id}`,
      statusLabel: transaction.status || "pending",
      symbol: "NGN",
      timeLabel: formatRelativeOrAbsolute(transaction.createdAt),
      title: transaction.title || "Naira wallet",
      txHash: null
    }));

    const rewardItems = walletActivity.map((activity) => ({
      amountLabel: formatTokenAmount(activity.amount, activity.tokenSymbol),
      amountTone: "credit",
      caption:
        activity.activityKind === "collaboration_payout"
          ? `From ${activity.sourceName}`
          : activity.activityKind === "referral_reward"
            ? `${activity.sourceName} unlocked your ${activity.tokenSymbol} bonus`
            : `${activity.sourceName} auto-sent your reward`,
      createdAt: activity.createdAt,
      href: activity.targetKey,
      id: `reward-${activity.activityId}`,
      statusLabel:
        activity.activityKind === "collaboration_payout" ? "Paid" : "Sent",
      symbol: activity.tokenSymbol,
      timeLabel: formatRelativeOrAbsolute(activity.createdAt),
      title:
        activity.activityKind === "collaboration_payout"
          ? "Collaboration payout"
          : activity.activityKind === "referral_reward"
            ? "Referral reward"
            : "FanDrop reward",
      txHash: activity.txHash || null
    }));

    return [...fiatItems, ...rewardItems].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
  }, [fiatTransactions, walletActivity]);
  const historyLoading =
    walletActivityQuery.isLoading || fiatTransactionsQuery.isLoading;
  const historyError = walletActivityQuery.error || fiatTransactionsQuery.error;
  const shouldShowHistoryError = Boolean(historyError) && !historyItems.length;
  const requestOnchainAccess = async () => {
    await authenticateIndexer({ force: true });
  };

  const renderOnchainWalletContent = () => {
    if (authenticating && !canUseAuthenticatedIndexer) {
      return <Loader className="my-16" />;
    }

    if (loading) {
      return <Loader className="my-16" />;
    }

    if (error) {
      return (
        <ErrorMessage
          className="m-5"
          error={error}
          title="Failed to load balances"
        />
      );
    }

    return (
      <div className="mx-auto max-w-[42rem] px-0 py-0 md:px-6 md:py-5">
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-1 pb-2 md:mt-1 md:gap-3 md:px-0">
          {[
            { key: "tokens", label: "Coins" },
            { key: "collectibles", label: "Earnings" },
            { key: "history", label: "History" }
          ].map((tab) => (
            <button
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 font-semibold text-xs transition md:px-4 md:py-2 md:text-sm",
                activeTab === tab.key
                  ? "bg-gray-900 text-white shadow-sm dark:bg-white dark:text-black"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/8 dark:text-white/70 dark:hover:bg-white/12"
              )}
              key={tab.key}
              onClick={() => setActiveTab(tab.key as FundsTab)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "tokens" ? (
          <div className="space-y-4 px-2 pt-3 md:space-y-6 md:px-0">
            <div className="space-y-4 md:space-y-6">
              {cashAssets.length > 0 ? (
                <div className="space-y-0.5">
                  {cashAssets.map((asset) => (
                    <SectionRow
                      asset={asset}
                      key={asset.id}
                      onOpen={setSelectedAsset}
                    />
                  ))}
                </div>
              ) : null}

              {otherAssets.length > 0 ? (
                <div className="space-y-0.5">
                  {otherAssets.map((asset) => (
                    <SectionRow
                      asset={asset}
                      key={asset.id}
                      onOpen={setSelectedAsset}
                    />
                  ))}
                </div>
              ) : null}

              {cashAssets.length === 0 && otherAssets.length === 0 ? (
                <EmptyState
                  className="mt-4 bg-gray-50 dark:bg-[#17181d]"
                  icon={
                    <div className="rounded-full bg-white/70 p-3 text-gray-500 shadow-sm dark:bg-white/10 dark:text-white/70">
                      <BanknotesIcon className="size-5" />
                    </div>
                  }
                  message={
                    <p className="text-gray-500 text-sm dark:text-gray-400">
                      No coins yet.
                    </p>
                  }
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === "collectibles" ? (
          <div className="px-2 pt-4 md:px-0">
            <EmptyState
              className="bg-gray-50 dark:bg-[#17181d]"
              icon={
                <div className="rounded-full bg-white/70 p-3 text-gray-500 shadow-sm dark:bg-white/10 dark:text-white/70">
                  <SparklesIcon className="size-5" />
                </div>
              }
              message={
                <p className="text-gray-500 text-sm dark:text-gray-400">
                  Earnings will show up here once your coin starts making
                  money.
                </p>
              }
            />
          </div>
        ) : null}

        {activeTab === "history" ? (
          <div className="mx-2 mt-4 rounded-[1.2rem] bg-gray-50 p-3.5 md:mx-0 md:mt-5 md:rounded-[1.5rem] md:p-4 dark:bg-[#17181d]">
            {historyLoading ? (
              <Loader className="my-10" />
            ) : shouldShowHistoryError ? (
              <ErrorMessage
                className="mt-4"
                error={historyError as { message?: string }}
                title="Failed to load wallet activity"
              />
            ) : historyItems.length ? (
              <div className="mt-4 divide-y divide-gray-200 dark:divide-white/10">
                {historyItems.map((activity) => {
                  return (
                    <ActivityRow
                      amountLabel={activity.amountLabel}
                      amountTone={activity.amountTone}
                      caption={activity.caption}
                      href={activity.href}
                      key={activity.id}
                      statusLabel={activity.statusLabel}
                      symbol={activity.symbol}
                      timeLabel={activity.timeLabel}
                      title={activity.title}
                      txHash={activity.txHash}
                    />
                  );
                })}
              </div>
            ) : (
              <EmptyState
                className="mt-4 bg-transparent"
                hideCard
                icon={
                  <div className="rounded-full bg-white/70 p-3 text-gray-500 shadow-sm dark:bg-white/10 dark:text-white/70">
                    <ClockIcon className="size-5" />
                  </div>
                }
                message={
                  <p className="text-gray-500 text-sm dark:text-gray-400">
                    No history yet.
                  </p>
                }
              />
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <FiatWalletPanel />

      <section className="overflow-hidden border-0 bg-transparent text-gray-900 md:rounded-[2rem] md:border md:border-gray-200/65 md:bg-white dark:text-white md:dark:border-gray-800/75 md:dark:bg-black">
        {renderOnchainWalletContent()}
      </section>

      <AssetActionsModal
        asset={selectedAsset}
        onClose={() => setSelectedAsset(null)}
        refetch={refetch}
      />
    </>
  );
};

export default Balances;
