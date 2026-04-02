/** biome-ignore-all lint/a11y/noSvgWithoutTitle: decorative inline chart svg */
import {
  ArrowsRightLeftIcon,
  ChevronDownIcon,
  CogIcon,
  MagnifyingGlassIcon,
  XMarkIcon
} from "@heroicons/react/24/solid";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTradeCall,
  type ExploreResponse,
  type GetProfileBalancesResponse,
  getExploreTopVolumeAll24h,
  getProfileBalances,
  setApiKey,
  type TradeParameters,
  tradeCoin
} from "@zoralabs/coins-sdk";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Address } from "viem";
import {
  createPublicClient,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  parseEther,
  parseUnits
} from "viem";
import { base } from "viem/chains";
import PageLayout from "@/components/Shared/PageLayout";
import { ActionStatusModal, Button, Card } from "@/components/Shared/UI";
import { BASE_RPC_URL, DEFAULT_AVATAR } from "@/data/constants";
import { logActionError } from "@/helpers/actionErrorLogger";
import cn from "@/helpers/cn";
import formatRelativeOrAbsolute from "@/helpers/datetime/formatRelativeOrAbsolute";
import {
  EVERY1_NOTIFICATION_COUNT_QUERY_KEY,
  EVERY1_NOTIFICATIONS_QUERY_KEY,
  EVERY1_REFERRAL_DASHBOARD_QUERY_KEY,
  EVERY1_WALLET_ACTIVITY_QUERY_KEY,
  listProfileWalletActivity,
  recordReferralTradeReward
} from "@/helpers/every1";
import {
  getExecutionWalletStatus,
  toViemWalletClient
} from "@/helpers/executionWallet";
import {
  executeSell,
  executeSupport,
  getFiatWalletPublic,
  getFiatWalletTransactionsPublic,
  getSellExecutionStatusPublic,
  getSellQuotePublic,
  getSupportExecutionStatusPublic,
  getSupportQuotePublic
} from "@/helpers/fiat";
import {
  createFiatIdempotencyKey,
  getFiatExecutionStatus,
  isFiatExecutionCompleted,
  isFiatExecutionFailed,
  normalizeFiatUiError,
  pollFiatExecutionUntilSettled,
  shouldPollFiatExecution
} from "@/helpers/fiatUi";
import {
  type FiatWalletCacheEntry,
  readFiatWalletCache,
  writeFiatWalletCache
} from "@/helpers/fiatWalletCache";
import {
  formatCompactNaira,
  formatCompactNairaFromUsd,
  formatNaira,
  NAIRA_SYMBOL
} from "@/helpers/formatNaira";
import getCoinPriceHistory, {
  type CoinPriceHistoryPoint
} from "@/helpers/getCoinPriceHistory";
import getZoraApiKey from "@/helpers/getZoraApiKey";
import {
  formatDelta,
  isPositiveDelta,
  parseMetricNumber
} from "@/helpers/liveCreatorData";
import {
  fetchPlatformDiscoverCoins,
  mergePriorityItemsByAddress
} from "@/helpers/platformDiscovery";
import { announceTelegramTrade } from "@/helpers/telegramAnnouncements";
import useEvery1ExecutionWallet from "@/hooks/useEvery1ExecutionWallet";
import useHandleWrongNetwork from "@/hooks/useHandleWrongNetwork";
import useUsdToNgnRate, { resolveUsdToNgnRate } from "@/hooks/useUsdToNgnRate";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";
import type {
  FiatTradeFundingSummary,
  FiatWalletSummary,
  SellExecuteResponse
} from "@/types/fiat";

const zoraApiKey = getZoraApiKey();

if (zoraApiKey) {
  setApiKey(zoraApiKey);
}

const TOKEN_DECIMALS = 18;
const DEFAULT_SLIPPAGE = 0.005;

const formatSlippageLabel = (value: number) => {
  const percent = value * 100;
  const digits = percent >= 1 ? 1 : 2;
  return `${percent.toFixed(digits).replace(/\.0+$/, "")}%`;
};

const describeFiatFundingBalance = (
  funding?: null | FiatTradeFundingSummary
) => {
  if (!funding) {
    return "Every1 Naira balance";
  }

  return funding.tradeFundingRail === "cngn"
    ? "cNGN-backed Naira balance"
    : "Every1 Naira balance";
};

const describeFiatPayoutBalance = (
  funding?: null | FiatTradeFundingSummary
) => {
  if (!funding) {
    return "Every1 Naira balance";
  }

  return funding.payoutRail === "cngn"
    ? "cNGN-backed Naira balance"
    : "Every1 Naira balance";
};

type ExploreCoinNode = NonNullable<
  NonNullable<
    NonNullable<ExploreResponse["data"]>["exploreList"]
  >["edges"][number]["node"]
>;

type CoinBalanceNode = NonNullable<
  NonNullable<
    NonNullable<GetProfileBalancesResponse["profile"]>["coinBalances"]
  >["edges"][number]["node"]
>;

type ZoraCoinSummary = {
  address: string;
  creatorProfile?: {
    avatar?: {
      previewImage?: {
        medium?: null | string;
        small?: null | string;
      };
    };
    handle?: null | string;
  } | null;
  marketCap?: null | string;
  marketCapDelta24h?: null | string;
  mediaContent?: {
    previewImage?: {
      medium?: null | string;
      small?: null | string;
    };
  } | null;
  name?: null | string;
  symbol?: null | string;
  tokenPrice?: {
    priceInPoolToken?: null | string;
    priceInUsdc?: null | string;
  } | null;
  volume24h?: null | string;
};

type Coin = {
  address: string;
  avatarUrl: string;
  balanceNgn: number;
  balanceToken: number;
  handle: string;
  marketCap: number;
  name: string;
  percentChange: number;
  priceNgn: number;
  symbol: string;
  volume: number;
};

type RecentSwapEntry = {
  amount: string;
  id: string;
  isPositive: boolean;
  label: string;
  meta: string;
};

type FiatQuoteState = null | {
  amountLabel: string;
  displayValue: string;
  expiresAt: string;
  funding?: null | FiatTradeFundingSummary;
  quoteId: string;
  settlement?: {
    address: Address;
    transferAmountLabel: string;
    transferAmountRaw: string;
  };
  summary: string;
  wallet?: null | FiatWalletSummary;
};

const EMPTY_COIN: Coin = {
  address: "",
  avatarUrl: DEFAULT_AVATAR,
  balanceNgn: 0,
  balanceToken: 0,
  handle: "@creator",
  marketCap: 0,
  name: "Token",
  percentChange: 0,
  priceNgn: 0,
  symbol: "--",
  volume: 0
};

const normalizeHandle = (handle?: null | string) => {
  if (!handle?.trim()) {
    return "@creator";
  }

  return handle.startsWith("@") ? handle : `@${handle}`;
};

const computePercentChange = (marketCap: number, delta: number) => {
  if (!Number.isFinite(marketCap) || marketCap <= 0) {
    return 0;
  }

  const base = marketCap - delta;

  if (!Number.isFinite(base) || base <= 0) {
    return 0;
  }

  return (delta / base) * 100;
};

const toNgn = (value: number, usdToNgnRate: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value * usdToNgnRate;
};

const isAddress = (value?: null | string): value is Address =>
  Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));

const buildSwapCoin = (
  coin: ZoraCoinSummary,
  usdToNgnRate: number,
  balanceToken = 0
): Coin => {
  const priceUsd = parseMetricNumber(coin.tokenPrice?.priceInUsdc);
  const marketCap = parseMetricNumber(coin.marketCap);
  const marketCapDelta = parseMetricNumber(coin.marketCapDelta24h);
  const percentChange = computePercentChange(marketCap, marketCapDelta);
  const priceNgn = toNgn(priceUsd, usdToNgnRate);
  const safeSymbol = coin.symbol?.trim() || "--";

  return {
    address: coin.address,
    avatarUrl:
      coin.mediaContent?.previewImage?.medium ||
      coin.mediaContent?.previewImage?.small ||
      coin.creatorProfile?.avatar?.previewImage?.medium ||
      coin.creatorProfile?.avatar?.previewImage?.small ||
      DEFAULT_AVATAR,
    balanceNgn: balanceToken * priceNgn,
    balanceToken,
    handle: normalizeHandle(coin.creatorProfile?.handle),
    marketCap,
    name: coin.name?.trim() || safeSymbol || coin.address,
    percentChange,
    priceNgn,
    symbol: safeSymbol,
    volume: parseMetricNumber(coin.volume24h)
  };
};

type ChartPoint = { x: number; y: number; value: number };

const buildLinearPath = (points: ChartPoint[]) => {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const d = [`M ${points[0].x} ${points[0].y}`];

  for (let index = 1; index < points.length; index++) {
    d.push(`L ${points[index].x} ${points[index].y}`);
  }

  return d.join(" ");
};

const generateChartData = (
  history: CoinPriceHistoryPoint[],
  fallbackPrice: number,
  usdToNgnRate: number
): { areaPath: string; linePath: string; points: ChartPoint[] } => {
  const width = 200;
  const height = 50;
  const baseline = height;
  const topPadding = 6;
  const bottomPadding = 6;
  const usableHeight = height - topPadding - bottomPadding;
  const maxRenderPoints = 120;

  const mapped = history
    .map((point) => ({
      price: point.priceUsd * usdToNgnRate,
      timestamp: new Date(point.timestamp).getTime()
    }))
    .filter(
      (point) =>
        Number.isFinite(point.price) &&
        point.price > 0 &&
        Number.isFinite(point.timestamp)
    );
  const safeHistory =
    mapped.length > 1
      ? mapped
      : [
          mapped[0] || {
            price: fallbackPrice,
            timestamp: Date.now()
          },
          {
            price: mapped[0]?.price || fallbackPrice,
            timestamp: Date.now() + 1
          }
        ];
  const safeHistoryPoints = Array.isArray(safeHistory) ? safeHistory : [];
  const downsampled =
    safeHistoryPoints.length > maxRenderPoints
      ? (() => {
          const bucketSize = Math.ceil(
            safeHistoryPoints.length / maxRenderPoints
          );
          const bucketed: Array<{ price: number; timestamp: number }> = [];

          for (
            let index = 0;
            index < safeHistoryPoints.length;
            index += bucketSize
          ) {
            const slice = safeHistoryPoints.slice(index, index + bucketSize);

            if (!slice.length) {
              continue;
            }

            let minPoint = slice[0];
            let maxPoint = slice[0];

            for (const point of slice) {
              if (point.price < minPoint.price) {
                minPoint = point;
              }
              if (point.price > maxPoint.price) {
                maxPoint = point;
              }
            }

            if (minPoint.timestamp === maxPoint.timestamp) {
              bucketed.push(minPoint);
            } else if (minPoint.timestamp < maxPoint.timestamp) {
              bucketed.push(minPoint, maxPoint);
            } else {
              bucketed.push(maxPoint, minPoint);
            }
          }

          return bucketed;
        })()
      : safeHistoryPoints;
  const minTimestamp = downsampled[0]?.timestamp ?? Date.now();
  const maxTimestamp =
    downsampled[downsampled.length - 1]?.timestamp ?? minTimestamp + 1;
  const timeSpan = Math.max(maxTimestamp - minTimestamp, 1);
  const minPrice = Math.min(...downsampled.map((point) => point.price));
  const maxPrice = Math.max(...downsampled.map((point) => point.price));
  const hasMovement = Math.abs(maxPrice - minPrice) > 0.0000001;

  const points = downsampled.map((point) => {
    const x = ((point.timestamp - minTimestamp) / timeSpan) * width;
    const normalized = hasMovement
      ? (point.price - minPrice) / Math.max(maxPrice - minPrice, 0.0000001)
      : 0.5;
    const y = height - bottomPadding - normalized * usableHeight;

    return {
      value: point.price,
      x,
      y
    };
  });

  const linePath = buildLinearPath(points);
  const last = points[points.length - 1];
  const first = points[0];
  const areaPath = `${linePath} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;

  return { areaPath, linePath, points };
};

const formatCompact = (value: number, usdToNgnRate: number) =>
  formatCompactNaira(value * usdToNgnRate, 1);

const formatNgn = (value: number) =>
  formatNaira(value, {
    maximumFractionDigits: value >= 100 ? 0 : 2
  });

const formatChartNgn = (value: number) => {
  const safeValue = Number.isFinite(value) && value > 0 ? value : 0;

  if (safeValue >= 100) {
    return formatNaira(safeValue, { maximumFractionDigits: 0 });
  }

  if (safeValue >= 1) {
    return formatNaira(safeValue, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    });
  }

  if (safeValue >= 0.1) {
    return formatNaira(safeValue, {
      maximumFractionDigits: 3,
      minimumFractionDigits: 3
    });
  }

  if (safeValue >= 0.01) {
    return formatNaira(safeValue, {
      maximumFractionDigits: 4,
      minimumFractionDigits: 4
    });
  }

  if (safeValue >= 0.001) {
    return formatNaira(safeValue, {
      maximumFractionDigits: 6,
      minimumFractionDigits: 4
    });
  }

  return formatNaira(safeValue, {
    maximumFractionDigits: 8,
    minimumFractionDigits: 4
  });
};

const formatSwapAmount = (value: number, maxFractionDigits = 6) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits:
      value >= 100 ? Math.min(2, maxFractionDigits) : maxFractionDigits,
    minimumFractionDigits: 0
  }).format(Math.max(0, value));

const formatEthAmount = (value: number, maxFractionDigits = 6) =>
  `${formatSwapAmount(value, maxFractionDigits)} ETH`;

const Swap = () => {
  const queryClient = useQueryClient();
  const { currentAccount } = useAccountStore();
  const { profile } = useEvery1Store();
  const usdToNgnRateQuery = useUsdToNgnRate();
  const usdToNgnRate = resolveUsdToNgnRate(usdToNgnRateQuery.data);
  const {
    executionWalletAddress,
    executionWalletClient,
    identityWalletAddress,
    identityWalletClient,
    isLinkingExecutionWallet,
    prepareExecutionWallet,
    smartWalletEnabled,
    smartWalletError,
    smartWalletLoading
  } = useEvery1ExecutionWallet();
  const handleWrongNetwork = useHandleWrongNetwork();
  const [amount, setAmount] = useState("0.01");
  const [direction, setDirection] = useState<
    "ethToToken" | "tokenToEth" | "tokenToToken"
  >("ethToToken");
  const [tradeRail, setTradeRail] = useState<"fiat" | "onchain">("fiat");
  const [selectedCoin, setSelectedCoin] = useState<null | Coin>(null);
  const [sourceCoin, setSourceCoin] = useState<null | Coin>(null);
  const [coinQuery, setCoinQuery] = useState("");
  const [coinPickerTarget, setCoinPickerTarget] = useState<"source" | "target">(
    "target"
  );
  const [marketSectionTab, setMarketSectionTab] = useState<
    "tokens" | "history" | "holdings"
  >("tokens");
  const [loading, setLoading] = useState(false);
  const [estimatedOut, setEstimatedOut] = useState("");
  const [fiatQuote, setFiatQuote] = useState<FiatQuoteState>(null);
  const [fiatQuoteError, setFiatQuoteError] = useState<null | string>(null);
  const [fiatQuoteLoading, setFiatQuoteLoading] = useState(false);
  const [ethBalance, setEthBalance] = useState<bigint>(0n);
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [recentSwaps, setRecentSwaps] = useState<RecentSwapEntry[]>([]);
  const [statusModal, setStatusModal] = useState<null | {
    description?: string;
    title: string;
    tone: "pending" | "success";
  }>(null);
  const [balanceRefreshIndex, setBalanceRefreshIndex] = useState(0);
  const [cachedWalletEntry, setCachedWalletEntry] =
    useState<FiatWalletCacheEntry | null>(null);
  const [hover, setHover] = useState<null | {
    value: number;
    x: number;
    y: number;
  }>(null);
  const [isCoinPickerOpen, setIsCoinPickerOpen] = useState(false);
  const walletAddress =
    executionWalletAddress ||
    currentAccount?.owner ||
    currentAccount?.address ||
    null;
  const tradeAddress = isAddress(walletAddress) ? walletAddress : undefined;
  const connectedTradeAddress = tradeAddress;
  const fiatWalletAddress =
    identityWalletAddress && isAddress(identityWalletAddress)
      ? identityWalletAddress
      : profile?.walletAddress && isAddress(profile.walletAddress)
        ? profile.walletAddress
        : undefined;
  const fiatWalletClient = identityWalletClient || null;
  const executionWalletStatus = getExecutionWalletStatus({
    executionWalletAddress,
    executionWalletClient,
    isLinkingExecutionWallet,
    smartWalletEnabled,
    smartWalletError,
    smartWalletLoading
  });
  useEffect(() => {
    setCachedWalletEntry(readFiatWalletCache(profile?.id || null));
  }, [profile?.id]);
  const ensureExecutionWalletReady = async () => {
    const existingClient = toViemWalletClient(executionWalletClient);
    const existingAddress =
      executionWalletAddress && isAddress(executionWalletAddress)
        ? (executionWalletAddress as Address)
        : undefined;

    if (existingClient?.account && existingAddress) {
      return {
        address: existingAddress,
        client: existingClient
      };
    }

    setStatusModal({
      description: "This should only take a moment.",
      title: "Preparing your Every1 wallet",
      tone: "pending"
    });

    const preparedWallet = await prepareExecutionWallet();

    if (
      !preparedWallet.executionWalletClient?.account ||
      !preparedWallet.executionWalletAddress
    ) {
      throw new Error(
        executionWalletStatus.message ||
          "Your Every1 wallet is not ready on Base yet."
      );
    }

    return {
      address: preparedWallet.executionWalletAddress as Address,
      client: preparedWallet.executionWalletClient
    };
  };
  const resolveFiatExecutionWalletAddress = async () => {
    const currentExecutionWalletAddress =
      executionWalletAddress && isAddress(executionWalletAddress)
        ? (executionWalletAddress as Address)
        : undefined;

    if (currentExecutionWalletAddress) {
      return currentExecutionWalletAddress;
    }

    const preparedWallet = await prepareExecutionWallet().catch(() => null);
    const preparedExecutionWalletAddress =
      preparedWallet?.executionWalletAddress &&
      isAddress(preparedWallet.executionWalletAddress)
        ? (preparedWallet.executionWalletAddress as Address)
        : undefined;

    return preparedExecutionWalletAddress;
  };
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: base,
        transport: http(BASE_RPC_URL, { batch: { batchSize: 30 } })
      }),
    []
  );

  const trendingQuery = useQuery({
    queryFn: async () => {
      const response = await getExploreTopVolumeAll24h({ count: 18 });
      const nodes =
        response.data?.exploreList?.edges?.map((edge) => edge.node) ?? [];

      return nodes.filter(
        (coin) =>
          Boolean(coin) &&
          !coin.platformBlocked &&
          !coin.creatorProfile?.platformBlocked
      );
    },
    queryKey: ["swap-trending-coins"]
  });
  const platformPriorityQuery = useQuery({
    queryFn: async () => await fetchPlatformDiscoverCoins({ limit: 12 }),
    queryKey: ["swap-platform-priority-coins"],
    staleTime: 30_000
  });

  const holdingsQuery = useQuery({
    enabled: Boolean(walletAddress),
    queryFn: async () =>
      await getProfileBalances({
        count: 12,
        identifier: walletAddress || "",
        sortOption: "USD_VALUE"
      }),
    queryKey: ["swap-holdings", walletAddress]
  });
  const publicFiatWalletQuery = useQuery({
    enabled: Boolean(profile?.id),
    queryFn: async () =>
      profile?.id
        ? await getFiatWalletPublic(profile.id)
        : await Promise.reject(new Error("Profile not ready")),
    queryKey: ["fiat-wallet-public", profile?.id || null],
    staleTime: 30_000
  });

  const walletActivityQuery = useQuery({
    enabled: Boolean(profile?.id),
    queryFn: async () => await listProfileWalletActivity(profile?.id || ""),
    queryKey: [EVERY1_WALLET_ACTIVITY_QUERY_KEY, profile?.id || null]
  });
  const fiatTransactionsQuery = useQuery({
    enabled: Boolean(profile?.id),
    queryFn: async () =>
      await getFiatWalletTransactionsPublic(profile?.id || "", 10),
    queryKey: ["swap-fiat-transactions", profile?.id || null]
  });
  useEffect(() => {
    const nextWallet = publicFiatWalletQuery.data?.wallet;

    if (nextWallet && profile?.id) {
      writeFiatWalletCache(profile.id, nextWallet);
      setCachedWalletEntry({
        cachedAt: new Date().toISOString(),
        wallet: nextWallet
      });
    }
  }, [profile?.id, publicFiatWalletQuery.data?.wallet]);
  const holdingCoins = useMemo(() => {
    const edges = holdingsQuery.data?.data?.profile?.coinBalances?.edges ?? [];

    return edges
      .map((edge) => edge.node)
      .filter(
        (holding): holding is CoinBalanceNode =>
          Boolean(holding?.coin) && !holding.coin?.platformBlocked
      )
      .map((holding) =>
        buildSwapCoin(
          holding.coin as ZoraCoinSummary,
          usdToNgnRate,
          parseMetricNumber(holding.balance)
        )
      );
  }, [holdingsQuery.data, usdToNgnRate]);

  const holdingByAddress = useMemo(() => {
    const map = new Map<string, Coin>();

    for (const coin of holdingCoins) {
      map.set(coin.address.toLowerCase(), coin);
    }

    return map;
  }, [holdingCoins]);

  const trendingCoins = useMemo(() => {
    const nodes = mergePriorityItemsByAddress(
      (platformPriorityQuery.data || []) as ExploreCoinNode[],
      (trendingQuery.data || []) as ExploreCoinNode[],
      18
    );

    return nodes.map((coin) => {
      const holding = holdingByAddress.get(coin.address.toLowerCase());
      return buildSwapCoin(
        coin as ZoraCoinSummary,
        usdToNgnRate,
        holding?.balanceToken ?? 0
      );
    });
  }, [
    holdingByAddress,
    platformPriorityQuery.data,
    trendingQuery.data,
    usdToNgnRate
  ]);

  const coins = useMemo(() => {
    const map = new Map<string, Coin>();

    for (const coin of trendingCoins) {
      map.set(coin.address.toLowerCase(), coin);
    }

    for (const coin of holdingCoins) {
      const key = coin.address.toLowerCase();
      const existing = map.get(key);
      map.set(
        key,
        existing
          ? {
              ...existing,
              balanceNgn: coin.balanceNgn,
              balanceToken: coin.balanceToken
            }
          : coin
      );
    }

    return [...map.values()];
  }, [holdingCoins, trendingCoins]);

  useEffect(() => {
    if (selectedCoin || !coins.length) {
      return;
    }

    setSelectedCoin(coins[0]);
  }, [coins, selectedCoin]);

  useEffect(() => {
    if (!selectedCoin) {
      return;
    }

    const refreshedCoin = coins.find(
      (coin) =>
        coin.address.toLowerCase() === selectedCoin.address.toLowerCase()
    );

    if (refreshedCoin) {
      setSelectedCoin(refreshedCoin);
    }
  }, [coins, selectedCoin]);

  useEffect(() => {
    setFiatQuote(null);
    setFiatQuoteError(null);
  }, [amount, direction, selectedCoin?.address, tradeRail]);

  const activeCoin = selectedCoin ?? coins[0] ?? EMPTY_COIN;
  const isTokenToToken = direction === "tokenToToken";
  const fromIsEth = direction === "ethToToken";
  const toIsEth = direction === "tokenToEth";
  const sourceHoldings = useMemo(
    () => holdingCoins.filter((coin) => coin.balanceToken > 0),
    [holdingCoins]
  );
  const fallbackSourceCoin = useMemo(() => {
    if (!sourceHoldings.length) {
      return activeCoin;
    }

    return (
      sourceHoldings.find(
        (coin) =>
          coin.address.toLowerCase() !== activeCoin.address.toLowerCase()
      ) || sourceHoldings[0]
    );
  }, [activeCoin.address, sourceHoldings]);
  const sourceCoinResolved = sourceCoin ?? fallbackSourceCoin;
  const onchainSourceCoin = isTokenToToken ? sourceCoinResolved : activeCoin;
  const payCoin = fromIsEth ? null : onchainSourceCoin;
  const receiveCoin = toIsEth ? null : activeCoin;
  const hasDistinctTokenPair =
    !isTokenToToken ||
    !sourceCoinResolved.address ||
    !activeCoin.address ||
    sourceCoinResolved.address.toLowerCase() !==
      activeCoin.address.toLowerCase();

  useEffect(() => {
    if (!sourceCoin) {
      return;
    }

    const refreshedCoin = sourceHoldings.find(
      (coin) => coin.address.toLowerCase() === sourceCoin.address.toLowerCase()
    );

    if (refreshedCoin) {
      setSourceCoin(refreshedCoin);
      return;
    }

    if (sourceHoldings.length) {
      setSourceCoin(fallbackSourceCoin);
      return;
    }

    setSourceCoin(null);
  }, [fallbackSourceCoin, sourceCoin, sourceHoldings]);

  useEffect(() => {
    if (!isTokenToToken) {
      return;
    }

    if (!sourceHoldings.length) {
      setSourceCoin(null);
      return;
    }

    if (
      sourceCoinResolved.address &&
      activeCoin.address &&
      sourceCoinResolved.address.toLowerCase() ===
        activeCoin.address.toLowerCase()
    ) {
      setSourceCoin(fallbackSourceCoin);
      return;
    }

    if (!sourceCoin) {
      setSourceCoin(sourceCoinResolved);
    }
  }, [
    activeCoin.address,
    fallbackSourceCoin,
    isTokenToToken,
    sourceCoin,
    sourceCoinResolved,
    sourceHoldings.length
  ]);

  const trendUp = activeCoin.percentChange >= 0;
  const trendColor = trendUp ? "#16a34a" : "#db2777";
  const gradientId = `swap-chart-${activeCoin.symbol || "coin"}`;
  const coinPriceHistoryQuery = useQuery({
    enabled: Boolean(activeCoin.address),
    queryFn: async () =>
      getCoinPriceHistory({ address: activeCoin.address as Address }),
    queryKey: ["swap-coin-price-history", activeCoin.address],
    refetchInterval: 5000
  });

  useEffect(() => {
    let cancelled = false;
    const balanceCoinAddress = payCoin?.address;

    const readBalances = async () => {
      if (!connectedTradeAddress) {
        if (!cancelled) {
          setEthBalance(0n);
          setTokenBalance(0n);
        }
        return;
      }

      try {
        const [nextEthBalance, nextTokenBalance] = await Promise.all([
          publicClient.getBalance({ address: connectedTradeAddress }),
          balanceCoinAddress
            ? publicClient.readContract({
                abi: erc20Abi,
                address: balanceCoinAddress as Address,
                args: [connectedTradeAddress],
                functionName: "balanceOf"
              })
            : Promise.resolve(0n)
        ]);

        if (!cancelled) {
          setEthBalance(nextEthBalance);
          setTokenBalance(nextTokenBalance as bigint);
        }
      } catch {
        if (!cancelled) {
          setEthBalance(0n);
          setTokenBalance(0n);
        }
      }
    };

    void readBalances();

    return () => {
      cancelled = true;
    };
  }, [
    balanceRefreshIndex,
    connectedTradeAddress,
    payCoin?.address,
    publicClient
  ]);

  const parsedAmount = Number.parseFloat(amount || "0");
  const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const isFiatRail = tradeRail === "fiat";
  const isFiatTradeEnabled =
    import.meta.env.VITE_ENABLE_FIAT_TRADES !== "false";

  const makeTradeParams = (sender: Address): null | TradeParameters => {
    if (!activeCoin.address || !hasValidAmount) {
      return null;
    }

    try {
      if (fromIsEth) {
        return {
          amountIn: parseEther(amount),
          buy: { address: activeCoin.address as Address, type: "erc20" },
          sell: { type: "eth" },
          sender,
          slippage: DEFAULT_SLIPPAGE
        };
      }

      if (isTokenToToken) {
        if (!sourceCoinResolved.address || !hasDistinctTokenPair) {
          return null;
        }

        return {
          amountIn: parseUnits(amount, TOKEN_DECIMALS),
          buy: { address: activeCoin.address as Address, type: "erc20" },
          sell: {
            address: sourceCoinResolved.address as Address,
            type: "erc20"
          },
          sender,
          slippage: DEFAULT_SLIPPAGE
        };
      }

      return {
        amountIn: parseUnits(amount, TOKEN_DECIMALS),
        buy: { type: "eth" },
        sell: { address: activeCoin.address as Address, type: "erc20" },
        sender,
        slippage: DEFAULT_SLIPPAGE
      };
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (isFiatRail) {
        setEstimatedOut("");
        return;
      }

      if (!connectedTradeAddress) {
        setEstimatedOut("");
        return;
      }

      const params = makeTradeParams(connectedTradeAddress);

      if (!params) {
        setEstimatedOut("");
        return;
      }

      try {
        const quote = await createTradeCall(params);

        if (!cancelled) {
          setEstimatedOut(quote.quote.amountOut || "");
        }
      } catch {
        if (!cancelled) {
          setEstimatedOut("");
        }
      }
    };

    timeoutId = setTimeout(() => {
      void run();
    }, 300);

    intervalId = setInterval(() => {
      void run();
    }, 8000);

    return () => {
      cancelled = true;

      if (intervalId) {
        clearInterval(intervalId);
      }

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    activeCoin.address,
    amount,
    connectedTradeAddress,
    fromIsEth,
    hasDistinctTokenPair,
    isFiatRail,
    isTokenToToken,
    sourceCoinResolved.address
  ]);

  const sourceCoinOptions = useMemo(() => {
    const filtered = sourceHoldings.filter(
      (coin) => coin.address.toLowerCase() !== activeCoin.address.toLowerCase()
    );

    return filtered.length ? filtered : sourceHoldings;
  }, [activeCoin.address, sourceHoldings]);
  const targetCoinOptions = useMemo(() => {
    if (!isTokenToToken || !sourceCoinResolved.address) {
      return coins;
    }

    const filtered = coins.filter(
      (coin) =>
        coin.address.toLowerCase() !== sourceCoinResolved.address.toLowerCase()
    );

    return filtered.length ? filtered : coins;
  }, [coins, isTokenToToken, sourceCoinResolved.address]);
  const coinPickerCoins =
    coinPickerTarget === "source" ? sourceCoinOptions : targetCoinOptions;
  const filteredCoins = useMemo(() => {
    const query = coinQuery.trim().toLowerCase();

    if (!query) {
      return coinPickerCoins;
    }

    return coinPickerCoins.filter(
      (coin) =>
        coin.name.toLowerCase().includes(query) ||
        coin.symbol.toLowerCase().includes(query)
    );
  }, [coinPickerCoins, coinQuery]);

  const latestHistoryPrice = useMemo(() => {
    const points = coinPriceHistoryQuery.data ?? [];
    const lastPoint = points.at(-1);
    const fallback = activeCoin.priceNgn || 0;
    const priceUsd = lastPoint?.priceUsd ?? 0;
    const priceNgn =
      Number.isFinite(priceUsd) && priceUsd > 0
        ? priceUsd * usdToNgnRate
        : fallback;
    return priceNgn > 0 ? priceNgn : fallback;
  }, [activeCoin.priceNgn, coinPriceHistoryQuery.data, usdToNgnRate]);
  const displayPrice = latestHistoryPrice || activeCoin.priceNgn || 0;

  const chartData = useMemo(
    () =>
      generateChartData(
        coinPriceHistoryQuery.data ?? [],
        latestHistoryPrice,
        usdToNgnRate
      ),
    [coinPriceHistoryQuery.data, latestHistoryPrice, usdToNgnRate]
  );

  const formattedEthBalance = Number(formatEther(ethBalance));
  const formattedTokenBalance = Number(
    formatUnits(tokenBalance, TOKEN_DECIMALS)
  );
  const targetTokenBalance =
    holdingByAddress.get(activeCoin.address.toLowerCase())?.balanceToken ?? 0;
  const payCoinSymbol = payCoin?.symbol || activeCoin.symbol;
  const fiatWallet =
    fiatQuote?.wallet ||
    publicFiatWalletQuery.data?.wallet ||
    cachedWalletEntry?.wallet ||
    null;
  const fiatFunding = fiatQuote?.funding || null;
  const fiatFundingBalanceLabel = describeFiatFundingBalance(fiatFunding);
  const fiatPayoutBalanceLabel = describeFiatPayoutBalance(fiatFunding);
  const nairaBalanceLabel = fiatWallet
    ? formatNaira(fiatWallet.availableBalance ?? 0)
    : `${NAIRA_SYMBOL}--`;
  const availableEthToSwap = Math.max(formattedEthBalance - 0.0002, 0);
  const hasSufficientBalance = hasValidAmount
    ? fromIsEth
      ? isFiatRail
        ? true
        : parsedAmount <= availableEthToSwap + 0.0000001
      : parsedAmount <= formattedTokenBalance + 0.0000001
    : false;
  const receiveAmount = useMemo(() => {
    if (isFiatRail || !estimatedOut) {
      return 0;
    }

    if (!estimatedOut) {
      return 0;
    }

    try {
      return toIsEth
        ? Number(formatEther(BigInt(estimatedOut)))
        : Number(formatUnits(BigInt(estimatedOut), TOKEN_DECIMALS));
    } catch {
      return 0;
    }
  }, [estimatedOut, isFiatRail, toIsEth]);
  const slippageLabel = formatSlippageLabel(DEFAULT_SLIPPAGE);
  const minReceiveAmount =
    receiveAmount > 0 ? receiveAmount * (1 - DEFAULT_SLIPPAGE) : 0;
  const minReceiveLabel =
    minReceiveAmount > 0
      ? toIsEth
        ? `${formatSwapAmount(minReceiveAmount, 6)} ETH`
        : `${formatSwapAmount(minReceiveAmount, 2)} ${activeCoin.symbol}`
      : "-";
  const payInputValue = amount;
  const estimatedFiatReceiveValue = (() => {
    if (!isFiatRail || !hasValidAmount || !activeCoin.priceNgn) {
      return "0";
    }

    if (fromIsEth) {
      const estimatedCoins = parsedAmount / activeCoin.priceNgn;
      return Number.isFinite(estimatedCoins) && estimatedCoins > 0
        ? formatSwapAmount(estimatedCoins, 2)
        : "0";
    }

    const estimatedNaira = parsedAmount * activeCoin.priceNgn;
    return Number.isFinite(estimatedNaira) && estimatedNaira > 0
      ? formatSwapAmount(estimatedNaira, 0)
      : "0";
  })();
  const receiveInputValue = isFiatRail
    ? fiatQuote?.displayValue || estimatedFiatReceiveValue
    : receiveAmount > 0
      ? formatSwapAmount(receiveAmount, toIsEth ? 6 : 2)
      : "0";
  const payBalanceLabel = isFiatRail
    ? fromIsEth
      ? nairaBalanceLabel
      : `${formatSwapAmount(formattedTokenBalance, 4)} ${payCoinSymbol}`
    : fromIsEth
      ? formatEthAmount(formattedEthBalance, formattedEthBalance >= 1 ? 4 : 6)
      : `${formatSwapAmount(formattedTokenBalance, 4)} ${payCoinSymbol}`;
  const receiveBalanceLabel = isFiatRail
    ? fromIsEth
      ? `${formatSwapAmount(targetTokenBalance, 4)} ${activeCoin.symbol}`
      : nairaBalanceLabel
    : toIsEth
      ? formatEthAmount(formattedEthBalance, formattedEthBalance >= 1 ? 4 : 6)
      : `${formatSwapAmount(targetTokenBalance, 4)} ${activeCoin.symbol}`;
  const quoteNgnValue =
    receiveAmount > 0
      ? toIsEth
        ? parsedAmount * (payCoin?.priceNgn || activeCoin.priceNgn)
        : receiveAmount * activeCoin.priceNgn
      : 0;
  const payHint = isFiatRail
    ? fromIsEth
      ? fiatQuote
        ? `Using your ${fiatFundingBalanceLabel}`
        : nairaBalanceLabel
      : `Sell from your ${payCoinSymbol} balance`
    : fromIsEth
      ? "Wallet pays gas on Base"
      : `Sell from your ${payCoinSymbol} balance`;
  const receiveHint = isFiatRail
    ? fiatQuoteError ||
      (fiatQuote
        ? fromIsEth
          ? `Quote ready from your ${fiatFundingBalanceLabel}`
          : `Returns settle to your ${fiatPayoutBalanceLabel}`
        : fromIsEth
          ? ""
          : "See your estimated Naira return.")
    : hasDistinctTokenPair
      ? quoteNgnValue > 0
        ? `Approx. ${formatNgn(quoteNgnValue)}`
        : "Live quote"
      : "Pick two different creator coins.";
  const fiatBuySettlementBlockedMessage =
    isFiatRail && fromIsEth && fiatQuote?.funding?.buySettlementReady === false
      ? fiatQuote.funding.buySettlementMessage ||
        "User-funded cNGN settlement is not ready yet."
      : null;
  const tradeInputLabel = hasValidAmount
    ? fromIsEth
      ? isFiatRail
        ? formatNgn(parsedAmount)
        : formatEthAmount(parsedAmount)
      : `${formatSwapAmount(parsedAmount, 4)} ${payCoinSymbol}`
    : fromIsEth
      ? isFiatRail
        ? formatNgn(0)
        : "0 ETH"
      : `0 ${payCoinSymbol}`;
  const estimatedFiatOutputLabel =
    isFiatRail && hasValidAmount && activeCoin.priceNgn > 0
      ? fromIsEth
        ? `${estimatedFiatReceiveValue} ${activeCoin.symbol}`
        : formatNgn(parsedAmount * activeCoin.priceNgn)
      : fromIsEth
        ? `0 ${activeCoin.symbol}`
        : formatNgn(0);
  const tradeOutputLabel = isFiatRail
    ? fiatQuote?.amountLabel || estimatedFiatOutputLabel
    : receiveAmount > 0
      ? toIsEth
        ? formatEthAmount(receiveAmount)
        : `${formatSwapAmount(receiveAmount, 2)} ${activeCoin.symbol}`
      : toIsEth
        ? "0 ETH"
        : `0 ${activeCoin.symbol}`;
  const tradeRouteLabel = isFiatRail
    ? `${tradeInputLabel} -> ${tradeOutputLabel}`
    : receiveAmount > 0
      ? `${tradeInputLabel} -> ${tradeOutputLabel}`
      : isTokenToToken
        ? `${payCoinSymbol} to ${activeCoin.symbol}`
        : fromIsEth
          ? `ETH to ${activeCoin.symbol}`
          : `${payCoinSymbol} to ETH`;
  const canSubmit = isFiatRail
    ? Boolean(
        activeCoin.address &&
          hasValidAmount &&
          hasSufficientBalance &&
          isFiatTradeEnabled &&
          (!fromIsEth || !fiatQuote || !fiatBuySettlementBlockedMessage) &&
          !loading &&
          !fiatQuoteLoading
      )
    : Boolean(
        activeCoin.address &&
          (fromIsEth || Boolean(payCoin?.address)) &&
          hasValidAmount &&
          hasDistinctTokenPair &&
          receiveAmount > 0 &&
          hasSufficientBalance &&
          !loading
      );
  const swapButtonLabel = isFiatRail
    ? isFiatTradeEnabled
      ? fiatQuote
        ? fiatBuySettlementBlockedMessage
          ? "Buy route pending"
          : fromIsEth
            ? "Confirm buy"
            : "Confirm sell"
        : fiatQuoteLoading
          ? "Getting quote..."
          : fromIsEth
            ? `Get ${activeCoin.symbol} quote`
            : "Get Naira quote"
      : "Naira swaps disabled"
    : isTokenToToken
      ? hasDistinctTokenPair
        ? `Swap to ${activeCoin.symbol}`
        : "Pick another coin"
      : fromIsEth
        ? `Swap to ${activeCoin.symbol}`
        : "Swap to ETH";
  const swapStatusNote = isFiatRail
    ? fiatWalletAddress
      ? isFiatTradeEnabled
        ? hasValidAmount
          ? fiatBuySettlementBlockedMessage ||
            (hasSufficientBalance
              ? fiatQuoteError ||
                fiatQuote?.summary ||
                "Get a live Naira quote, then confirm."
              : fromIsEth
                ? "Your Naira wallet balance will be checked at confirmation."
                : `Not enough ${payCoinSymbol} balance.`)
          : "Enter an amount to request a Naira trade quote."
        : "Test Naira balances can't be used to buy live coins yet."
      : "Get a live Naira quote first. Wallet verification only happens on confirm."
    : connectedTradeAddress
      ? hasValidAmount
        ? hasDistinctTokenPair
          ? hasSufficientBalance
            ? receiveAmount > 0
              ? `Min received (${slippageLabel}): ${minReceiveLabel}.`
              : "Live quote via Zora on Base."
            : fromIsEth
              ? "Keep a little ETH aside for gas."
              : `Not enough ${payCoinSymbol} balance.`
          : "Pick two different creator coins to swap."
        : "Enter an amount to get a live quote."
      : "We'll prepare your Every1 wallet when you continue."; /*
      : "Test Naira balances can’t be used to buy live coins yet."
  */
  const quoteExpiryText = fiatQuote
    ? `Valid until ${new Date(fiatQuote.expiresAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      })}`
    : null;
  const marketTokens = (trendingCoins || []).slice(0, 5);
  const marketHoldings = (holdingCoins || []).slice(0, 5);
  const rewardHistory = (walletActivityQuery.data || []).map((entry) => {
    const rewardAmount = Number(entry.amount) || 0;
    const isPositive = rewardAmount >= 0;
    const cleanAmount = formatSwapAmount(Math.abs(rewardAmount), 2);
    const label =
      entry.activityKind === "collaboration_payout"
        ? "Collaboration payout"
        : entry.activityKind === "referral_reward"
          ? "Referral reward"
          : "FanDrop reward";

    return {
      amount: `${isPositive ? "+" : "-"}${cleanAmount} ${entry.tokenSymbol}`,
      id: entry.activityId,
      isPositive,
      label,
      meta: `${entry.sourceName || "Every1"} - ${formatRelativeOrAbsolute(
        entry.createdAt
      )}`
    } satisfies RecentSwapEntry;
  });
  const tradeHistory = (fiatTransactionsQuery.data?.transactions || [])
    .filter(
      (transaction) =>
        transaction.type === "support" || transaction.type === "sell"
    )
    .map((transaction) => {
      const isSupport = transaction.type === "support";
      const isPositive = transaction.direction === "credit";
      const amountValue = isSupport
        ? transaction.amountNaira
        : transaction.netAmountNaira;
      const coinSymbol = transaction.coinSymbol?.trim();
      const coinLabel = coinSymbol
        ? coinSymbol.startsWith(NAIRA_SYMBOL)
          ? coinSymbol
          : `${NAIRA_SYMBOL}${coinSymbol}`
        : "Creator coin";

      return {
        amount: `${isPositive ? "+" : "-"}${formatNaira(amountValue)}`,
        id: `fiat-${transaction.id}`,
        isPositive,
        label: isSupport ? `Buy ${coinLabel}` : `Sell ${coinLabel}`,
        meta: `${transaction.title || (isSupport ? "Buy" : "Sell")} - ${formatRelativeOrAbsolute(
          transaction.createdAt
        )}`
      } satisfies RecentSwapEntry;
    });
  const marketHistory = [
    ...recentSwaps,
    ...tradeHistory,
    ...rewardHistory
  ].slice(0, 5);
  const tokensLoading = trendingQuery.isLoading;
  const historyLoading =
    walletActivityQuery.isLoading &&
    fiatTransactionsQuery.isLoading &&
    recentSwaps.length === 0 &&
    tradeHistory.length === 0;
  const holdingsLoading = holdingsQuery.isLoading;

  const handleChartMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!chartData.points.length) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const clampedX = Math.max(0, Math.min(rect.width, x));
    const targetX = (clampedX / rect.width) * 200;
    const nearest = chartData.points.reduce((previous, point) => {
      const previousDiff = Math.abs(previous.x - targetX);
      const currentDiff = Math.abs(point.x - targetX);
      return currentDiff < previousDiff ? point : previous;
    }, chartData.points[0]);

    setHover({
      value: nearest.value,
      x: nearest.x,
      y: nearest.y
    });
  };

  const handleChartMouseLeave = () => setHover(null);

  const closeCoinPicker = () => {
    setCoinQuery("");
    setCoinPickerTarget("target");
    setIsCoinPickerOpen(false);
  };

  const handleCoinSelect = (coin: Coin) => {
    if (coinPickerTarget === "source") {
      setSourceCoin(coin);
    } else {
      setSelectedCoin(coin);
    }
    closeCoinPicker();
  };

  const handleMax = () => {
    if (fromIsEth) {
      if (isFiatRail) {
        setAmount("10000");
        return;
      }

      setAmount(availableEthToSwap > 0 ? availableEthToSwap.toFixed(6) : "0");
      return;
    }

    setAmount(
      formattedTokenBalance > 0 ? formattedTokenBalance.toFixed(4) : "0"
    );
  };

  const openCoinPicker = (target: "source" | "target") => {
    setCoinPickerTarget(target);
    setIsCoinPickerOpen(true);
  };

  const handleDirectionChange = (
    nextDirection: "ethToToken" | "tokenToEth" | "tokenToToken"
  ) => {
    setDirection(nextDirection);

    if (nextDirection !== "tokenToToken") {
      setCoinPickerTarget("target");
    }
  };

  const handleSwapDirectionFlip = () => {
    if (isTokenToToken) {
      if (!sourceCoinResolved.address || !activeCoin.address) {
        return;
      }

      setSourceCoin(activeCoin);
      setSelectedCoin(sourceCoinResolved);
      return;
    }

    setDirection((previous) =>
      previous === "ethToToken" ? "tokenToEth" : "ethToToken"
    );
  };

  const requestFiatQuote = async (options: { silent?: boolean } = {}) => {
    if (!profile?.id) {
      if (!options.silent) {
        toast.error("Sign in to get a Naira quote.");
      }
      return;
    }

    if (!hasValidAmount) {
      if (!options.silent) {
        toast.error(
          fromIsEth
            ? "Enter the Naira amount you want to use."
            : `Enter the ${activeCoin.symbol} amount you want to sell.`
        );
      }
      return;
    }

    if (!hasSufficientBalance) {
      if (!options.silent) {
        toast.error(`Not enough ${activeCoin.symbol} balance.`);
      }
      return;
    }

    try {
      setFiatQuoteLoading(true);
      setFiatQuoteError(null);

      if (fromIsEth) {
        const quote = await getSupportQuotePublic({
          coinAddress: activeCoin.address as Address,
          executionWalletAddress: executionWalletAddress || undefined,
          idempotencyKey: createFiatIdempotencyKey("swap-support-quote"),
          nairaAmount: parsedAmount,
          profileId: profile.id
        });

        setFiatQuote({
          amountLabel: `${formatSwapAmount(
            quote.estimated_coin_amount,
            2
          )} ${activeCoin.symbol}`,
          displayValue: formatSwapAmount(quote.estimated_coin_amount, 2),
          expiresAt: quote.expires_at,
          funding: quote.funding || null,
          quoteId: quote.quote_id,
          summary: `You'll receive approximately ${formatSwapAmount(
            quote.estimated_coin_amount,
            2
          )} ${activeCoin.symbol} after ${formatNgn(
            quote.fee_naira
          )} in fees. Paid from your ${describeFiatFundingBalance(
            quote.funding
          )}.`,
          wallet: quote.wallet || null
        });
      } else {
        const quote = await getSellQuotePublic({
          coinAddress: activeCoin.address as Address,
          coinAmount: parsedAmount,
          executionWalletAddress: executionWalletAddress || undefined,
          idempotencyKey: createFiatIdempotencyKey("swap-sell-quote"),
          profileId: profile.id
        });

        setFiatQuote({
          amountLabel: formatNgn(quote.estimated_naira_return),
          displayValue: quote.estimated_naira_return.toLocaleString("en-US", {
            maximumFractionDigits: 0
          }),
          expiresAt: quote.expires_at,
          funding: quote.funding || null,
          quoteId: quote.quote_id,
          settlement: {
            address: quote.settlement.address as Address,
            transferAmountLabel: quote.settlement.transfer_amount_label,
            transferAmountRaw: quote.settlement.transfer_amount_raw
          },
          summary: `You'll receive approximately ${formatNgn(
            quote.estimated_naira_return
          )} after ${formatNgn(
            quote.fee_naira
          )} in fees once you confirm the secure wallet transfer. Returns settle to your ${describeFiatPayoutBalance(
            quote.funding
          )}.`,
          wallet: quote.wallet || null
        });
      }
    } catch (error) {
      logActionError("swap.fiat.quote", error, {
        amount: amount || null,
        chainId: base.id,
        coinAddress: activeCoin.address,
        coinSymbol: activeCoin.symbol,
        executionWalletAddress: executionWalletAddress || null,
        mode: fromIsEth ? "buy" : "sell",
        parsedAmount,
        profileId: profile?.id || null,
        quoteKind: fromIsEth ? "support" : "sell"
      });
      const message = normalizeFiatUiError(
        error,
        "Unable to get a Naira quote right now."
      );
      setFiatQuote(null);
      setFiatQuoteError(message);
      if (!options.silent) {
        toast.error(message);
      }
    } finally {
      setFiatQuoteLoading(false);
    }
  };

  const handleFiatQuote = async () => {
    if (!isFiatTradeEnabled) {
      toast.error("Naira swaps are disabled while using test balances.");
      return;
    }

    await requestFiatQuote();
  };

  const handleFiatSubmit = async () => {
    if (!isFiatTradeEnabled) {
      toast.error("Naira swaps are disabled while using test balances.");
      return;
    }

    if (!profile?.id || !fiatWalletAddress || !fiatWalletClient?.account) {
      toast.error(
        "Preparing your Every1 wallet. Please try again in a moment."
      );
      return;
    }

    if (!fiatQuote) {
      await handleFiatQuote();
      return;
    }

    try {
      setLoading(true);
      setStatusModal({
        description: fromIsEth
          ? "Please wait while we complete your Naira buy trade."
          : "Confirm the wallet transfer to continue with this sell.",
        title: fromIsEth
          ? `Buying ${activeCoin.name}`
          : `Selling ${activeCoin.symbol}`,
        tone: "pending"
      });

      const response = fromIsEth
        ? await (async () => {
            const activeExecutionWalletAddress =
              await resolveFiatExecutionWalletAddress();

            return await executeSupport({
              executionWalletAddress: activeExecutionWalletAddress,
              idempotencyKey: createFiatIdempotencyKey("swap-support-execute"),
              profileId: profile.id,
              quoteId: fiatQuote.quoteId,
              walletAddress: fiatWalletAddress,
              walletClient: fiatWalletClient
            });
          })()
        : await (async () => {
            const settlement = fiatQuote.settlement;

            if (!settlement) {
              throw new Error(
                "This sell quote is missing its settlement instructions."
              );
            }

            const { address: readyTradeWalletAddress, client } =
              await ensureExecutionWalletReady();
            const executionAccount = client.account;

            if (!executionAccount) {
              throw new Error("Your Every1 wallet is not ready on Base yet.");
            }

            await handleWrongNetwork({ chainId: base.id });

            const transferHash = await client.writeContract({
              abi: erc20Abi,
              account: executionAccount,
              address: activeCoin.address as Address,
              args: [settlement.address, BigInt(settlement.transferAmountRaw)],
              chain: base,
              functionName: "transfer"
            });

            await publicClient.waitForTransactionReceipt({
              hash: transferHash,
              timeout: 120000
            });

            setStatusModal({
              description:
                "Transfer confirmed. Finalizing your Naira wallet credit.",
              title: `Settling ${activeCoin.symbol}`,
              tone: "pending"
            });

            return await executeSell({
              executionWalletAddress: readyTradeWalletAddress,
              idempotencyKey: createFiatIdempotencyKey("swap-sell-execute"),
              profileId: profile.id,
              quoteId: fiatQuote.quoteId,
              transactionHash: transferHash,
              walletAddress: fiatWalletAddress,
              walletClient: fiatWalletClient
            });
          })();

      if (!response.success) {
        throw new Error(response.message || "Unable to complete this request.");
      }

      let finalResponse = response;
      const transactionId = fromIsEth
        ? "support" in response
          ? response.support?.id
          : undefined
        : "sell" in response
          ? (response as SellExecuteResponse).sell?.id
          : undefined;

      if (profile.id && transactionId && shouldPollFiatExecution(response)) {
        finalResponse = await pollFiatExecutionUntilSettled({
          getStatus: () =>
            fromIsEth
              ? getSupportExecutionStatusPublic(profile.id, transactionId)
              : getSellExecutionStatusPublic(profile.id, transactionId),
          initialResponse: response
        });
      }

      if (isFiatExecutionFailed(finalResponse)) {
        throw new Error(
          finalResponse.message || "This trade could not be completed."
        );
      }

      const statusValue = getFiatExecutionStatus(finalResponse);
      const isCompleted = isFiatExecutionCompleted(finalResponse);
      const isStillProcessing = statusValue === "processing";

      setStatusModal({
        description: isStillProcessing
          ? fromIsEth
            ? "Your Naira buy is still settling. Check your wallet activity in a moment."
            : "Your Naira sell is still settling. Check your wallet activity in a moment."
          : finalResponse.message ||
            (fromIsEth
              ? "We're confirming your Naira buy."
              : "We're confirming your Naira sell."),
        title: fromIsEth
          ? isCompleted
            ? "Buy completed!"
            : "Buy submitted"
          : isCompleted
            ? "Sell completed!"
            : "Sell submitted",
        tone: isCompleted ? "success" : "pending"
      });

      if (isCompleted) {
        const recentSwapEntry = fromIsEth
          ? {
              amount: `+${fiatQuote.amountLabel}`,
              id: `${fiatQuote.quoteId}-${Date.now()}`,
              isPositive: true,
              label: `Bought ${activeCoin.symbol}`,
              meta: `${tradeRouteLabel} - Just now`
            }
          : (() => {
              const sellResponse = finalResponse as SellExecuteResponse;

              return {
                amount: `+${formatNgn(
                  sellResponse.sell?.estimatedNairaReturn || 0
                )}`,
                id: `${sellResponse.sell?.id || fiatQuote.quoteId}-${Date.now()}`,
                isPositive: true,
                label: `Sold ${activeCoin.symbol}`,
                meta: `${tradeRouteLabel} - Just now`
              };
            })();

        setRecentSwaps((previous) => [recentSwapEntry, ...previous]);
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["fiat-wallet"]
        }),
        queryClient.invalidateQueries({
          queryKey: ["fiat-wallet-transactions"]
        }),
        queryClient.invalidateQueries({
          queryKey: ["fiat-wallet-public", profile.id]
        }),
        queryClient.invalidateQueries({
          queryKey: [EVERY1_NOTIFICATIONS_QUERY_KEY, profile.id]
        }),
        queryClient.invalidateQueries({
          queryKey: [EVERY1_NOTIFICATION_COUNT_QUERY_KEY, profile.id]
        }),
        queryClient.invalidateQueries({
          queryKey: ["swap-holdings", walletAddress]
        }),
        queryClient.invalidateQueries({
          queryKey: [EVERY1_WALLET_ACTIVITY_QUERY_KEY, profile?.id || null]
        })
      ]);

      setBalanceRefreshIndex((previous) => previous + 1);

      await new Promise((resolve) => setTimeout(resolve, 1400));

      setAmount("");
      setFiatQuote(null);
      setStatusModal(null);
    } catch (error) {
      logActionError("swap.fiat.execute", error, {
        amount: amount || null,
        chainId: base.id,
        coinAddress: activeCoin.address,
        coinSymbol: activeCoin.symbol,
        mode: fromIsEth ? "buy" : "sell",
        profileId: profile?.id || null,
        quoteId: fiatQuote?.quoteId || null,
        route: tradeRouteLabel
      });
      const message = normalizeFiatUiError(
        error,
        "Unable to complete this Naira request right now."
      );
      setStatusModal(null);
      setFiatQuoteError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const renderAssetPill = ({
    coin,
    onClick,
    type
  }: {
    coin?: Coin | null;
    onClick?: () => void;
    type: "coin" | "eth" | "ngn";
  }) => {
    if (type !== "coin") {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full border-0 bg-white px-2.5 py-1.5 font-semibold text-gray-900 text-xs shadow-none ring-0 md:gap-1.5 md:px-2.5 md:py-1.5 md:text-xs dark:bg-[#2b2d34] dark:text-white">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[11px] md:h-6 md:w-6 md:text-[11px]",
              type === "ngn"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                : "bg-[#ece7ff] text-[#6d28d9] dark:bg-black/25 dark:text-white"
            )}
          >
            {type === "ngn" ? "NGN" : "ETH"}
          </span>
          {type === "ngn" ? "NGN" : "ETH"}
        </div>
      );
    }

    const Comp = onClick ? "button" : "div";
    const assetCoin = coin ?? activeCoin;

    return (
      <Comp
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border-0 bg-white px-2.5 py-1.5 font-semibold text-gray-900 text-xs shadow-none outline-none ring-0 md:gap-1.5 md:px-2.5 md:py-1.5 md:text-xs dark:bg-[#2b2d34] dark:text-white",
          onClick ? "transition hover:scale-[0.98]" : ""
        )}
        {...(onClick ? { onClick, type: "button" as const } : {})}
      >
        <img
          alt={assetCoin.name}
          className="h-6 w-6 rounded-full md:h-6 md:w-6"
          src={assetCoin.avatarUrl}
        />
        {assetCoin.symbol}
        {onClick ? (
          <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400 dark:text-white/60" />
        ) : null}
      </Comp>
    );
  };

  const renderMobileAssetPill = ({
    coin,
    onClick,
    type
  }: {
    coin?: Coin | null;
    onClick?: () => void;
    type: "coin" | "eth" | "ngn";
  }) => {
    if (type !== "coin") {
      return (
        <div className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-1 font-semibold text-[10px] text-gray-900 dark:bg-[#34363e] dark:text-white">
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-[9px]",
              type === "ngn"
                ? "bg-emerald-500 text-white"
                : "bg-[#d9cffc] text-[#3b2a6d] dark:bg-[#4a3f73] dark:text-white"
            )}
          >
            {type === "ngn" ? "NGN" : "ETH"}
          </span>
          {type === "ngn" ? "NGN" : "ETH"}
        </div>
      );
    }

    const Comp = onClick ? "button" : "div";
    const assetCoin = coin ?? activeCoin;

    return (
      <Comp
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-1 font-semibold text-[10px] text-gray-900 dark:bg-[#3a3c44] dark:text-white",
          onClick ? "transition active:scale-[0.98]" : ""
        )}
        {...(onClick ? { onClick, type: "button" as const } : {})}
      >
        <img
          alt={assetCoin.name}
          className="h-5 w-5 rounded-full"
          src={assetCoin.avatarUrl}
        />
        {assetCoin.symbol}
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#9b7bff] text-[#161616] text-[9px]">
          ✓
        </span>
        {onClick ? (
          <ChevronDownIcon className="h-3 w-3 text-gray-500 dark:text-white/55" />
        ) : null}
      </Comp>
    );
  };

  const railOptions = [
    { label: "Naira", value: "fiat" as const },
    { label: "Onchain", value: "onchain" as const }
  ];
  const onchainDirectionOptions = [
    { label: "Buy", value: "ethToToken" as const },
    { label: "Sell", value: "tokenToEth" as const },
    { label: "Coin swap", value: "tokenToToken" as const }
  ];

  const renderRailToggle = () => (
    <div className="inline-flex rounded-full bg-gray-100 p-0.5 font-semibold text-[9px] md:text-[10px] dark:bg-[#2a2b31]">
      {railOptions.map((option) => (
        <button
          className={cn(
            "rounded-full px-2 py-0.5 transition-colors md:px-2.5 md:py-1",
            tradeRail === option.value
              ? "bg-gray-950 text-white dark:bg-white dark:text-[#111111]"
              : "text-gray-500 hover:text-gray-900 dark:text-white/55 dark:hover:text-white"
          )}
          key={option.value}
          onClick={() => {
            setTradeRail(option.value);

            if (option.value === "fiat" && isTokenToToken) {
              setDirection("ethToToken");
            }
          }}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
  const renderOnchainDirectionToggle = () =>
    isFiatRail ? null : (
      <div className="inline-flex rounded-full bg-gray-100 p-0.5 font-semibold text-[9px] md:text-[10px] dark:bg-[#2a2b31]">
        {onchainDirectionOptions.map((option) => (
          <button
            className={cn(
              "rounded-full px-2 py-0.5 transition-colors md:px-2.5 md:py-1",
              direction === option.value
                ? "bg-gray-950 text-white dark:bg-white dark:text-[#111111]"
                : "text-gray-500 hover:text-gray-900 dark:text-white/55 dark:hover:text-white"
            )}
            key={option.value}
            onClick={() => handleDirectionChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    );

  const renderMarketSection = () => (
    <>
      <div className="mb-1.5 flex items-center gap-2.5">
        <button
          className={cn(
            "font-semibold text-[13px] leading-none",
            marketSectionTab === "tokens"
              ? "text-gray-900 dark:text-white"
              : "text-gray-500 dark:text-white/42"
          )}
          onClick={() => setMarketSectionTab("tokens")}
          type="button"
        >
          Tokens
        </button>
        <button
          className={cn(
            "font-semibold text-[13px] leading-none",
            marketSectionTab === "history"
              ? "text-gray-900 dark:text-white"
              : "text-gray-500 dark:text-white/42"
          )}
          onClick={() => setMarketSectionTab("history")}
          type="button"
        >
          History
        </button>
        <button
          className={cn(
            "font-semibold text-[13px] leading-none",
            marketSectionTab === "holdings"
              ? "text-gray-900 dark:text-white"
              : "text-gray-500 dark:text-white/42"
          )}
          onClick={() => setMarketSectionTab("holdings")}
          type="button"
        >
          Holdings
        </button>
      </div>

      {marketSectionTab === "tokens" ? (
        tokensLoading ? (
          <p className="text-[10px] text-gray-500 dark:text-white/42">
            Loading tokens...
          </p>
        ) : marketTokens.length ? (
          <div className="space-y-1">
            {marketTokens.map((entry) => {
              const active = entry.symbol === activeCoin.symbol;
              const isPositive = isPositiveDelta(entry.percentChange);

              return (
                <button
                  className={cn(
                    "flex w-full items-center justify-between rounded-[1rem] px-0.5 py-0.5 text-left transition",
                    active ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"
                  )}
                  key={entry.symbol}
                  onClick={() => setSelectedCoin(entry)}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <img
                        alt={entry.name}
                        className="h-9 w-9 rounded-full"
                        src={entry.avatarUrl}
                      />
                      <span className="absolute right-0 bottom-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white font-bold text-[#141414] text-[8px]">
                        E
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-[12px] text-gray-900 dark:text-white">
                        {entry.name}
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-white/42">
                        MC {formatCompactNairaFromUsd(entry.marketCap)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold text-[12px] text-gray-900 dark:text-white">
                      {formatNgn(entry.priceNgn)}
                    </p>
                    <p
                      className={cn(
                        "font-semibold text-[10px]",
                        isPositive ? "text-emerald-400" : "text-rose-400"
                      )}
                    >
                      {formatDelta(entry.percentChange)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[10px] text-gray-500 dark:text-white/42">
            No tokens yet.
          </p>
        )
      ) : null}

      {marketSectionTab === "history" ? (
        historyLoading ? (
          <p className="text-[10px] text-gray-500 dark:text-white/42">
            Loading history...
          </p>
        ) : marketHistory.length ? (
          <div className="space-y-1">
            {marketHistory.map((entry) => {
              const isPositive = entry.isPositive;

              return (
                <div
                  className="flex items-center justify-between rounded-[1rem] px-0.5 py-1"
                  key={entry.id}
                >
                  <div>
                    <p className="font-semibold text-[12px] text-gray-900 dark:text-white">
                      {entry.label}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-white/42">
                      {entry.meta}
                    </p>
                  </div>

                  <p
                    className={cn(
                      "font-semibold text-[11px]",
                      isPositive ? "text-emerald-400" : "text-rose-400"
                    )}
                  >
                    {entry.amount}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[10px] text-gray-500 dark:text-white/42">
            No swaps yet.
          </p>
        )
      ) : null}

      {marketSectionTab === "holdings" ? (
        holdingsLoading ? (
          <p className="text-[10px] text-gray-500 dark:text-white/42">
            Loading holdings...
          </p>
        ) : marketHoldings.length ? (
          <div className="space-y-1">
            {marketHoldings.map((entry) => {
              const value = entry.balanceToken * entry.priceNgn;

              return (
                <button
                  className={cn(
                    "flex w-full items-center justify-between rounded-[1rem] px-0.5 py-0.5 text-left transition",
                    entry.symbol === activeCoin.symbol
                      ? "bg-white/[0.03]"
                      : "hover:bg-white/[0.02]"
                  )}
                  key={entry.symbol}
                  onClick={() => setSelectedCoin(entry)}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <img
                      alt={entry.name}
                      className="h-9 w-9 rounded-full"
                      src={entry.avatarUrl}
                    />
                    <div>
                      <p className="font-semibold text-[12px] text-gray-900 dark:text-white">
                        {entry.name}
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-white/42">
                        {formatSwapAmount(entry.balanceToken, 2)} {entry.symbol}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold text-[12px] text-gray-900 dark:text-white">
                      {formatNgn(value)}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-white/42">
                      Held value
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[10px] text-gray-500 dark:text-white/42">
            No holdings yet.
          </p>
        )
      ) : null}
    </>
  );

  const handleSubmit = async () => {
    if (isFiatRail) {
      await handleFiatSubmit();
      return;
    }

    if (!hasSufficientBalance) {
      toast.error(
        fromIsEth
          ? "Not enough ETH balance for this swap"
          : `Not enough ${payCoinSymbol} balance`
      );
      return;
    }

    try {
      setLoading(true);
      setStatusModal({
        description: "Please wait while we complete your swap.",
        title: `Swapping ${tradeInputLabel} - ${tradeOutputLabel}`,
        tone: "pending"
      });

      const { address: clientSender, client } =
        await ensureExecutionWalletReady();
      await handleWrongNetwork({ chainId: base.id });

      const liveParams = makeTradeParams(clientSender);

      if (!liveParams) {
        setStatusModal(null);
        toast.error("Enter a valid amount to swap");
        return;
      }

      const receipt = await tradeCoin({
        account: client.account,
        publicClient,
        tradeParameters: liveParams,
        validateTransaction: false,
        walletClient: client
      });

      setRecentSwaps((previous) => [
        {
          amount: `+${tradeOutputLabel}`,
          id: receipt.transactionHash,
          isPositive: true,
          label: isTokenToToken
            ? `Swapped ${payCoinSymbol} to ${activeCoin.symbol}`
            : fromIsEth
              ? `Bought ${activeCoin.symbol}`
              : `Sold ${activeCoin.symbol}`,
          meta: `${tradeRouteLabel} - Just now`
        },
        ...previous.filter((entry) => entry.id !== receipt.transactionHash)
      ]);

      setStatusModal({
        description: "Trade successful, enjoy your profits!",
        title: "Nice trade!",
        tone: "success"
      });

      if (
        !isTokenToToken &&
        profile?.id &&
        fiatWalletAddress &&
        fiatWalletClient?.account
      ) {
        const tokenAmount = fromIsEth
          ? estimatedOut
            ? Number(formatUnits(BigInt(estimatedOut), TOKEN_DECIMALS))
            : null
          : Number(amount);
        const ethAmount = fromIsEth
          ? amount
          : estimatedOut
            ? formatEther(BigInt(estimatedOut))
            : null;

        await announceTelegramTrade({
          coinAddress: activeCoin.address,
          coinName: activeCoin.name,
          coinSymbol: activeCoin.symbol || null,
          ethAmount,
          profileId: profile.id,
          source: "swap",
          tokenAmount,
          tradeSide: fromIsEth ? "buy" : "sell",
          transactionHash: receipt.transactionHash,
          walletAddress: fiatWalletAddress,
          walletClient: fiatWalletClient
        }).catch((error) => {
          console.error("Failed to announce swap trade", error);
        });
      }

      if (!isTokenToToken && profile?.id) {
        try {
          const rewardResult = await recordReferralTradeReward({
            chainId: base.id,
            coinAddress: activeCoin.address,
            coinSymbol: activeCoin.symbol || activeCoin.name || "COIN",
            profileId: profile.id,
            tradeAmountIn: parsedAmount,
            tradeAmountOut: receiveAmount,
            tradeSide: fromIsEth ? "buy" : "sell",
            txHash: receipt.transactionHash
          });

          if (rewardResult.rewardGranted) {
            toast.success("Referral reward unlocked", {
              description: `+${Number(rewardResult.rewardAmount || 0).toFixed(
                4
              )} ${rewardResult.rewardSymbol} and +${
                rewardResult.e1xpAwarded || 50
              } E1XP`
            });

            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: [EVERY1_REFERRAL_DASHBOARD_QUERY_KEY, profile.id]
              }),
              queryClient.invalidateQueries({
                queryKey: [EVERY1_NOTIFICATIONS_QUERY_KEY, profile.id]
              }),
              queryClient.invalidateQueries({
                queryKey: [EVERY1_NOTIFICATION_COUNT_QUERY_KEY, profile.id]
              })
            ]);
          }
        } catch (rewardError) {
          console.error("Failed to record referral reward", rewardError);
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["swap-holdings", walletAddress]
        }),
        queryClient.invalidateQueries({
          queryKey: [EVERY1_WALLET_ACTIVITY_QUERY_KEY, profile?.id || null]
        })
      ]);

      setBalanceRefreshIndex((previous) => previous + 1);

      await new Promise((resolve) => setTimeout(resolve, 1400));

      setAmount("");
      setEstimatedOut("");
      setStatusModal(null);
    } catch (error) {
      logActionError("swap.onchain", error, {
        amount: amount || null,
        chainId: base.id,
        coinAddress: activeCoin.address,
        coinSymbol: activeCoin.symbol,
        inputLabel: tradeInputLabel,
        mode: isTokenToToken ? "swap" : fromIsEth ? "buy" : "sell",
        outputLabel: tradeOutputLabel,
        profileId: profile?.id || null,
        receiveAmount
      });
      setStatusModal(null);
      toast.error("Swap failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout
      description="A self-serve swap page for AyoCoin."
      hideDesktopSidebar
      title="Swap"
    >
      <div className="mx-auto w-full max-w-2xl px-3 md:max-w-6xl md:px-6">
        <div className="flex flex-col gap-1.5 md:flex-row md:items-start md:gap-3">
          <div className="flex-1 space-y-1.5 md:space-y-2">
            <Card
              className="overflow-hidden border border-gray-200 bg-white p-2 text-gray-900 md:p-3 dark:border-gray-700 dark:bg-[#0b0b0c] dark:text-white"
              forceRounded
            >
              <div className="flex items-center justify-between gap-1.5 md:gap-2.5">
                <div className="flex shrink-0 items-center gap-1.5">
                  <img
                    alt={activeCoin.name}
                    className="h-8 w-8 rounded-full border-0 object-cover md:h-8 md:w-8 md:border md:border-gray-200"
                    src={activeCoin.avatarUrl}
                  />
                  <div>
                    <p className="font-bold text-[13px] text-gray-900 md:text-[15px] dark:text-gray-100">
                      {activeCoin.symbol}
                    </p>
                    <p className="text-[9px] text-gray-500 md:text-xs dark:text-gray-300">
                      {activeCoin.handle}
                    </p>
                  </div>
                </div>

                <div className="h-8 w-16 flex-none md:h-12 md:w-auto md:flex-1">
                  <svg
                    className="h-full w-full cursor-crosshair"
                    onMouseLeave={handleChartMouseLeave}
                    onMouseMove={handleChartMouseMove}
                    viewBox="0 0 200 50"
                  >
                    <defs>
                      <linearGradient
                        id={gradientId}
                        x1="0"
                        x2="0"
                        y1="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={trendColor}
                          stopOpacity="0.35"
                        />
                        <stop
                          offset="100%"
                          stopColor={trendColor}
                          stopOpacity="0"
                        />
                      </linearGradient>
                    </defs>
                    <path d={chartData.areaPath} fill={`url(#${gradientId})`} />
                    <path
                      d={chartData.linePath}
                      fill="none"
                      stroke={trendColor}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="3"
                    />
                    {chartData.points.length > 0 ? (
                      <g>
                        <circle
                          cx={chartData.points[chartData.points.length - 1].x}
                          cy={chartData.points[chartData.points.length - 1].y}
                          fill={trendColor}
                          opacity="0.18"
                          r="6.5"
                        />
                        <circle
                          cx={chartData.points[chartData.points.length - 1].x}
                          cy={chartData.points[chartData.points.length - 1].y}
                          fill={trendColor}
                          r="3.5"
                          stroke="white"
                          strokeWidth="2"
                        />
                      </g>
                    ) : null}
                    {hover ? (
                      <g>
                        <circle
                          cx={hover.x}
                          cy={hover.y}
                          fill={trendColor}
                          opacity="0.25"
                          r="6"
                          stroke="white"
                          strokeWidth="1.5"
                        />
                        <rect
                          fill="rgba(0,0,0,0.75)"
                          height="18"
                          rx="4"
                          width="54"
                          x={hover.x - 27}
                          y={hover.y - 28}
                        />
                        <text
                          fill="white"
                          fontFamily="sans-serif"
                          fontSize="9"
                          x={hover.x - 23}
                          y={hover.y - 14}
                        >
                          {formatChartNgn(hover.value)}
                        </text>
                      </g>
                    ) : null}
                  </svg>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-right">
                    <p className="font-bold text-[15px] text-gray-900 md:text-[18px] dark:text-gray-100">
                      {formatChartNgn(displayPrice)}
                    </p>
                    <div className="mt-0.5 flex items-center justify-end gap-1 font-semibold text-[10px] text-gray-600 md:text-[11px] dark:text-gray-300">
                      <span>
                        MC {formatCompact(activeCoin.marketCap, usdToNgnRate)}
                      </span>
                      <span className="text-gray-500">|</span>
                      <span
                        className={
                          trendUp
                            ? "text-green-400 md:text-green-600"
                            : "text-pink-400 md:text-pink-600"
                        }
                      >
                        {trendUp ? "Up" : "Down"}{" "}
                        {Math.abs(activeCoin.percentChange).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <button
                    className="hidden text-gray-400 hover:text-gray-600 md:inline-flex"
                    type="button"
                  >
                    <CogIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>

            <div className="flex items-center justify-between gap-2 px-0.5">
              <div className="flex items-center gap-1.5">
                {renderRailToggle()}
                {renderOnchainDirectionToggle()}
              </div>
              {quoteExpiryText ? (
                <p className="text-[10px] text-gray-500 dark:text-white/42">
                  {quoteExpiryText}
                </p>
              ) : null}
            </div>

            <Card
              className="overflow-hidden border border-gray-200/80 bg-white p-1.5 text-gray-900 shadow-none md:hidden dark:border-white/8 dark:bg-[#191b20] dark:text-white"
              forceRounded
            >
              <div className="space-y-0.5">
                <div className="min-h-[5.05rem] rounded-[0.95rem] bg-gray-100 p-1.75 dark:bg-[#2a2b31]">
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[9px] text-gray-500 dark:text-white/38">
                        You Pay
                      </p>
                      <input
                        aria-label="Amount to swap"
                        className="mt-0.5 w-full appearance-none border-0 bg-transparent font-semibold text-[1.35rem] text-gray-900 leading-none shadow-none outline-none ring-0 placeholder:text-gray-400 focus:border-0 focus:outline-none focus:ring-0 dark:text-white/78 dark:placeholder:text-white/16"
                        onChange={(event) => {
                          const next = event.target.value.replace(
                            /[^0-9.]/g,
                            ""
                          );
                          setAmount(next);
                        }}
                        placeholder="0"
                        value={payInputValue}
                      />
                    </div>
                    {renderMobileAssetPill({
                      coin: payCoin,
                      onClick: payCoin
                        ? () =>
                            openCoinPicker(isTokenToToken ? "source" : "target")
                        : undefined,
                      type: isFiatRail
                        ? fromIsEth
                          ? "ngn"
                          : "coin"
                        : fromIsEth
                          ? "eth"
                          : "coin"
                    })}
                  </div>

                  <div className="mt-1 flex items-end justify-between gap-1.5">
                    <button
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-gray-500 dark:bg-[#34363e] dark:text-white/42"
                      onClick={handleMax}
                      type="button"
                    >
                      <ArrowsRightLeftIcon className="h-1.5 w-1.5" />
                    </button>
                    <div className="text-right">
                      <p className="text-[8px] text-gray-500 dark:text-white/68">
                        {payHint}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 -my-1.5 flex justify-center">
                  <button
                    className="inline-flex h-5.5 w-5.5 items-center justify-center rounded-full border-[2px] border-white bg-[#b79cff] text-[#191919] dark:border-[#191b20]"
                    onClick={handleSwapDirectionFlip}
                    type="button"
                  >
                    <ArrowsRightLeftIcon className="h-2 w-2" />
                  </button>
                </div>

                <div className="min-h-[5.05rem] rounded-[0.95rem] bg-gray-100 p-1.75 dark:bg-[#2a2b31]">
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[9px] text-gray-500 dark:text-white/38">
                        You Receive
                      </p>
                      <input
                        aria-label="Amount received"
                        className="mt-0.5 w-full appearance-none border-0 bg-transparent font-semibold text-[1.35rem] text-gray-900 leading-none shadow-none outline-none ring-0 placeholder:text-gray-400 focus:border-0 focus:outline-none focus:ring-0 dark:text-white/78 dark:placeholder:text-white/16"
                        placeholder="0"
                        readOnly
                        value={receiveInputValue}
                      />
                    </div>
                    {renderMobileAssetPill({
                      coin: receiveCoin,
                      onClick: receiveCoin
                        ? () => openCoinPicker("target")
                        : undefined,
                      type: isFiatRail
                        ? fromIsEth
                          ? "coin"
                          : "ngn"
                        : toIsEth
                          ? "eth"
                          : "coin"
                    })}
                  </div>

                  <div className="mt-1 flex items-end justify-end gap-1.5">
                    <div className="text-right">
                      <p className="text-[8px] text-gray-500 dark:text-white/68">
                        {receiveHint}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <div className="px-0.5 md:hidden">
              <Button
                className="w-full rounded-[1rem] border-none bg-[linear-gradient(90deg,#4f46e5_0%,#3b82f6_35%,#7c3aed_100%)] py-2.5 font-semibold text-[13px] text-white hover:opacity-95"
                disabled={!canSubmit}
                loading={loading || fiatQuoteLoading}
                onClick={handleSubmit}
              >
                {swapButtonLabel}
              </Button>
              <p className="mt-1 text-center text-[10px] text-gray-500 dark:text-white/42">
                {swapStatusNote}
              </p>
            </div>

            <Card
              className="hidden overflow-hidden border border-gray-200/80 bg-white p-2.5 text-gray-950 shadow-none md:block md:p-2 dark:border-white/8 dark:bg-[#111217] dark:text-white"
              forceRounded
            >
              <div className="relative">
                <div className="space-y-1.5 md:space-y-1">
                  <div className="rounded-[1.25rem] bg-[#f5efff] p-2.5 md:rounded-[1.2rem] md:p-2 dark:bg-[#1a1c22]">
                    <div className="flex items-start justify-between gap-2 md:gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[10px] text-gray-500 dark:text-white/45">
                          You Pay
                        </p>
                        <input
                          aria-label="Amount to swap"
                          className="mt-1 w-full appearance-none border-0 bg-transparent font-semibold text-[#6d28d9] text-[2rem] leading-none shadow-none outline-none ring-0 placeholder:text-[#b59be9] focus:border-0 focus:outline-none focus:ring-0 md:text-[1.7rem] dark:text-white dark:placeholder:text-white/18"
                          onChange={(event) => {
                            const next = event.target.value.replace(
                              /[^0-9.]/g,
                              ""
                            );
                            setAmount(next);
                          }}
                          placeholder="0"
                          value={payInputValue}
                        />
                      </div>
                      {renderAssetPill({
                        coin: payCoin,
                        onClick: payCoin
                          ? () =>
                              openCoinPicker(
                                isTokenToToken ? "source" : "target"
                              )
                          : undefined,
                        type: isFiatRail
                          ? fromIsEth
                            ? "ngn"
                            : "coin"
                          : fromIsEth
                            ? "eth"
                            : "coin"
                      })}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] md:mt-1.5 md:text-[10px]">
                      <span className="text-gray-500 dark:text-white/42">
                        {payHint}
                      </span>
                      <div className="flex items-center gap-1 text-gray-500 dark:text-white/42">
                        <span className="truncate">
                          Balance: {payBalanceLabel}
                        </span>
                        <button
                          className="font-semibold text-[#6d28d9] dark:text-[#b59be9]"
                          onClick={handleMax}
                          type="button"
                        >
                          Max
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="relative z-10 -my-3.5 flex justify-center md:-my-3">
                    <button
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-[#b79cff] text-[#141414] shadow-[0_10px_22px_-16px_rgba(124,58,237,0.8)] md:h-9 md:w-9 dark:border-[#111217] dark:bg-[#b79cff]"
                      onClick={handleSwapDirectionFlip}
                      type="button"
                    >
                      <ArrowsRightLeftIcon className="h-4.5 w-4.5" />
                    </button>
                  </div>

                  <div className="rounded-[1.25rem] bg-[#f5efff] p-2.5 md:rounded-[1.2rem] md:p-2 dark:bg-[#1a1c22]">
                    <div className="flex items-start justify-between gap-2 md:gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[10px] text-gray-500 dark:text-white/45">
                          You Receive
                        </p>
                        <input
                          aria-label="Amount received"
                          className="mt-1 w-full appearance-none border-0 bg-transparent font-semibold text-[#6d28d9] text-[2rem] leading-none shadow-none outline-none ring-0 placeholder:text-[#b59be9] focus:border-0 focus:outline-none focus:ring-0 md:text-[1.7rem] dark:text-white dark:placeholder:text-white/18"
                          placeholder="0"
                          readOnly
                          value={receiveInputValue}
                        />
                      </div>
                      {renderAssetPill({
                        coin: receiveCoin,
                        onClick: receiveCoin
                          ? () => openCoinPicker("target")
                          : undefined,
                        type: isFiatRail
                          ? fromIsEth
                            ? "coin"
                            : "ngn"
                          : toIsEth
                            ? "eth"
                            : "coin"
                      })}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] md:mt-1.5 md:text-[10px]">
                      <span className="text-gray-500 dark:text-white/42">
                        {receiveHint}
                      </span>
                      <span className="truncate text-gray-500 dark:text-white/42">
                        Balance: {receiveBalanceLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-1.5 rounded-[1rem] border border-gray-200/80 bg-gray-50 px-2.5 py-2 md:px-2.5 md:py-1.5 dark:border-white/8 dark:bg-[#17191f]">
                <div className="flex items-center justify-between text-[10px] text-gray-500 md:text-[10px] dark:text-white/48">
                  <span>Execution</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {isFiatRail
                      ? fiatFunding?.tradeFundingRail === "cngn"
                        ? "Naira wallet flow · cNGN-backed"
                        : "Naira wallet flow"
                      : "Onchain on Base"}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[10px] text-gray-500 md:text-[10px] dark:text-white/48">
                  <span>Route</span>
                  <span className="truncate pl-3 font-semibold text-gray-900 dark:text-white">
                    {tradeRouteLabel}
                  </span>
                </div>
              </div>

              <Button
                className="mt-1.5 w-full rounded-[1.2rem] border-none bg-[linear-gradient(90deg,#4f46e5_0%,#3b82f6_35%,#7c3aed_100%)] py-3 font-semibold text-[14px] text-white hover:opacity-95 md:py-2.5 md:text-sm"
                disabled={!canSubmit}
                loading={loading || fiatQuoteLoading}
                onClick={handleSubmit}
              >
                {swapButtonLabel}
              </Button>
              <p className="mt-1 text-center text-[10px] text-gray-500 md:text-[10px] dark:text-white/42">
                {swapStatusNote}
              </p>
            </Card>

            <Card
              className="overflow-hidden border border-gray-200/80 bg-white p-2 text-gray-900 shadow-none md:hidden dark:border-white/8 dark:bg-[#191b20] dark:text-white"
              forceRounded
            >
              {renderMarketSection()}
            </Card>
          </div>
          <div className="hidden md:block md:w-[20rem] md:shrink-0">
            <Card
              className="overflow-hidden border border-gray-200/80 bg-white p-2 text-gray-900 shadow-none dark:border-white/8 dark:bg-[#191b20] dark:text-white"
              forceRounded
            >
              {renderMarketSection()}
            </Card>
          </div>
        </div>

        {isCoinPickerOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 md:items-center">
            <button
              aria-label="Close coin picker"
              className="absolute inset-0"
              onClick={closeCoinPicker}
              type="button"
            />
            <div
              className="relative w-full max-w-md rounded-3xl border border-gray-200/80 bg-white p-4 text-gray-900 shadow-xl dark:border-white/8 dark:bg-[#141418] dark:text-white"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-base md:text-lg">
                  {coinPickerTarget === "source"
                    ? "Pick source coin"
                    : "Pick target coin"}
                </h3>
                <button
                  aria-label="Close"
                  className="rounded-full p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  onClick={closeCoinPicker}
                  type="button"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2 text-sm dark:bg-[#23232b]">
                <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 dark:text-gray-400" />
                <input
                  className="w-full appearance-none border-0 bg-transparent text-gray-900 text-sm shadow-none outline-none ring-0 placeholder:text-gray-500 focus:border-0 focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-gray-500"
                  onChange={(event) => setCoinQuery(event.target.value)}
                  placeholder="Search"
                  value={coinQuery}
                />
              </div>

              <div className="mt-3 space-y-1">
                {filteredCoins.length ? (
                  filteredCoins.map((coin) => (
                    <button
                      className="flex w-full items-center justify-between rounded-2xl px-2.5 py-2 text-left transition hover:bg-gray-100 dark:hover:bg-[#1f1f26]"
                      key={coin.address}
                      onClick={() => handleCoinSelect(coin)}
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          alt={coin.name}
                          className="h-10 w-10 rounded-full"
                          src={coin.avatarUrl}
                        />
                        <div>
                          <p className="font-semibold text-gray-900 text-sm dark:text-white">
                            {coin.name}
                          </p>
                          <p className="text-gray-500 text-xs dark:text-[#9a9aa2]">
                            {coin.symbol}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="font-semibold text-sm">
                          {formatNgn(coin.priceNgn)}
                        </p>
                        <p
                          className={
                            coin.percentChange >= 0
                              ? "text-green-400 text-xs"
                              : "text-pink-400 text-xs"
                          }
                        >
                          {coin.percentChange >= 0 ? "Up" : "Down"}{" "}
                          {Math.abs(coin.percentChange)}%
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-2xl bg-gray-100 px-3 py-4 text-center text-gray-500 text-sm dark:bg-[#1f1f26] dark:text-[#9a9aa2]">
                    {coinPickerTarget === "source"
                      ? "You need a creator coin balance before you can swap into another coin."
                      : "No coins matched that search."}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {statusModal ? (
          <ActionStatusModal
            description={statusModal.description}
            show={Boolean(statusModal)}
            title={statusModal.title}
            tone={statusModal.tone}
          />
        ) : null}
      </div>
    </PageLayout>
  );
};

export default Swap;
