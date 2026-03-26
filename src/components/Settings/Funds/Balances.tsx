import {
  ArrowDownTrayIcon,
  ArrowsRightLeftIcon,
  ArrowUpIcon,
  ChevronRightIcon
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { Address } from "viem";
import TopUpButton from "@/components/Shared/Account/TopUp/Button";
import Loader from "@/components/Shared/Loader";
import { ErrorMessage, Image, Modal } from "@/components/Shared/UI";
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
import formatAddress from "@/helpers/formatAddress";
import { formatNaira } from "@/helpers/formatNaira";
import getTokenImage from "@/helpers/getTokenImage";
import useEnsureIndexerAuth from "@/hooks/useEnsureIndexerAuth";
import { useBalancesBulkQuery } from "@/indexer/generated";
import { useFundModalStore } from "@/store/non-persisted/modal/useFundModalStore";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";
import FiatWalletPanel from "./FiatWalletPanel";
import Unwrap from "./Unwrap";
import Withdraw from "./Withdraw";
import Wrap from "./Wrap";

type FundsTab = "activity" | "coins" | "collectibles";

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

const heroActionClassName =
  "inline-flex min-h-0 items-center justify-center gap-1.5 rounded-full bg-gray-100 px-3 py-2.5 text-center text-gray-900 transition hover:bg-gray-200 dark:bg-[#1d1d1d] dark:text-white dark:hover:bg-[#262626] md:gap-2 md:px-4 md:py-2.5";

const modalActionClassName =
  "w-full !rounded-2xl !border-gray-200 !bg-gray-100 !py-2.5 !font-semibold !text-gray-900 hover:!border-gray-300 hover:!bg-gray-200 dark:!border-white/12 dark:!bg-white/6 dark:!text-white dark:hover:!border-white/20 dark:hover:!bg-white/10";

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

interface DepositFundsModalProps {
  onClose: () => void;
  onDeposit: (amount: number) => void;
  selectedAmount: number;
  setSelectedAmount: (amount: number) => void;
  show: boolean;
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
              className={modalActionClassName}
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

const DepositFundsModal = ({
  onClose,
  onDeposit,
  selectedAmount,
  setSelectedAmount,
  show
}: DepositFundsModalProps) => {
  return (
    <Modal onClose={onClose} show={show} size="xs">
      <div className="space-y-2.5 bg-white p-3.5 text-gray-900 md:space-y-3 md:p-4 dark:bg-[#111111] dark:text-white">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-lg md:text-xl">Deposit funds</p>
              <p className="mt-1 text-gray-500 text-xs dark:text-gray-400">
                Add funds to your wallet.
              </p>
            </div>
            <button
              className="inline-flex size-7 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 md:size-8 dark:text-gray-400 dark:hover:bg-white/8 dark:hover:text-white"
              onClick={onClose}
              type="button"
            >
              <ChevronRightIcon className="size-4 rotate-45" />
            </button>
          </div>

          <button
            className="mt-2.5 flex w-full items-center justify-between rounded-[1rem] bg-gray-100 px-3 py-2.5 text-left md:mt-3 md:rounded-[1.15rem] md:px-3.5 md:py-3 dark:bg-[#23242b]"
            onClick={() => onDeposit(selectedAmount)}
            type="button"
          >
            <span className="font-semibold text-xl md:text-2xl">
              {formatCurrency(selectedAmount)}
            </span>
            <ChevronRightIcon className="size-4 text-gray-500 md:size-5 dark:text-gray-400" />
          </button>

          <div className="mt-2 grid grid-cols-3 gap-1.5 md:mt-3 md:gap-2">
            {[5, 10, 50].map((amount) => (
              <button
                className={cn(
                  "rounded-full bg-gray-100 px-2.5 py-1.5 font-semibold text-xs transition hover:bg-gray-200 md:px-3 md:py-2 md:text-sm dark:bg-[#23242b] dark:hover:bg-[#2b2d35]",
                  selectedAmount === amount && "bg-gray-200 dark:bg-[#2f313a]"
                )}
                key={amount}
                onClick={() => setSelectedAmount(amount)}
                type="button"
              >
                {formatNaira(amount)}
              </button>
            ))}
          </div>

          <button
            className="mt-2.5 inline-flex w-full items-center justify-center rounded-[1rem] bg-[#f1d84b] px-4 py-2.5 font-semibold text-[#111111] text-sm transition hover:bg-[#e7cf43] md:mt-4 md:rounded-[1.1rem] md:py-3 md:text-base"
            onClick={() => onDeposit(selectedAmount)}
            type="button"
          >
            Deposit now
          </button>
        </div>
      </div>
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
  caption,
  href,
  statusLabel,
  symbol,
  timeLabel,
  title,
  txHash
}: {
  amountLabel: string;
  caption: string;
  href?: null | string;
  statusLabel: string;
  symbol: string;
  timeLabel: string;
  title: string;
  txHash?: null | string;
}) => {
  const content = (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <Image
          alt={symbol}
          className="size-9 rounded-full object-cover"
          src={getTokenImage(symbol)}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-gray-950 text-sm dark:text-white">
              {title}
            </p>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 uppercase tracking-[0.14em] dark:bg-white/8 dark:text-gray-400">
              {statusLabel}
            </span>
          </div>
          <p className="mt-0.5 truncate text-gray-500 text-xs dark:text-gray-400">
            {caption}
          </p>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-500">
            {timeLabel}
            {txHash ? ` | ${formatAddress(txHash, 6)}` : ""}
          </p>
        </div>
      </div>

      <p className="shrink-0 font-semibold text-gray-950 text-sm dark:text-white">
        {amountLabel}
      </p>
    </div>
  );

  if (href) {
    return (
      <Link
        className="block rounded-2xl px-1 transition hover:bg-gray-50 dark:hover:bg-white/[0.04]"
        to={href}
      >
        {content}
      </Link>
    );
  }

  return <div className="rounded-2xl px-1">{content}</div>;
};

const Balances = () => {
  const { currentAccount } = useAccountStore();
  const { profile } = useEvery1Store();
  const {
    authenticating,
    canUseAuthenticatedIndexer,
    needsAuthenticatedIndexer
  } = useEnsureIndexerAuth();
  const { setShowFundModal } = useFundModalStore();
  const [activeTab, setActiveTab] = useState<FundsTab>("coins");
  const [selectedAsset, setSelectedAsset] = useState<FundsAsset | null>(null);
  const [selectedDepositAmount, setSelectedDepositAmount] = useState(10);
  const [showDepositModal, setShowDepositModal] = useState(false);
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

  const totalAvailableBalance = useMemo(
    () => assets.reduce((sum, asset) => sum + (asset.usdValue ?? 0), 0),
    [assets]
  );
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
  const preferredActionAsset = assets.find((asset) => asset.amount > 0) ?? null;
  const walletActivity = walletActivityQuery.data || [];

  const openFundModal = (amount?: number) => {
    setShowFundModal({
      amountToTopUp: amount,
      showFundModal: true
    });
  };

  if (loading) {
    return (
      <div className="overflow-hidden border border-gray-200/65 bg-white text-gray-900 md:rounded-[2rem] dark:border-gray-800/75 dark:bg-black dark:text-white">
        <Loader className="my-16" />
      </div>
    );
  }

  if (needsAuthenticatedIndexer) {
    return (
      <div className="overflow-hidden border border-gray-200/65 bg-white text-gray-900 md:rounded-[2rem] dark:border-gray-800/75 dark:bg-black dark:text-white">
        {authenticating ? (
          <Loader className="my-16" />
        ) : (
          <ErrorMessage
            className="m-5"
            error={{
              message:
                "Sign in again to finish wallet authentication and load your balances."
            }}
            title="Authentication required"
          />
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="overflow-hidden border border-gray-200/65 bg-white text-gray-900 md:rounded-[2rem] dark:border-gray-800/75 dark:bg-black dark:text-white">
        <ErrorMessage
          className="m-5"
          error={error}
          title="Failed to load balances"
        />
      </div>
    );
  }

  return (
    <>
      <FiatWalletPanel />

      <section className="overflow-hidden border border-gray-200/65 bg-white text-gray-900 md:rounded-[2rem] dark:border-gray-800/75 dark:bg-black dark:text-white">
        <div className="mx-auto max-w-[42rem] px-3 py-2.5 sm:px-5 md:px-6 md:py-5">
          <div>
            <p className="font-semibold text-[2.3rem] leading-none tracking-tight md:text-[3.75rem]">
              {formatCurrency(totalAvailableBalance)}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-1.5 md:mt-5 md:gap-2">
            <button
              className={heroActionClassName}
              onClick={() => setShowDepositModal(true)}
              type="button"
            >
              <ArrowDownTrayIcon className="size-4 md:size-5" />
              <span className="font-semibold text-xs md:text-sm">Deposit</span>
            </button>

            <button
              className={cn(
                heroActionClassName,
                !preferredActionAsset && "cursor-not-allowed opacity-40"
              )}
              disabled={!preferredActionAsset}
              onClick={() => setSelectedAsset(preferredActionAsset)}
              type="button"
            >
              <ArrowUpIcon className="size-4 md:size-5" />
              <span className="font-semibold text-xs md:text-sm">Send</span>
            </button>

            <Link className={heroActionClassName} to="/swap">
              <ArrowsRightLeftIcon className="size-4 md:size-5" />
              <span className="font-semibold text-xs md:text-sm">Swap</span>
            </Link>
          </div>

          <div className="no-scrollbar mt-4 flex items-center gap-3 overflow-x-auto border-gray-200 border-b pb-1 md:mt-6 md:gap-5 dark:border-white/10">
            {[
              { key: "coins", label: "Coins" },
              { key: "collectibles", label: "Collectibles" },
              { key: "activity", label: "Activity" }
            ].map((tab) => (
              <button
                className={cn(
                  "relative shrink-0 pb-2 font-medium text-base transition md:pb-2.5 md:text-xl",
                  activeTab === tab.key
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                )}
                key={tab.key}
                onClick={() => setActiveTab(tab.key as FundsTab)}
                type="button"
              >
                {tab.label}
                {activeTab === tab.key ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gray-900 dark:bg-white" />
                ) : null}
              </button>
            ))}
          </div>

          {activeTab === "coins" ? (
            <div className="mt-4 space-y-5 md:mt-5 md:space-y-6">
              <div className="space-y-5 md:space-y-6">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3 md:mb-3">
                    <h2 className="font-semibold text-lg md:text-xl">
                      Cash Balance
                    </h2>
                  </div>
                  <div className="space-y-1">
                    {cashAssets.length > 0 ? (
                      cashAssets.map((asset) => (
                        <SectionRow
                          asset={asset}
                          key={asset.id}
                          onOpen={setSelectedAsset}
                        />
                      ))
                    ) : (
                      <p className="py-1.5 text-gray-500 text-sm md:text-base dark:text-gray-500">
                        No cash balance yet.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3 md:mb-3">
                    <h2 className="font-semibold text-lg md:text-xl">
                      Other Balances
                    </h2>
                  </div>
                  <div className="space-y-1">
                    {otherAssets.length > 0 ? (
                      otherAssets.map((asset) => (
                        <SectionRow
                          asset={asset}
                          key={asset.id}
                          onOpen={setSelectedAsset}
                        />
                      ))
                    ) : (
                      <p className="py-1.5 text-gray-500 text-sm md:text-base dark:text-gray-500">
                        Other token balances will show up here.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "collectibles" ? (
            <div className="mt-4 rounded-[1.2rem] bg-gray-50 p-3.5 md:mt-5 md:rounded-[1.5rem] md:p-4 dark:bg-[#17181d]">
              <p className="font-semibold text-lg md:text-2xl">Collectibles</p>
              <p className="mt-1 text-gray-500 text-xs md:mt-1.5 md:text-sm dark:text-gray-400">
                Your collectible balances will show here once supported assets
                are connected to this wallet.
              </p>
            </div>
          ) : null}

          {activeTab === "activity" ? (
            <div className="mt-4 rounded-[1.2rem] bg-gray-50 p-3.5 md:mt-5 md:rounded-[1.5rem] md:p-4 dark:bg-[#17181d]">
              <p className="font-semibold text-lg md:text-2xl">Activity</p>
              <p className="mt-1 text-gray-500 text-xs md:mt-1.5 md:text-sm dark:text-gray-400">
                Reward sends and payout history land here once tokens hit your
                wallet.
              </p>

              {walletActivityQuery.isLoading ? (
                <Loader className="my-10" />
              ) : walletActivityQuery.error ? (
                <ErrorMessage
                  className="mt-4"
                  error={walletActivityQuery.error as { message?: string }}
                  title="Failed to load wallet activity"
                />
              ) : walletActivity.length ? (
                <div className="mt-4 divide-y divide-gray-200 dark:divide-white/10">
                  {walletActivity.map((activity) => {
                    const title =
                      activity.activityKind === "collaboration_payout"
                        ? "Collaboration payout"
                        : "FanDrop reward";
                    const caption =
                      activity.activityKind === "collaboration_payout"
                        ? `From ${activity.sourceName}`
                        : `${activity.sourceName} auto-sent your reward`;

                    return (
                      <ActivityRow
                        amountLabel={formatTokenAmount(
                          activity.amount,
                          activity.tokenSymbol
                        )}
                        caption={caption}
                        href={activity.targetKey}
                        key={activity.activityId}
                        statusLabel={
                          activity.activityKind === "collaboration_payout"
                            ? "Paid"
                            : "Sent"
                        }
                        symbol={activity.tokenSymbol}
                        timeLabel={formatRelativeOrAbsolute(activity.createdAt)}
                        title={title}
                        txHash={activity.txHash}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-gray-500 text-sm dark:text-gray-400">
                  FanDrop rewards and collaboration payouts will show up here
                  after they are sent.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <AssetActionsModal
        asset={selectedAsset}
        onClose={() => setSelectedAsset(null)}
        refetch={refetch}
      />
      <DepositFundsModal
        onClose={() => setShowDepositModal(false)}
        onDeposit={(amount) => {
          setShowDepositModal(false);
          openFundModal(amount);
        }}
        selectedAmount={selectedDepositAmount}
        setSelectedAmount={setSelectedDepositAmount}
        show={showDepositModal}
      />
    </>
  );
};

export default Balances;
