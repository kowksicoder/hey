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
import { useAccount, useConfig, useWalletClient } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import PageLayout from "@/components/Shared/PageLayout";
import { ActionStatusModal, Button, Card } from "@/components/Shared/UI";
import { BASE_RPC_URL, DEFAULT_AVATAR } from "@/data/constants";
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
  executeSell,
  executeSupport,
  getSellQuote,
  getSupportQuote
} from "@/helpers/fiat";
import {
  createFiatIdempotencyKey,
  normalizeFiatUiError
} from "@/helpers/fiatUi";
import getZoraApiKey from "@/helpers/getZoraApiKey";
import {
  formatCompactMetric,
  formatDelta,
  isPositiveDelta,
  parseMetricNumber
} from "@/helpers/liveCreatorData";
import {
  fetchPlatformDiscoverCoins,
  mergePriorityItemsByAddress
} from "@/helpers/platformDiscovery";
import useHandleWrongNetwork from "@/hooks/useHandleWrongNetwork";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";
import type { SellExecuteResponse } from "@/types/fiat";

const zoraApiKey = getZoraApiKey();

if (zoraApiKey) {
  setApiKey(zoraApiKey);
}

const USD_TO_NGN_RATE = 1500;
const TOKEN_DECIMALS = 18;

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

type TradeRail = "fiat" | "onchain";
type FiatQuoteState = null | {
  amountLabel: string;
  displayValue: string;
  expiresAt: string;
  quoteId: string;
  settlement?: {
    address: Address;
    transferAmountLabel: string;
    transferAmountRaw: string;
  };
  summary: string;
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

const toNgn = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value * USD_TO_NGN_RATE;
};

const isAddress = (value?: null | string): value is Address =>
  Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));

const buildSwapCoin = (coin: ZoraCoinSummary, balanceToken = 0): Coin => {
  const priceUsd = parseMetricNumber(coin.tokenPrice?.priceInUsdc);
  const marketCap = parseMetricNumber(coin.marketCap);
  const marketCapDelta = parseMetricNumber(coin.marketCapDelta24h);
  const percentChange = computePercentChange(marketCap, marketCapDelta);
  const priceNgn = toNgn(priceUsd);
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

type ChartPoint = { x: number; y: number };

const buildSmoothPath = (points: ChartPoint[]) => {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const smoothing = 0.2;
  const d = [`M ${points[0].x} ${points[0].y}`];

  for (let index = 0; index < points.length - 1; index++) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] ?? current;
    const nextNext = points[index + 2] ?? next;
    const cp1x = current.x + (next.x - previous.x) * smoothing;
    const cp1y = current.y + (next.y - previous.y) * smoothing;
    const cp2x = next.x - (nextNext.x - current.x) * smoothing;
    const cp2y = next.y - (next.y - current.y) * smoothing;
    d.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${next.x} ${next.y}`);
  }

  return d.join(" ");
};

const generateChartData = (
  trend: number,
  volume: number,
  phase: number,
  priceBias: number
): { areaPath: string; linePath: string; points: ChartPoint[] } => {
  const positiveShape = [
    0.34, 0.36, 0.4, 0.46, 0.52, 0.58, 0.61, 0.6, 0.66, 0.7, 0.74, 0.72, 0.77,
    0.8, 0.84, 0.87, 0.9, 0.93
  ];
  const negativeShape = [
    0.88, 0.6, 0.52, 0.57, 0.51, 0.49, 0.48, 0.47, 0.46, 0.46, 0.45, 0.45, 0.44,
    0.43, 0.43, 0.42, 0.42, 0.41
  ];
  const shape = trend >= 0 ? positiveShape : negativeShape;
  const points: ChartPoint[] = [];
  const minY = 6;
  const maxY = 46;
  const maxJitter = Math.min(0.03, (volume / 1_000_000) * 0.03);
  const bias = Math.max(-0.12, Math.min(0.12, priceBias));

  shape.forEach((value, index) => {
    const x = (200 / (shape.length - 1)) * index;
    const jitter = Math.sin(index * 0.9 + phase) * maxJitter;
    const normalized = Math.min(
      0.97,
      Math.max(0.12, value + jitter + bias * 0.35)
    );
    const y = maxY - (maxY - minY) * normalized;
    points.push({ x, y });
  });

  const linePath = buildSmoothPath(points);
  const baseline = 50;
  const last = points[points.length - 1];
  const first = points[0];
  const areaPath = `${linePath} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;

  return { areaPath, linePath, points };
};

const formatCompact = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    maximumFractionDigits: 1,
    notation: "compact"
  }).format(value);

const formatNgn = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    currency: "NGN",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: value >= 100 ? 0 : 2,
    style: "currency"
  }).format(Math.max(0, value));

const formatSwapAmount = (value: number, maxFractionDigits = 6) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits:
      value >= 100 ? Math.min(2, maxFractionDigits) : maxFractionDigits,
    minimumFractionDigits: 0
  }).format(Math.max(0, value));

const formatEthAmount = (value: number, maxFractionDigits = 6) =>
  `${formatSwapAmount(value, maxFractionDigits)} ETH`;

const Swap = () => {
  const { address } = useAccount();
  const config = useConfig();
  const queryClient = useQueryClient();
  const { currentAccount } = useAccountStore();
  const { profile } = useEvery1Store();
  const { data: walletClient } = useWalletClient({ chainId: base.id });
  const { data: signingWalletClient } = useWalletClient();
  const handleWrongNetwork = useHandleWrongNetwork();
  const [amount, setAmount] = useState("0.01");
  const [tradeRail, setTradeRail] = useState<TradeRail>("fiat");
  const [direction, setDirection] = useState<"ethToToken" | "tokenToEth">(
    "ethToToken"
  );
  const [phase, setPhase] = useState(0);
  const [selectedCoin, setSelectedCoin] = useState<null | Coin>(null);
  const [coinQuery, setCoinQuery] = useState("");
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
  const [hover, setHover] = useState<null | {
    value: number;
    x: number;
    y: number;
  }>(null);
  const [isCoinPickerOpen, setIsCoinPickerOpen] = useState(false);
  const walletAddress =
    address ||
    walletClient?.account?.address ||
    currentAccount?.owner ||
    currentAccount?.address ||
    profile?.walletAddress ||
    null;
  const tradeAddress = isAddress(walletAddress) ? walletAddress : undefined;
  const connectedTradeAddress =
    walletClient?.account?.address && isAddress(walletClient.account.address)
      ? walletClient.account.address
      : tradeAddress;
  const fiatWalletClient = signingWalletClient || walletClient;
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: base,
        transport: http(BASE_RPC_URL, { batch: { batchSize: 30 } })
      }),
    []
  );

  useEffect(() => {
    let frame = 0;

    const tick = () => {
      setPhase((previous) => (previous + 0.03) % (Math.PI * 2));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

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

  const walletActivityQuery = useQuery({
    enabled: Boolean(profile?.id),
    queryFn: async () => await listProfileWalletActivity(profile?.id || ""),
    queryKey: [EVERY1_WALLET_ACTIVITY_QUERY_KEY, profile?.id || null]
  });

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
          parseMetricNumber(holding.balance)
        )
      );
  }, [buildSwapCoin, holdingsQuery.data]);

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
      return buildSwapCoin(coin as ZoraCoinSummary, holding?.balanceToken ?? 0);
    });
  }, [
    buildSwapCoin,
    holdingByAddress,
    platformPriorityQuery.data,
    trendingQuery.data
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
  const fromIsEth = direction === "ethToToken";
  const trendUp = activeCoin.percentChange >= 0;
  const trendColor = trendUp ? "#16a34a" : "#db2777";
  const gradientId = `swap-chart-${activeCoin.symbol || "coin"}`;

  useEffect(() => {
    let cancelled = false;

    const readBalances = async () => {
      if (!connectedTradeAddress || !activeCoin.address) {
        if (!cancelled) {
          setEthBalance(0n);
          setTokenBalance(0n);
        }
        return;
      }

      try {
        const [nextEthBalance, nextTokenBalance] = await Promise.all([
          publicClient.getBalance({ address: connectedTradeAddress }),
          publicClient.readContract({
            abi: erc20Abi,
            address: activeCoin.address as Address,
            args: [connectedTradeAddress],
            functionName: "balanceOf"
          })
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
    activeCoin.address,
    balanceRefreshIndex,
    connectedTradeAddress,
    publicClient
  ]);

  const parsedAmount = Number.parseFloat(amount || "0");
  const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const isFiatRail = tradeRail === "fiat";

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
          slippage: 0.1
        };
      }

      return {
        amountIn: parseUnits(amount, TOKEN_DECIMALS),
        buy: { type: "eth" },
        sell: { address: activeCoin.address as Address, type: "erc20" },
        sender,
        slippage: 0.1
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
    isFiatRail
  ]);

  const filteredCoins = useMemo(() => {
    const query = coinQuery.trim().toLowerCase();

    if (!query) {
      return coins;
    }

    return coins.filter(
      (coin) =>
        coin.name.toLowerCase().includes(query) ||
        coin.symbol.toLowerCase().includes(query)
    );
  }, [coinQuery, coins]);

  const animatedPrice = useMemo(() => {
    const wiggle = 0.012;
    const next = activeCoin.priceNgn * (1 + Math.sin(phase) * wiggle);
    return Math.max(1, next);
  }, [activeCoin.priceNgn, phase]);

  const priceBias =
    activeCoin.priceNgn > 0
      ? (animatedPrice - activeCoin.priceNgn) / activeCoin.priceNgn
      : 0;

  const chartData = useMemo(
    () =>
      generateChartData(
        activeCoin.percentChange,
        activeCoin.volume,
        phase,
        priceBias
      ),
    [activeCoin.percentChange, activeCoin.volume, phase, priceBias]
  );

  const formattedEthBalance = Number(formatEther(ethBalance));
  const formattedTokenBalance = Number(
    formatUnits(tokenBalance, TOKEN_DECIMALS)
  );
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
      return fromIsEth
        ? Number(formatUnits(BigInt(estimatedOut), TOKEN_DECIMALS))
        : Number(formatEther(BigInt(estimatedOut)));
    } catch {
      return 0;
    }
  }, [estimatedOut, fromIsEth, isFiatRail]);
  const payInputValue = amount;
  const receiveInputValue = isFiatRail
    ? fiatQuote?.displayValue || "0"
    : receiveAmount > 0
      ? formatSwapAmount(receiveAmount, fromIsEth ? 2 : 6)
      : "0";
  const payBalanceLabel = isFiatRail
    ? fromIsEth
      ? "Every1 Naira wallet"
      : `${formatSwapAmount(formattedTokenBalance, 4)} ${activeCoin.symbol}`
    : fromIsEth
      ? formatEthAmount(formattedEthBalance, formattedEthBalance >= 1 ? 4 : 6)
      : `${formatSwapAmount(formattedTokenBalance, 4)} ${activeCoin.symbol}`;
  const receiveBalanceLabel = isFiatRail
    ? fromIsEth
      ? `${formatSwapAmount(formattedTokenBalance, 4)} ${activeCoin.symbol}`
      : "Every1 Naira wallet"
    : fromIsEth
      ? `${formatSwapAmount(formattedTokenBalance, 4)} ${activeCoin.symbol}`
      : formatEthAmount(formattedEthBalance, formattedEthBalance >= 1 ? 4 : 6);
  const quoteNgnValue =
    receiveAmount > 0
      ? fromIsEth
        ? receiveAmount * activeCoin.priceNgn
        : parsedAmount * activeCoin.priceNgn
      : 0;
  const payHint = isFiatRail
    ? fromIsEth
      ? "Use your Every1 Naira wallet balance"
      : `Sell from your ${activeCoin.symbol} balance`
    : fromIsEth
      ? "Wallet pays gas on Base"
      : `Sell from your ${activeCoin.symbol} balance`;
  const receiveHint = isFiatRail
    ? fiatQuoteError ||
      (fiatQuote
        ? "Secure quote ready"
        : fromIsEth
          ? ""
          : "See your estimated Naira return.")
    : quoteNgnValue > 0
      ? `Approx. ${formatNgn(quoteNgnValue)}`
      : "Live quote";
  const tradeInputLabel = hasValidAmount
    ? fromIsEth
      ? isFiatRail
        ? formatNgn(parsedAmount)
        : formatEthAmount(parsedAmount)
      : `${formatSwapAmount(parsedAmount, 4)} ${activeCoin.symbol}`
    : fromIsEth
      ? isFiatRail
        ? formatNgn(0)
        : "0 ETH"
      : `0 ${activeCoin.symbol}`;
  const tradeOutputLabel = isFiatRail
    ? fiatQuote?.amountLabel || (fromIsEth ? `0 ${activeCoin.symbol}` : "NGN 0")
    : receiveAmount > 0
      ? fromIsEth
        ? `${formatSwapAmount(receiveAmount, 2)} ${activeCoin.symbol}`
        : formatEthAmount(receiveAmount)
      : fromIsEth
        ? `0 ${activeCoin.symbol}`
        : "0 ETH";
  const tradeRouteLabel = isFiatRail
    ? `${tradeInputLabel} -> ${tradeOutputLabel}`
    : receiveAmount > 0
      ? `${tradeInputLabel} -> ${tradeOutputLabel}`
      : fromIsEth
        ? isFiatRail
          ? `NGN to ${activeCoin.symbol}`
          : `ETH to ${activeCoin.symbol}`
        : isFiatRail
          ? `${activeCoin.symbol} to NGN`
          : `${activeCoin.symbol} to ETH`;
  const canSubmit = isFiatRail
    ? Boolean(
        activeCoin.address &&
          connectedTradeAddress &&
          fiatWalletClient?.account &&
          profile?.id &&
          hasValidAmount &&
          hasSufficientBalance &&
          !loading &&
          !fiatQuoteLoading
      )
    : Boolean(
        activeCoin.address &&
          connectedTradeAddress &&
          hasValidAmount &&
          receiveAmount > 0 &&
          hasSufficientBalance &&
          !loading
      );
  const swapButtonLabel = isFiatRail
    ? fiatQuote
      ? fromIsEth
        ? "Confirm buy"
        : "Confirm sell"
      : fiatQuoteLoading
        ? "Getting quote..."
        : fromIsEth
          ? `Get ${activeCoin.symbol} quote`
          : "Get Naira quote"
    : fromIsEth
      ? `Swap to ${activeCoin.symbol}`
      : "Swap to ETH";
  const swapStatusNote = connectedTradeAddress
    ? hasValidAmount
      ? hasSufficientBalance
        ? isFiatRail
          ? fiatQuoteError ||
            fiatQuote?.summary ||
            "Get a secure Naira trade quote, then confirm."
          : "Live quote via Zora on Base."
        : fromIsEth
          ? isFiatRail
            ? "Your Naira wallet balance will be checked at confirmation."
            : "Keep a little ETH aside for gas."
          : `Not enough ${activeCoin.symbol} balance.`
      : isFiatRail
        ? "Enter an amount to request a Naira trade quote."
        : "Enter an amount to get a live quote."
    : "Connect your wallet to swap.";
  const quoteExpiryText = fiatQuote
    ? `Valid until ${new Date(fiatQuote.expiresAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      })}`
    : null;
  const marketTokens = trendingCoins.slice(0, 5);
  const marketHoldings = holdingCoins.slice(0, 5);
  const rewardHistory = (walletActivityQuery.data || []).map((entry) => {
    const rewardAmount = Number(entry.amount) || 0;
    const isPositive = rewardAmount >= 0;
    const cleanAmount = formatSwapAmount(Math.abs(rewardAmount), 2);
    const label =
      entry.activityKind === "collaboration_payout"
        ? "Collaboration payout"
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
  const marketHistory = [...recentSwaps, ...rewardHistory].slice(0, 5);
  const tokensLoading = trendingQuery.isLoading;
  const historyLoading =
    walletActivityQuery.isLoading && recentSwaps.length === 0;
  const holdingsLoading = holdingsQuery.isLoading;

  const handleChartMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const clampedX = Math.max(0, Math.min(rect.width, x));
    const nearest = chartData.points.reduce((previous, point) => {
      const previousDiff = Math.abs(previous.x - (clampedX / rect.width) * 200);
      const currentDiff = Math.abs(point.x - (clampedX / rect.width) * 200);
      return currentDiff < previousDiff ? point : previous;
    }, chartData.points[0]);
    const priceFromY = Math.round(animatedPrice + (50 - nearest.y) * 0.35);

    setHover({
      value: priceFromY,
      x: nearest.x,
      y: nearest.y
    });
  };

  const handleChartMouseLeave = () => setHover(null);

  const closeCoinPicker = () => {
    setCoinQuery("");
    setIsCoinPickerOpen(false);
  };

  const handleCoinSelect = (coin: Coin) => {
    setSelectedCoin(coin);
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

  const handleFiatQuote = async () => {
    if (!profile?.id || !connectedTradeAddress || !fiatWalletClient?.account) {
      toast.error("Connect your wallet to continue.");
      return;
    }

    if (!hasValidAmount) {
      toast.error(
        fromIsEth
          ? "Enter the Naira amount you want to use."
          : `Enter the ${activeCoin.symbol} amount you want to sell.`
      );
      return;
    }

    if (!hasSufficientBalance) {
      toast.error(`Not enough ${activeCoin.symbol} balance.`);
      return;
    }

    try {
      setFiatQuoteLoading(true);
      setFiatQuoteError(null);

      if (fromIsEth) {
        const quote = await getSupportQuote({
          coinAddress: activeCoin.address as Address,
          idempotencyKey: createFiatIdempotencyKey("swap-support-quote"),
          nairaAmount: parsedAmount,
          profileId: profile.id,
          walletAddress: connectedTradeAddress,
          walletClient: fiatWalletClient
        });

        setFiatQuote({
          amountLabel: `${formatSwapAmount(
            quote.estimated_coin_amount,
            2
          )} ${activeCoin.symbol}`,
          displayValue: formatSwapAmount(quote.estimated_coin_amount, 2),
          expiresAt: quote.expires_at,
          quoteId: quote.quote_id,
          summary: `You'll receive approximately ${formatSwapAmount(
            quote.estimated_coin_amount,
            2
          )} ${activeCoin.symbol} after ${formatNgn(quote.fee_naira)} in fees.`
        });
      } else {
        const quote = await getSellQuote({
          coinAddress: activeCoin.address as Address,
          coinAmount: parsedAmount,
          idempotencyKey: createFiatIdempotencyKey("swap-sell-quote"),
          profileId: profile.id,
          walletAddress: connectedTradeAddress,
          walletClient: fiatWalletClient
        });

        setFiatQuote({
          amountLabel: formatNgn(quote.estimated_naira_return),
          displayValue: quote.estimated_naira_return.toLocaleString("en-US", {
            maximumFractionDigits: 0
          }),
          expiresAt: quote.expires_at,
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
          )} in fees once you confirm the secure wallet transfer.`
        });
      }
    } catch (error) {
      const message = normalizeFiatUiError(
        error,
        "Unable to get a Naira quote right now."
      );
      setFiatQuote(null);
      setFiatQuoteError(message);
      toast.error(message);
    } finally {
      setFiatQuoteLoading(false);
    }
  };

  const handleFiatSubmit = async () => {
    if (!profile?.id || !connectedTradeAddress || !fiatWalletClient?.account) {
      toast.error("Connect your wallet to continue.");
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
        ? await executeSupport({
            idempotencyKey: createFiatIdempotencyKey("swap-support-execute"),
            profileId: profile.id,
            quoteId: fiatQuote.quoteId,
            walletAddress: connectedTradeAddress,
            walletClient: fiatWalletClient
          })
        : await (async () => {
            const settlement = fiatQuote.settlement;

            if (!settlement) {
              throw new Error(
                "This sell quote is missing its settlement instructions."
              );
            }

            await handleWrongNetwork({ chainId: base.id });
            const client =
              (await getWalletClient(config, { chainId: base.id })) ||
              walletClient;

            if (!client?.account) {
              throw new Error("Connect a Base wallet to complete this sell.");
            }

            const transferHash = await client.writeContract({
              abi: erc20Abi,
              account: client.account,
              address: activeCoin.address as Address,
              args: [settlement.address, BigInt(settlement.transferAmountRaw)],
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
              idempotencyKey: createFiatIdempotencyKey("swap-sell-execute"),
              profileId: profile.id,
              quoteId: fiatQuote.quoteId,
              transactionHash: transferHash,
              walletAddress: connectedTradeAddress,
              walletClient: fiatWalletClient
            });
          })();

      if (!response.success) {
        throw new Error(response.message || "Unable to complete this request.");
      }

      if (response.status === "failed") {
        throw new Error(
          response.message || "This buy trade could not be completed."
        );
      }

      setStatusModal({
        description: response.message,
        title: fromIsEth
          ? response.status === "completed"
            ? "Buy completed!"
            : "Buy finalizing"
          : response.status === "completed"
            ? "Sell completed!"
            : "Sell finalizing",
        tone: response.status === "completed" ? "success" : "pending"
      });

      const recentSwapEntry = fromIsEth
        ? {
            amount: `+${fiatQuote.amountLabel}`,
            id: `${fiatQuote.quoteId}-${Date.now()}`,
            isPositive: true,
            label: `Bought ${activeCoin.symbol}`,
            meta: `${tradeRouteLabel} - Just now`
          }
        : (() => {
            const sellResponse = response as SellExecuteResponse;

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

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["fiat-wallet"]
        }),
        queryClient.invalidateQueries({
          queryKey: ["fiat-wallet-transactions"]
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
    eth,
    onClick
  }: {
    eth: boolean;
    onClick?: () => void;
  }) => {
    if (eth) {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full border-0 bg-white px-2.5 py-1.5 font-semibold text-gray-900 text-xs shadow-none ring-0 md:gap-1.5 md:px-2.5 md:py-1.5 md:text-xs dark:bg-[#2b2d34] dark:text-white">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[11px] md:h-6 md:w-6 md:text-[11px]",
              isFiatRail
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                : "bg-[#ece7ff] text-[#6d28d9] dark:bg-black/25 dark:text-white"
            )}
          >
            {isFiatRail ? "NGN" : "ETH"}
          </span>
          {isFiatRail ? "NGN" : "ETH"}
        </div>
      );
    }

    const Comp = onClick ? "button" : "div";

    return (
      <Comp
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border-0 bg-white px-2.5 py-1.5 font-semibold text-gray-900 text-xs shadow-none outline-none ring-0 md:gap-1.5 md:px-2.5 md:py-1.5 md:text-xs dark:bg-[#2b2d34] dark:text-white",
          onClick ? "transition hover:scale-[0.98]" : ""
        )}
        {...(onClick ? { onClick, type: "button" as const } : {})}
      >
        <img
          alt={activeCoin.name}
          className="h-6 w-6 rounded-full md:h-6 md:w-6"
          src={activeCoin.avatarUrl}
        />
        {activeCoin.symbol}
        {onClick ? (
          <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400 dark:text-white/60" />
        ) : null}
      </Comp>
    );
  };

  const renderMobileAssetPill = ({
    eth,
    onClick
  }: {
    eth: boolean;
    onClick?: () => void;
  }) => {
    if (eth) {
      return (
        <div className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-1 font-semibold text-[10px] text-gray-900 dark:bg-[#34363e] dark:text-white">
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-[9px]",
              isFiatRail
                ? "bg-emerald-500 text-white"
                : "bg-[#d9cffc] text-[#3b2a6d] dark:bg-[#4a3f73] dark:text-white"
            )}
          >
            {isFiatRail ? "NGN" : "ETH"}
          </span>
          {isFiatRail ? "NGN" : "ETH"}
        </div>
      );
    }

    const Comp = onClick ? "button" : "div";

    return (
      <Comp
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-1 font-semibold text-[10px] text-gray-900 dark:bg-[#3a3c44] dark:text-white",
          onClick ? "transition active:scale-[0.98]" : ""
        )}
        {...(onClick ? { onClick, type: "button" as const } : {})}
      >
        <img
          alt={activeCoin.name}
          className="h-5 w-5 rounded-full"
          src={activeCoin.avatarUrl}
        />
        {activeCoin.symbol}
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#9b7bff] text-[#161616] text-[9px]">
          ✓
        </span>
        {onClick ? (
          <ChevronDownIcon className="h-3 w-3 text-gray-500 dark:text-white/55" />
        ) : null}
      </Comp>
    );
  };

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
        <>
          <div className="mb-2 flex items-center gap-1.5">
            {["Rank", "Base", "24h"].map((filter) => (
              <button
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 font-semibold text-[10px] text-gray-600 dark:bg-[#2a2b31] dark:text-white/82"
                key={filter}
                type="button"
              >
                {filter}
                <ChevronDownIcon className="h-3 w-3 text-gray-400 dark:text-white/45" />
              </button>
            ))}
          </div>

          {tokensLoading ? (
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
                          {formatCompactMetric(entry.marketCap)} MC
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
          )}
        </>
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

    const senderAddress = connectedTradeAddress;

    if (!senderAddress || !isAddress(senderAddress)) {
      toast.error("Connect a wallet to swap");
      return;
    }

    if (!hasSufficientBalance) {
      toast.error(
        fromIsEth
          ? "Not enough ETH balance for this swap"
          : `Not enough ${activeCoin.symbol} balance`
      );
      return;
    }

    const initialParams = makeTradeParams(senderAddress);

    if (!initialParams) {
      toast.error("Enter a valid amount to swap");
      return;
    }

    try {
      setLoading(true);
      setStatusModal({
        description: "Please wait while we complete your swap.",
        title: `Swapping ${tradeInputLabel} - ${tradeOutputLabel}`,
        tone: "pending"
      });

      await handleWrongNetwork({ chainId: base.id });

      const client =
        (await getWalletClient(config, { chainId: base.id })) || walletClient;
      const clientSender = client?.account?.address || senderAddress;

      if (!client || !isAddress(clientSender)) {
        setStatusModal(null);
        toast.error("Please connect a wallet on Base");
        return;
      }

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
          label: fromIsEth
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

      if (profile?.id) {
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
      console.error("Swap failed", error);
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
                          {formatNgn(hover.value)}
                        </text>
                      </g>
                    ) : null}
                  </svg>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-right">
                    <p className="font-bold text-[15px] text-gray-900 md:text-[18px] dark:text-gray-100">
                      {formatNgn(Math.round(animatedPrice))}
                    </p>
                    <div className="mt-0.5 flex items-center justify-end gap-1 font-semibold text-[10px] text-gray-600 md:text-[11px] dark:text-gray-300">
                      <span className="hidden md:inline">
                        MC {formatCompact(activeCoin.marketCap)}
                      </span>
                      <span className="hidden text-gray-500 md:inline">|</span>
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
              <div className="inline-flex rounded-full bg-gray-100 p-1 dark:bg-[#1b1d22]">
                {(
                  [
                    { label: "Naira", value: "fiat" },
                    { label: "Onchain", value: "onchain" }
                  ] as const
                ).map((option) => (
                  <button
                    className={cn(
                      "rounded-full px-3 py-1.5 font-semibold text-[11px] transition-colors",
                      tradeRail === option.value
                        ? "bg-gray-950 text-white dark:bg-white dark:text-[#111111]"
                        : "text-gray-500 dark:text-white/60"
                    )}
                    key={option.value}
                    onClick={() => setTradeRail(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
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
                      eth: fromIsEth,
                      onClick: fromIsEth
                        ? undefined
                        : () => setIsCoinPickerOpen(true)
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
                    onClick={() =>
                      setDirection((previous) =>
                        previous === "ethToToken" ? "tokenToEth" : "ethToToken"
                      )
                    }
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
                      eth: !fromIsEth,
                      onClick: fromIsEth
                        ? () => setIsCoinPickerOpen(true)
                        : undefined
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
                        eth: fromIsEth,
                        onClick: fromIsEth
                          ? undefined
                          : () => setIsCoinPickerOpen(true)
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
                      onClick={() =>
                        setDirection((previous) =>
                          previous === "ethToToken"
                            ? "tokenToEth"
                            : "ethToToken"
                        )
                      }
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
                        eth: !fromIsEth,
                        onClick: fromIsEth
                          ? () => setIsCoinPickerOpen(true)
                          : undefined
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
                    {isFiatRail ? "Naira wallet flow" : "Onchain on Base"}
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
                  Pick coin
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
                {filteredCoins.map((coin) => (
                  <button
                    className="flex w-full items-center justify-between rounded-2xl px-2.5 py-2 text-left transition hover:bg-gray-100 dark:hover:bg-[#1f1f26]"
                    key={coin.symbol}
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
                ))}
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
