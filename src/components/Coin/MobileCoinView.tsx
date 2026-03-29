import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild
} from "@headlessui/react";
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  PaperAirplaneIcon,
  ShareIcon
} from "@heroicons/react/24/outline";
import { CheckBadgeIcon } from "@heroicons/react/24/solid";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GetCoinResponse } from "@zoralabs/coins-sdk";
import dayjs from "dayjs";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { Address } from "viem";
import Trade from "@/components/Account/CreatorCoin/Trade";
import CoinFanDropPanel from "@/components/Coin/CoinFanDropPanel";
import CoinMediaSlide from "@/components/Coin/CoinMediaSlide";
import { Image, Spinner } from "@/components/Shared/UI";
import { DEFAULT_AVATAR } from "@/data/constants";
import cn from "@/helpers/cn";
import { resolveCoinMedia } from "@/helpers/coinMedia";
import formatRelativeOrAbsolute from "@/helpers/datetime/formatRelativeOrAbsolute";
import {
  createCoinChatMessage,
  EVERY1_COIN_CHAT_QUERY_KEY
} from "@/helpers/every1";
import formatAddress from "@/helpers/formatAddress";
import {
  formatCompactNaira,
  formatNaira
} from "@/helpers/formatNaira";
import { getPublicProfilePath } from "@/helpers/getAccount";
import type { CoinHolder } from "@/helpers/getCoinHolders";
import type { CoinPriceHistoryPoint } from "@/helpers/getCoinPriceHistory";
import nFormatter from "@/helpers/nFormatter";
import { getSupabaseClient, hasSupabaseConfig } from "@/helpers/supabase";
import useCopyToClipboard from "@/hooks/useCopyToClipboard";
import useOpenAuth from "@/hooks/useOpenAuth";
import useUsdToNgnRate, {
  resolveUsdToNgnRate
} from "@/hooks/useUsdToNgnRate";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";
import type {
  Every1CoinChatMessage,
  Every1FanDropCampaign,
  Every1PublicCoinCollaboration,
  Every1PublicCollaborationMember
} from "@/types/every1";

type MobileCoinTab = "about" | "activity" | "chat" | "fandrop" | "holders";
type MobileTradeMode = "buy" | "sell";
type ChartRange = "1D" | "1H" | "1M" | "1W" | "6H" | "ALL";

type ChartPoint = {
  x: number;
  y: number;
};

const CHART_RANGES: ChartRange[] = ["1H", "6H", "1D", "1W", "1M", "ALL"];

const RANGE_WINDOW_MS: Partial<Record<ChartRange, number>> = {
  "1D": 24 * 60 * 60 * 1000,
  "1H": 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "6H": 6 * 60 * 60 * 1000
};


const buildLinearPath = (points: ChartPoint[]) => {
  if (points.length < 2) {
    return "";
  }

  const d = [`M ${points[0].x} ${points[0].y}`];

  for (let index = 1; index < points.length; index++) {
    d.push(`L ${points[index].x} ${points[index].y}`);
  }

  return d.join(" ");
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatPrice = (value: number, usdToNgnRate: number) => {
  const ngnValue =
    Number.isFinite(value) && value > 0 ? value * usdToNgnRate : 0;

  if (!Number.isFinite(ngnValue) || ngnValue <= 0) {
    return formatNaira(0, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    });
  }

  if (ngnValue >= 1000) {
    return formatCompactNaira(ngnValue, 2);
  }

  if (ngnValue >= 1) {
    return formatNaira(ngnValue, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    });
  }

  if (ngnValue >= 0.1) {
    return formatNaira(ngnValue, {
      maximumFractionDigits: 3,
      minimumFractionDigits: 3
    });
  }

  if (ngnValue >= 0.01) {
    return formatNaira(ngnValue, {
      maximumFractionDigits: 4,
      minimumFractionDigits: 4
    });
  }

  if (ngnValue >= 0.001) {
    return formatNaira(ngnValue, {
      maximumFractionDigits: 6,
      minimumFractionDigits: 4
    });
  }

  return formatNaira(ngnValue, {
    maximumFractionDigits: 8,
    minimumFractionDigits: 4
  });
};

const formatUsdMetric = (
  value: null | number | string | undefined,
  usdToNgnRate: number
) => {
  const numericValue =
    typeof value === "number" ? value : Number.parseFloat(value ?? "");
  const ngnValue =
    Number.isFinite(numericValue) && numericValue > 0
      ? numericValue * usdToNgnRate
      : 0;

  if (!Number.isFinite(ngnValue) || ngnValue <= 0) {
    return formatNaira(0);
  }

  if (ngnValue >= 1000) {
    return formatCompactNaira(ngnValue, 2);
  }

  return formatNaira(ngnValue, {
    maximumFractionDigits: ngnValue >= 1 ? 2 : 4,
    minimumFractionDigits: ngnValue >= 1 ? 2 : 4
  });
};

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  const absolute = Math.abs(value);
  const decimals = absolute >= 100 ? 0 : absolute >= 10 ? 1 : 2;
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${absolute
    .toFixed(decimals)
    .replace(/\.0+$|(\.\d*[1-9])0+$/, "$1")}%`;
};

const formatChatAuthor = (message: Every1CoinChatMessage) => {
  const handle = message.authorUsername?.trim();

  if (handle) {
    return handle.startsWith("@") ? handle : `@${handle}`;
  }

  return message.authorDisplayName?.trim() || "@every1";
};

const formatChatAvatar = (message: Every1CoinChatMessage) =>
  message.authorAvatarUrl || DEFAULT_AVATAR;

const formatCollaborationMemberLabel = (
  member: Every1PublicCollaborationMember
) => {
  if (member.username?.trim()) {
    return member.username.startsWith("@")
      ? member.username
      : `@${member.username}`;
  }

  return member.displayName?.trim() || "Collaborator";
};

const getCollaborationDisplayLabel = (
  collaboration?: Every1PublicCoinCollaboration | null
) =>
  collaboration?.members
    .slice(0, 2)
    .map(
      (member) => member.displayName || formatCollaborationMemberLabel(member)
    )
    .join(" × ") || null;

const getActivityDate = (timestamp?: number | string | null) => {
  if (typeof timestamp === "number") {
    return new Date(
      timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
    );
  }

  if (typeof timestamp === "string") {
    return new Date(timestamp);
  }

  return new Date();
};

const getDayLabel = (date: Date) => {
  const today = dayjs();
  const value = dayjs(date);

  if (value.isSame(today, "day")) {
    return "Today";
  }

  if (value.isSame(today.subtract(1, "day"), "day")) {
    return "Yesterday";
  }

  return value.format("MMM D, YYYY");
};

const formatAge = (createdAt?: null | string) => {
  if (!createdAt) {
    return "New";
  }

  const createdDate = dayjs(createdAt);
  const years = dayjs().diff(createdDate, "year");

  if (years >= 1) {
    return `${years}y`;
  }

  const months = dayjs().diff(createdDate, "month");

  if (months >= 1) {
    return `${months}mo`;
  }

  const days = Math.max(1, dayjs().diff(createdDate, "day"));
  return `${days}d`;
};

const formatAgeLong = (createdAt?: null | string) => {
  if (!createdAt) {
    return "New";
  }

  const createdDate = dayjs(createdAt);
  const years = dayjs().diff(createdDate, "year");

  if (years >= 1) {
    return `${years} ${years === 1 ? "year" : "years"}`;
  }

  const months = dayjs().diff(createdDate, "month");

  if (months >= 1) {
    return `${months} ${months === 1 ? "month" : "months"}`;
  }

  const days = Math.max(1, dayjs().diff(createdDate, "day"));
  return `${days} ${days === 1 ? "day" : "days"}`;
};

const generateChartData = ({
  currentPrice,
  history,
  range,
  usdToNgnRate
}: {
  currentPrice: number;
  history: CoinPriceHistoryPoint[];
  range: ChartRange;
  usdToNgnRate: number;
}) => {
  const width = 340;
  const height = 210;
  const baseline = 214;
  const fallbackPrice =
    currentPrice > 0 ? currentPrice : history.at(-1)?.priceUsd || 1;
  const emptyHistory = !history.length;

  if (emptyHistory) {
    const points = Array.from({ length: 12 }, (_, index) => ({
      x: (width / 11) * index,
      y: height / 2
    }));
    const linePath = buildLinearPath(points);
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;

    return {
      areaPath,
      highLabel: formatPrice(fallbackPrice, usdToNgnRate),
      linePath,
      lowLabel: formatPrice(fallbackPrice, usdToNgnRate),
      points
    };
  }

  const latestTimestamp =
    new Date(history[history.length - 1].timestamp).getTime() || Date.now();
  const rangeWindow = RANGE_WINDOW_MS[range];
  const filteredHistory = rangeWindow
    ? history.filter(
        (point) =>
          new Date(point.timestamp).getTime() >= latestTimestamp - rangeWindow
      )
    : history;
  const sourceHistory = filteredHistory.length ? filteredHistory : history;
  const maxRenderPoints = range === "ALL" ? 220 : 180;
  const timePoints = sourceHistory
    .map((point) => ({
      price: point.priceUsd,
      timestamp: new Date(point.timestamp).getTime()
    }))
    .filter(
      (point) =>
        Number.isFinite(point.price) &&
        point.price > 0 &&
        Number.isFinite(point.timestamp)
    );
  const safeHistory =
    timePoints.length > 1
      ? timePoints
      : [
          timePoints[0] || {
            price: fallbackPrice,
            timestamp: latestTimestamp
          },
          {
            price: timePoints[0]?.price || fallbackPrice,
            timestamp: latestTimestamp + 1
          }
        ];
  const downsampled =
    safeHistory.length > maxRenderPoints
      ? (() => {
          const bucketSize = Math.ceil(safeHistory.length / maxRenderPoints);
          const bucketed: Array<{ price: number; timestamp: number }> = [];

          for (let index = 0; index < safeHistory.length; index += bucketSize) {
            const slice = safeHistory.slice(index, index + bucketSize);

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
      : safeHistory;
  const minTimestamp = downsampled[0]?.timestamp ?? latestTimestamp;
  const maxTimestamp =
    downsampled[downsampled.length - 1]?.timestamp ?? minTimestamp + 1;
  const timeSpan = Math.max(maxTimestamp - minTimestamp, 1);
  const minPrice = Math.min(...downsampled.map((point) => point.price));
  const maxPrice = Math.max(...downsampled.map((point) => point.price));
  const hasMovement = Math.abs(maxPrice - minPrice) > 0.0000001;
  const topPadding = 18;
  const bottomPadding = 22;
  const usableHeight = height - topPadding - bottomPadding;
  const points = downsampled.map((point) => {
    const x = ((point.timestamp - minTimestamp) / timeSpan) * width;
    const normalized = hasMovement
      ? (point.price - minPrice) / Math.max(maxPrice - minPrice, 0.0000001)
      : 0.5;
    const y = height - bottomPadding - clamp(normalized, 0, 1) * usableHeight;

    return { x, y };
  });

  const linePath = buildLinearPath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const areaPath = `${linePath} L ${lastPoint.x} ${baseline} L ${firstPoint.x} ${baseline} Z`;

  return {
    areaPath,
    highLabel: formatPrice(maxPrice || fallbackPrice, usdToNgnRate),
    linePath,
    lowLabel: formatPrice(minPrice || fallbackPrice, usdToNgnRate),
    points
  };
};

interface MobileCoinViewProps {
  address: Address;
  chatterCount: number;
  chartLoading?: boolean;
  chatLoading?: boolean;
  chatMessages: Every1CoinChatMessage[];
  coin: NonNullable<GetCoinResponse["zora20Token"]>;
  collaboration?: Every1PublicCoinCollaboration | null;
  collaborationLookupComplete?: boolean;
  createdAt?: null | string;
  creatorAvatar: string;
  creatorDisplayName: string;
  creatorHandle: string;
  creatorIsOfficial?: boolean;
  description?: null | string;
  fanDropCampaigns: Every1FanDropCampaign[];
  fanDropsLoading?: boolean;
  holderCount: number;
  holdingAmount: number;
  holders: CoinHolder[];
  holdersLoading?: boolean;
  launchCategory?: null | string;
  launchMediaUrl?: null | string;
  priceHistory: CoinPriceHistoryPoint[];
  totalSupply?: null | string;
  totalVolume?: null | string;
}

const MobileCoinView = ({
  address,
  chatterCount,
  chartLoading = false,
  chatLoading = false,
  chatMessages,
  coin,
  collaboration = null,
  collaborationLookupComplete = false,
  createdAt,
  creatorAvatar,
  creatorDisplayName,
  creatorHandle,
  creatorIsOfficial = false,
  description,
  fanDropCampaigns,
  fanDropsLoading = false,
  holderCount,
  holdingAmount,
  holders,
  holdersLoading = false,
  launchCategory,
  launchMediaUrl,
  priceHistory,
  totalSupply,
  totalVolume
}: MobileCoinViewProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openAuth = useOpenAuth();
  const { profile } = useEvery1Store();
  const usdToNgnRateQuery = useUsdToNgnRate();
  const usdToNgnRate = resolveUsdToNgnRate(usdToNgnRateQuery.data);
  const [activeTab, setActiveTab] = useState<MobileCoinTab>("about");
  const [activeRange, setActiveRange] = useState<ChartRange>("6H");
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showContractDetails, setShowContractDetails] = useState(false);
  const [showStatsDetails, setShowStatsDetails] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [tradeMode, setTradeMode] = useState<MobileTradeMode | null>(null);
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);
  const aboutSectionRef = useRef<HTMLDivElement | null>(null);
  const heroSliderRef = useRef<HTMLDivElement | null>(null);
  const chatChannelRef = useRef<null | RealtimeChannel>(null);
  const trackedPresenceRef = useRef(false);
  const copyAddress = useCopyToClipboard(coin.address, "Contract copied");
  const [isRealtimeReady, setIsRealtimeReady] = useState(false);
  const [liveChatterCount, setLiveChatterCount] = useState(chatterCount);
  const hasFansCorner = collaborationLookupComplete && !collaboration;
  const collaborationMembers = collaboration?.members || [];
  const collaborationDisplayLabel = getCollaborationDisplayLabel(collaboration);
  const resolvedLaunchMedia = useMemo(
    () => resolveCoinMedia(launchMediaUrl, launchCategory),
    [launchCategory, launchMediaUrl]
  );
  const heroSlides = resolvedLaunchMedia
    ? (["media", "post", "chart"] as const)
    : (["post", "chart"] as const);
  const creatorUsername = creatorHandle?.trim()
    ? creatorHandle.startsWith("@")
      ? creatorHandle
      : `@${creatorHandle}`
    : creatorDisplayName;
  const openFansCorner = () => {
    if (!hasFansCorner) {
      return;
    }

    setActiveTab("chat");
    aboutSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };
  const scrollToHeroSlide = (nextIndex: number) => {
    const slider = heroSliderRef.current;

    if (!slider) {
      setActiveHeroSlide(nextIndex);
      return;
    }

    const slide = slider.children.item(nextIndex) as HTMLElement | null;

    slider.scrollTo({
      behavior: "smooth",
      left: slide?.offsetLeft || 0
    });
    setActiveHeroSlide(nextIndex);
  };

  const totalSupplyValue = Number.parseFloat(totalSupply ?? "");
  const marketCapValue = Number.parseFloat(coin.marketCap ?? "0");
  const volume24hValue = Number.parseFloat(coin.volume24h ?? "0");
  const totalVolumeValue = Number.parseFloat(totalVolume ?? "");
  const canJoinFansCorner =
    hasFansCorner && Number.isFinite(holdingAmount) && holdingAmount > 0;
  const holderIdentity =
    profile?.id || profile?.walletAddress?.trim().toLowerCase() || null;
  const price =
    Number.isFinite(marketCapValue) &&
    marketCapValue > 0 &&
    Number.isFinite(totalSupplyValue) &&
    totalSupplyValue > 0
      ? marketCapValue / totalSupplyValue
      : 0;
  const tokenPriceUsd = Number.parseFloat(coin.tokenPrice?.priceInUsdc ?? "");
  const displayPriceUsd =
    Number.isFinite(tokenPriceUsd) && tokenPriceUsd > 0
      ? tokenPriceUsd
      : price;
  const delta24hValue = Number.parseFloat(coin.marketCapDelta24h ?? "0");
  const changePercent = useMemo(() => {
    const previous = marketCapValue - delta24hValue;

    if (!previous || !Number.isFinite(previous)) {
      return 0;
    }

    return (delta24hValue / previous) * 100;
  }, [delta24hValue, marketCapValue]);
  const chartData = useMemo(
    () =>
      generateChartData({
        currentPrice: displayPriceUsd || 1,
        history: priceHistory,
        range: activeRange,
        usdToNgnRate
      }),
    [activeRange, displayPriceUsd, priceHistory, usdToNgnRate]
  );
  useEffect(() => {
    setLiveChatterCount(chatterCount);
  }, [chatterCount]);

  useEffect(() => {
    if (!hasFansCorner && activeTab === "chat") {
      setActiveTab("about");
    }
  }, [activeTab, hasFansCorner]);

  useEffect(() => {
    if (!hasSupabaseConfig() || !hasFansCorner) {
      return;
    }

    const supabase = getSupabaseClient();
    const channel = supabase.channel(`coin-fans-corner:${address}`, {
      config: {
        presence: {
          key: holderIdentity || `watcher:${address}`
        }
      }
    });

    const syncPresence = () => {
      const presenceState = channel.presenceState();
      setLiveChatterCount(Object.keys(presenceState).length);
    };

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          filter: `coin_address=eq.${String(address).toLowerCase()}`,
          schema: "public",
          table: "coin_chat_messages"
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: [EVERY1_COIN_CHAT_QUERY_KEY, address]
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsRealtimeReady(true);
          syncPresence();
          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "CLOSED" ||
          status === "TIMED_OUT"
        ) {
          trackedPresenceRef.current = false;
          setIsRealtimeReady(false);
        }
      });

    chatChannelRef.current = channel;

    return () => {
      trackedPresenceRef.current = false;
      setIsRealtimeReady(false);
      chatChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [address, hasFansCorner, holderIdentity, queryClient]);

  useEffect(() => {
    const channel = chatChannelRef.current;

    if (!channel || !isRealtimeReady) {
      return;
    }

    const syncTrackingState = async () => {
      if (activeTab === "chat" && canJoinFansCorner && holderIdentity) {
        if (!trackedPresenceRef.current) {
          await channel.track({
            activeTab: "fans_corner",
            coinAddress: String(address).toLowerCase(),
            joinedAt: new Date().toISOString(),
            profileId: profile?.id || null,
            walletAddress: profile?.walletAddress?.trim().toLowerCase() || null
          });
          trackedPresenceRef.current = true;
        }

        return;
      }

      if (trackedPresenceRef.current) {
        await channel.untrack();
        trackedPresenceRef.current = false;
      }
    };

    void syncTrackingState();
  }, [
    activeTab,
    address,
    canJoinFansCorner,
    holderIdentity,
    isRealtimeReady,
    profile?.id,
    profile?.walletAddress
  ]);
  const descriptionText =
    description?.trim() || `${coin.name} is live on Every1.`;
  const coverImage =
    coin.mediaContent?.previewImage?.medium ||
    coin.mediaContent?.previewImage?.small ||
    creatorAvatar ||
    DEFAULT_AVATAR;

  useEffect(() => {
    setActiveHeroSlide((current) =>
      clamp(current, 0, Math.max(heroSlides.length - 1, 0))
    );
  }, [heroSlides.length]);
  const sendChatMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) {
        throw new Error("missing_profile");
      }

      return createCoinChatMessage({
        body: chatDraft,
        coinAddress: address,
        profileId: profile.id
      });
    },
    onError: (error) => {
      if (error instanceof Error && error.message === "missing_profile") {
        return;
      }

      toast.error("Unable to send message", {
        description:
          error instanceof Error ? error.message : "Please try again."
      });
    },
    onSuccess: async (result) => {
      if (!result.created) {
        toast.error("Unable to send message", {
          description:
            result.reason === "empty_message"
              ? "Write something first."
              : "Please try again."
        });
        return;
      }

      setChatDraft("");
      await queryClient.invalidateQueries({
        queryKey: [EVERY1_COIN_CHAT_QUERY_KEY, address]
      });
    }
  });
  const formattedHoldingAmount = useMemo(() => {
    if (!Number.isFinite(holdingAmount) || holdingAmount <= 0) {
      return "0";
    }

    if (holdingAmount >= 1000) {
      return nFormatter(holdingAmount, 2);
    }

    if (holdingAmount >= 1) {
      return holdingAmount.toFixed(2).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
    }

    return holdingAmount.toFixed(4).replace(/\.?0+$/, "");
  }, [holdingAmount]);
  const shouldClampDescription = descriptionText.length > 110;
  const chatFeedGroups = useMemo(() => {
    const groups = new Map<string, Every1CoinChatMessage[]>();

    for (const message of chatMessages) {
      const label = getDayLabel(getActivityDate(message.createdAt));
      const current = groups.get(label) ?? [];
      current.push(message);
      groups.set(label, current);
    }

    return Array.from(groups.entries()).map(([label, items]) => ({
      items,
      label
    }));
  }, [chatMessages]);
  const recentActivity = useMemo(
    () =>
      [...priceHistory]
        .sort(
          (left, right) =>
            new Date(right.timestamp).getTime() -
            new Date(left.timestamp).getTime()
        )
        .slice(0, 24),
    [priceHistory]
  );
  const mobileTabs: Array<{
    count?: string;
    label: string;
    value: MobileCoinTab;
  }> = [
    { label: "About", value: "about" },
    ...(hasFansCorner
      ? [
          {
            count: nFormatter(liveChatterCount, 1) || "0",
            label: "Fans Corner",
            value: "chat" as const
          }
        ]
      : []),
    {
      count: nFormatter(holderCount, 1) || "0",
      label: "Holders",
      value: "holders"
    },
    {
      count: recentActivity.length
        ? nFormatter(recentActivity.length, 1)
        : undefined,
      label: "Activity",
      value: "activity"
    },
    {
      count: fanDropCampaigns.length
        ? String(fanDropCampaigns.length)
        : undefined,
      label: "FanDrop",
      value: "fandrop"
    }
  ];
  const chatInputPlaceholder = profile?.id
    ? canJoinFansCorner
      ? "Start chatting..."
      : `Hold ${coin.symbol || coin.name} to chat`
    : "Log in to chat";

  const handleSubmitChat = async () => {
    if (!chatDraft.trim()) {
      return;
    }

    if (!profile?.id) {
      await openAuth("coin_chat_open_auth");
      return;
    }

    if (!canJoinFansCorner) {
      toast.error("Fans Corner is holder-only", {
        description: `Buy ${coin.symbol || coin.name} to join the conversation.`
      });
      return;
    }

    sendChatMutation.mutate();
  };

  const compactHeaderRight = (
    <div className="text-right">
      <p className="font-semibold text-[1.15rem] text-gray-950 dark:text-white">
        {formatPrice(displayPriceUsd, usdToNgnRate)}
      </p>
      <p
        className={cn(
          "mt-0.5 font-medium text-[12px]",
          changePercent >= 0 ? "text-emerald-400" : "text-rose-400"
        )}
      >
        {formatPercent(changePercent)}
      </p>
    </div>
  );

  const topActionButtonClassName =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-[0.9rem] border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]";

  const renderHeader = () => (
    <div className="flex items-start justify-between gap-2.5 px-3.5 pt-[max(env(safe-area-inset-top),0.7rem)]">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          className="inline-flex size-8 items-center justify-center rounded-full text-gray-700 dark:text-white/90"
          onClick={() => navigate(-1)}
          type="button"
        >
          <ArrowLeftIcon className="size-4" />
        </button>

        <div className="flex min-w-0 items-center gap-2.5">
          <Image
            alt={coin.name}
            className="size-9 rounded-full border border-gray-200 object-cover dark:border-white/10"
            height={36}
            src={
              coin.mediaContent?.previewImage?.medium ||
              creatorAvatar ||
              DEFAULT_AVATAR
            }
            width={36}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold text-[1.2rem] text-gray-950 leading-none dark:text-white">
                {coin.symbol || coin.name}
              </p>
              {collaboration ? (
                <span className="inline-flex shrink-0 items-center rounded-full bg-sky-500/12 px-2 py-0.5 font-semibold text-[9px] text-sky-700 ring-1 ring-sky-500/20 dark:bg-sky-500/14 dark:text-sky-300 dark:ring-sky-400/20">
                  Collab
                </span>
              ) : null}
              {creatorIsOfficial ? (
                <CheckBadgeIcon className="size-3.5 text-brand-500" />
              ) : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] text-gray-500 dark:text-white/60">
              <span className="truncate">
                {collaborationDisplayLabel || creatorUsername}
              </span>
              <span className="text-gray-300 dark:text-white/30">|</span>
              <button
                className="inline-flex items-center justify-center"
                onClick={copyAddress}
                type="button"
              >
                <ClipboardDocumentIcon className="size-2.5" />
              </button>
              <span className="text-gray-300 dark:text-white/30">|</span>
              <span>{formatAge(createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {activeTab === "chat" ? compactHeaderRight : null}

        <button
          className={topActionButtonClassName}
          onClick={async () => {
            const shareUrl = window.location.href;

            if (navigator.share) {
              try {
                await navigator.share({
                  text: `Trade ${coin.name} on Every1`,
                  title: coin.name,
                  url: shareUrl
                });
                return;
              } catch {}
            }

            try {
              await navigator.clipboard.writeText(shareUrl);
              toast.success("Link copied");
            } catch {
              toast.error("Unable to share right now");
            }
          }}
          type="button"
        >
          <ShareIcon className="size-5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="-mx-4 min-h-screen bg-gray-50 text-gray-950 md:hidden dark:bg-[#090909] dark:text-white">
      {renderHeader()}

      <div
        className={cn(
          activeTab === "chat"
            ? "pb-[calc(env(safe-area-inset-bottom)+9rem)]"
            : "pb-[calc(env(safe-area-inset-bottom)+5.9rem)]"
        )}
      >
        <div className="flex items-start justify-between gap-2.5 px-3.5 pt-3">
          <div>
            <div className="flex flex-wrap items-end gap-x-1.5 gap-y-1">
              <p className="font-semibold text-[1.35rem] text-gray-950 leading-none tracking-tight dark:text-white">
                {formatPrice(displayPriceUsd, usdToNgnRate)}
              </p>
              <p
                className={cn(
                  "inline-flex items-center gap-1 pb-0.5 font-semibold text-[0.75rem] leading-none",
                  changePercent >= 0 ? "text-emerald-400" : "text-rose-400"
                )}
              >
                <span>{changePercent >= 0 ? "+" : "-"}</span>
                <span>{formatPercent(changePercent).replace(/^[-+]/, "")}</span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-[1px] pt-0.5 text-right">
            <div className="inline-flex items-center gap-0.5 whitespace-nowrap">
              <p className="font-medium text-[8px] text-gray-400 uppercase tracking-[0.1em] dark:text-white/45">
                MCAP
              </p>
              <p className="font-semibold text-[0.76rem] text-gray-950 dark:text-white">
                {formatUsdMetric(marketCapValue, usdToNgnRate)}
              </p>
            </div>
            <div className="inline-flex items-center gap-0.5 whitespace-nowrap">
              <p className="font-medium text-[8px] text-gray-400 uppercase tracking-[0.1em] dark:text-white/45">
                VOL
              </p>
              <p className="font-semibold text-[0.76rem] text-gray-950 dark:text-white">
                {formatUsdMetric(volume24hValue, usdToNgnRate)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-2.5 px-3.5">
          <div
            className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth"
            onScroll={(event) => {
              const target = event.currentTarget;
              const slides = Array.from(target.children) as HTMLElement[];

              if (!slides.length) {
                return;
              }

              const nextIndex = slides.reduce((closestIndex, slide, index) => {
                const closestDistance = Math.abs(
                  slides[closestIndex].offsetLeft - target.scrollLeft
                );
                const nextDistance = Math.abs(
                  slide.offsetLeft - target.scrollLeft
                );

                return nextDistance < closestDistance ? index : closestIndex;
              }, 0);

              setActiveHeroSlide(
                clamp(nextIndex, 0, Math.max(heroSlides.length - 1, 0))
              );
            }}
            ref={heroSliderRef}
          >
            {heroSlides.map((slide) => (
              <Fragment key={slide}>
                {slide === "media" ? (
                      <CoinMediaSlide
                        category={launchCategory}
                        coverImage={coverImage}
                        mediaUrl={launchMediaUrl}
                        title={coin.name}
                      />
                ) : slide === "chart" ? (
                  <div className="relative w-full shrink-0 snap-center overflow-hidden rounded-[1rem] border border-gray-200 bg-white px-1.5 py-1 dark:border-white/8 dark:bg-[#0f0f10]">
                    <div className="absolute inset-x-0 top-0 h-10 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.12),_transparent_60%)] dark:bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_60%)]" />
                    {chartLoading ? (
                      <div className="absolute top-3 right-3">
                        <Spinner size="xs" />
                      </div>
                    ) : null}
                    <div className="relative">
                      <div className="flex justify-between px-2.5 text-[10px] text-gray-400 dark:text-white/45">
                        <span>{chartData.highLabel}</span>
                        <span />
                      </div>

                      <svg
                        aria-label={`${coin.name} price chart`}
                        className="mt-0.5 h-[5.6rem] w-full"
                        preserveAspectRatio="none"
                        viewBox="0 0 340 220"
                      >
                        <title>{`${coin.name} price chart`}</title>
                        <defs>
                          <linearGradient
                            id="coin-mobile-chart-gradient"
                            x1="0%"
                            x2="0%"
                            y1="0%"
                            y2="100%"
                          >
                            <stop
                              offset="0%"
                              stopColor="rgba(34,197,94,0.34)"
                            />
                            <stop
                              offset="100%"
                              stopColor="rgba(34,197,94,0)"
                            />
                          </linearGradient>
                        </defs>
                        <path
                          d={chartData.areaPath}
                          fill="url(#coin-mobile-chart-gradient)"
                        />
                        <path
                          d={chartData.linePath}
                          fill="none"
                          stroke="#4ADE80"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="4"
                        />
                        <circle
                          cx={chartData.points[chartData.points.length - 1].x}
                          cy={chartData.points[chartData.points.length - 1].y}
                          fill="rgba(74,222,128,0.18)"
                          r="13"
                        />
                        <circle
                          cx={chartData.points[chartData.points.length - 1].x}
                          cy={chartData.points[chartData.points.length - 1].y}
                          fill="#4ADE80"
                          r="6.5"
                          stroke="#0b0b0b"
                          strokeWidth="4"
                        />
                      </svg>

                      <div className="mt-0.5 flex justify-between px-2.5 text-[10px] text-gray-400 dark:text-white/45">
                        <span>{chartData.lowLabel}</span>
                        <span />
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-0.5">
                          {CHART_RANGES.map((range) => (
                            <button
                              className={cn(
                                "rounded-full px-2 py-1 font-medium text-[9px] transition-colors",
                                activeRange === range
                                  ? "bg-gray-900 text-white dark:bg-white/10 dark:text-white"
                                  : "text-gray-400 dark:text-white/42"
                              )}
                              key={range}
                              onClick={() => setActiveRange(range)}
                              type="button"
                            >
                              {range}
                            </button>
                          ))}
                        </div>

                        <div className="inline-flex h-7 items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 text-[9px] dark:border-white/10 dark:bg-white/[0.04]">
                          <span className="font-medium text-gray-400 uppercase tracking-[0.08em] dark:text-white/45">
                            Hold
                          </span>
                          <span className="font-semibold text-gray-950 dark:text-white">
                            {formattedHoldingAmount}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative h-[11.25rem] w-full shrink-0 snap-center overflow-hidden rounded-[1rem] border border-gray-200 bg-white dark:border-white/8 dark:bg-[#0f0f10]">
                    <Image
                      alt={coin.name}
                      className="h-full w-full object-cover"
                      src={coverImage}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-3 py-3">
                      <div className="flex items-end gap-2.5">
                        {collaborationMembers.length > 1 ? (
                          <div className="relative h-9 w-[3.25rem]">
                            {collaborationMembers
                              .slice(0, 2)
                              .map((member, index) => (
                                <Image
                                  alt={formatCollaborationMemberLabel(member)}
                                  className={cn(
                                    "absolute top-0 size-9 rounded-full border border-white/40 object-cover",
                                    index === 0
                                      ? "left-0 z-10"
                                      : "right-0 z-20"
                                  )}
                                  height={36}
                                  key={member.profileId}
                                  src={member.avatarUrl || DEFAULT_AVATAR}
                                  width={36}
                                />
                              ))}
                          </div>
                        ) : (
                          <Image
                            alt={creatorDisplayName}
                            className="size-9 rounded-full border border-white/40 object-cover"
                            height={36}
                            src={creatorAvatar || DEFAULT_AVATAR}
                            width={36}
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <p className="truncate font-semibold text-[0.95rem] text-white">
                              {collaborationDisplayLabel || creatorDisplayName}
                            </p>
                            {creatorIsOfficial ? (
                              <CheckBadgeIcon className="size-3.5 shrink-0 text-brand-500" />
                            ) : null}
                          </div>
                          <p className="truncate text-[10px] text-white/78">
                            {collaboration
                              ? `${collaboration.activeMemberCount} collaborators`
                              : creatorHandle}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Fragment>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-center gap-1.5">
            {heroSlides.map((slide, index) => (
              <button
                aria-label={
                  slide === "media"
                    ? "Show creator content"
                    : slide === "chart"
                      ? "Show chart"
                      : "Show cover art"
                }
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  activeHeroSlide === index
                    ? "w-5 bg-gray-950 dark:bg-white"
                    : "w-1.5 bg-gray-300 dark:bg-white/20"
                )}
                key={index}
                onClick={() => scrollToHeroSlide(index)}
                type="button"
              />
            ))}
          </div>
        </div>

        <div className="mt-3 px-3.5" ref={aboutSectionRef}>
          <div className="no-scrollbar -mx-0.5 flex gap-1.5 overflow-x-auto pb-1">
            {mobileTabs.map((tab) => (
              <button
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 font-semibold text-[11px] leading-none tracking-tight transition-colors",
                  activeTab === tab.value
                    ? "border-gray-900 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-gray-200 bg-white text-gray-500 dark:border-white/8 dark:bg-[#121212] dark:text-white/55"
                )}
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                type="button"
              >
                <span>{tab.label}</span>
                {tab.count ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px]",
                      activeTab === tab.value
                        ? "bg-white/18 text-white dark:bg-black/10 dark:text-black"
                        : "bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-white/55"
                    )}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "about" ? (
          <div className="px-3.5 pt-2.5">
            {collaboration ? (
              <section className="mb-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-sky-500/12 px-2 py-0.5 font-semibold text-[10px] text-sky-700 ring-1 ring-sky-500/20 dark:bg-sky-500/14 dark:text-sky-300 dark:ring-sky-400/20">
                    Collab
                  </span>
                  <p className="text-[11px] text-gray-500 dark:text-white/45">
                    Shared project
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {collaborationMembers.map((member) => {
                    const profilePath = getPublicProfilePath({
                      address: member.walletAddress,
                      handle: member.username
                    });
                    const content = (
                      <>
                        <Image
                          alt={formatCollaborationMemberLabel(member)}
                          className="size-5 rounded-full object-cover"
                          height={20}
                          src={member.avatarUrl || DEFAULT_AVATAR}
                          width={20}
                        />
                        <span>{formatCollaborationMemberLabel(member)}</span>
                      </>
                    );

                    return profilePath ? (
                      <a
                        className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-[10px] text-gray-700 ring-1 ring-gray-200 dark:bg-[#121212] dark:text-white/85 dark:ring-white/8"
                        href={profilePath}
                        key={member.profileId}
                      >
                        {content}
                      </a>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-[10px] text-gray-700 ring-1 ring-gray-200 dark:bg-[#121212] dark:text-white/85 dark:ring-white/8"
                        key={member.profileId}
                      >
                        {content}
                      </span>
                    );
                  })}
                </div>
              </section>
            ) : null}
            <section>
              <p className="text-[12px] text-gray-700 leading-[1.05rem] dark:text-white/88">
                {showFullDescription || !shouldClampDescription
                  ? descriptionText
                  : `${descriptionText.slice(0, 110).trim()}...`}
              </p>
              {shouldClampDescription ? (
                <button
                  className="mt-1.5 font-medium text-[#9E85FF] text-[12px]"
                  onClick={() => setShowFullDescription((value) => !value)}
                  type="button"
                >
                  {showFullDescription ? "Show less" : "Show more"}
                </button>
              ) : null}
            </section>

            <section className="mt-2 overflow-hidden rounded-[0.82rem] bg-white dark:bg-[#121212]">
              <button
                className="flex w-full items-center justify-between gap-2 px-2.75 py-2 text-left"
                onClick={() => setShowStatsDetails((value) => !value)}
                type="button"
              >
                <div className="min-w-0">
                  <h2 className="font-semibold text-[0.82rem] text-gray-950 dark:text-white">
                    Stats
                  </h2>
                  <p className="mt-0.5 truncate text-[9px] text-gray-500 dark:text-white/42">
                    Coin metrics
                  </p>
                </div>
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 text-gray-500 transition-transform dark:text-white/55",
                    showStatsDetails && "rotate-180"
                  )}
                />
              </button>
              {showStatsDetails ? (
                <div className="px-3 py-2.5">
                  <div className="space-y-2">
                    {[
                      { label: "Age", value: formatAgeLong(createdAt) },
                      {
                        label: "Total Supply",
                        value:
                          Number.isFinite(totalSupplyValue) &&
                          totalSupplyValue > 0
                            ? nFormatter(totalSupplyValue, 2)
                            : "-"
                      },
                      {
                        label: "Fully diluted valuation",
                        value: formatUsdMetric(marketCapValue, usdToNgnRate)
                      },
                      { label: "Liquidity", value: "-" },
                      {
                        label: "Market Cap",
                        value: formatUsdMetric(marketCapValue, usdToNgnRate)
                      },
                      {
                        label: "Volume 24h",
                        value: formatUsdMetric(volume24hValue, usdToNgnRate)
                      },
                      {
                        label: "Total volume",
                        value: formatUsdMetric(
                          Number.isFinite(totalVolumeValue)
                            ? totalVolumeValue
                            : volume24hValue,
                          usdToNgnRate
                        )
                      }
                    ].map((row) => (
                      <div
                        className="flex items-center justify-between gap-3"
                        key={row.label}
                      >
                        <p className="text-[10px] text-gray-400 dark:text-white/38">
                          {row.label}
                        </p>
                        <p className="text-right font-medium text-[11px] text-gray-950 dark:text-white">
                          {row.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="mt-2 overflow-hidden rounded-[0.82rem] bg-white dark:bg-[#121212]">
              <button
                className="flex w-full items-center justify-between gap-2 px-2.75 py-2 text-left"
                onClick={() => setShowContractDetails((value) => !value)}
                type="button"
              >
                <div className="min-w-0">
                  <h2 className="font-semibold text-[0.82rem] text-gray-950 dark:text-white">
                    Contract
                  </h2>
                  <p className="mt-0.5 truncate text-[9px] text-gray-500 dark:text-white/42">
                    Creator + chain
                  </p>
                </div>
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 text-gray-500 transition-transform dark:text-white/55",
                    showContractDetails && "rotate-180"
                  )}
                />
              </button>
              {showContractDetails ? (
                <div className="px-3 py-2.5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] text-gray-400 dark:text-white/38">
                        {collaboration ? "Creators" : "Creator"}
                      </p>
                      <div className="min-w-0 text-right">
                        <div className="flex min-w-0 items-center justify-end gap-1.5">
                          <p className="truncate font-medium text-[11px] text-gray-950 dark:text-white">
                            {collaborationDisplayLabel || creatorDisplayName}
                          </p>
                          {creatorIsOfficial ? (
                            <CheckBadgeIcon className="size-3.5 shrink-0 text-brand-500" />
                          ) : null}
                        </div>
                        <p className="truncate text-[9px] text-gray-500 dark:text-white/45">
                          {collaboration
                            ? `${collaboration.activeMemberCount} collaborators`
                            : creatorHandle}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] text-gray-400 dark:text-white/38">
                        Chain
                      </p>
                      <p className="font-medium text-[11px] text-gray-950 dark:text-white">
                        Base
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] text-gray-400 dark:text-white/38">
                        Contract address
                      </p>
                      <button
                        className="inline-flex items-center gap-1 font-medium text-[11px] text-gray-950 dark:text-white"
                        onClick={copyAddress}
                        type="button"
                      >
                        <span>
                          {formatAddress(coin.address, 4).replace("…", "...")}
                        </span>
                        <ClipboardDocumentIcon className="size-3" />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <button
                        className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[9px] text-gray-700 dark:bg-white/[0.06] dark:text-white/85"
                        onClick={() =>
                          window.open(
                            `https://basescan.org/address/${coin.address}`,
                            "_blank"
                          )
                        }
                        type="button"
                      >
                        <ArrowTopRightOnSquareIcon className="size-3" />
                        Basescan
                      </button>
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[9px] text-gray-700 dark:bg-[#111827] dark:text-white/85">
                        Zora coin
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : activeTab === "holders" ? (
          <div className="px-3.5 pt-2.5">
            <div className="mb-2 flex items-center justify-between gap-3 text-[10px] text-gray-500 dark:text-white/45">
              <p>{nFormatter(holderCount, 1) || "0"} holders</p>
              {Number.isFinite(totalSupplyValue) && totalSupplyValue > 0 ? (
                <p className="truncate text-right">
                  {nFormatter(totalSupplyValue, 2)} {coin.symbol || "COIN"}{" "}
                  supply
                </p>
              ) : null}
            </div>

            {holdersLoading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size="sm" />
              </div>
            ) : holders.length ? (
              <div className="overflow-hidden rounded-[0.95rem] border border-gray-200 bg-white dark:border-white/8 dark:bg-[#121212]">
                <div className="divide-y divide-gray-200 dark:divide-white/8">
                  {holders.slice(0, 30).map((holder, index) => {
                    const profilePath = getPublicProfilePath({
                      address: holder.address,
                      handle: holder.handle
                    });
                    const content = (
                      <>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="w-4 text-[10px] text-gray-400 dark:text-white/35">
                            {index + 1}
                          </span>
                          <Image
                            alt={holder.displayName}
                            className="size-8 rounded-full object-cover"
                            height={32}
                            src={holder.avatar}
                            width={32}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[11px] text-gray-950 dark:text-white">
                              {holder.displayName}
                            </p>
                            <p className="truncate text-[10px] text-gray-500 dark:text-white/42">
                              {holder.handle}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="font-medium text-[11px] text-gray-950 dark:text-white">
                            {holder.percentage.toFixed(
                              holder.percentage >= 1 ? 2 : 3
                            )}
                            %
                          </p>
                          <p className="text-[10px] text-gray-500 dark:text-white/42">
                            {nFormatter(holder.balance, 3)}
                          </p>
                        </div>
                      </>
                    );

                    const className =
                      "flex items-center justify-between gap-3 px-3 py-2.5";

                    return profilePath ? (
                      <a
                        className={className}
                        href={profilePath}
                        key={holder.address}
                      >
                        {content}
                      </a>
                    ) : (
                      <div className={className} key={holder.address}>
                        {content}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[0.85rem] bg-white px-3.5 py-3 text-[11px] text-gray-500 dark:bg-[#121212] dark:text-white/55">
                Holder data is still syncing for this coin.
              </div>
            )}
          </div>
        ) : activeTab === "activity" ? (
          <div className="px-3.5 pt-2.5">
            {chartLoading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size="sm" />
              </div>
            ) : recentActivity.length ? (
              <div className="overflow-hidden rounded-[0.95rem] border border-gray-200 bg-white dark:border-white/8 dark:bg-[#121212]">
                <div className="divide-y divide-gray-200 dark:divide-white/8">
                  {recentActivity.map((activity) => {
                    const profilePath = getPublicProfilePath({
                      address: activity.actorAddress,
                      handle: activity.actorProfileHandle
                    });
                    const activityLabel =
                      activity.activityType === "SELL"
                        ? "Sell"
                        : activity.activityType === "BUY"
                          ? "Buy"
                          : "Trade";
                    const activityTone =
                      activity.activityType === "SELL"
                        ? "text-rose-500"
                        : activity.activityType === "BUY"
                          ? "text-emerald-500"
                          : "text-gray-500 dark:text-white/55";
                    const content = (
                      <>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Image
                            alt={activity.actorHandle}
                            className="size-8 rounded-full object-cover"
                            height={32}
                            src={activity.actorAvatar}
                            width={32}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[11px] text-gray-950 dark:text-white">
                              {activity.actorHandle}
                            </p>
                            <p className="truncate text-[10px] text-gray-500 dark:text-white/42">
                              {formatUsdMetric(activity.totalUsd, usdToNgnRate)} ·{" "}
                              {formatRelativeOrAbsolute(activity.timestamp)}
                            </p>
                          </div>
                        </div>

                        <div className="grid shrink-0 grid-cols-[auto_auto] items-center gap-x-3 text-right">
                          <span
                            className={cn(
                              "font-semibold text-[11px]",
                              activityTone
                            )}
                          >
                            {activityLabel}
                          </span>
                          <span className="font-medium text-[11px] text-gray-950 dark:text-white">
                            {nFormatter(activity.coinAmount, 3)}
                          </span>
                        </div>
                      </>
                    );

                    const className =
                      "flex items-center justify-between gap-3 px-3 py-2.5";

                    return profilePath ? (
                      <a
                        className={className}
                        href={profilePath}
                        key={activity.id}
                      >
                        {content}
                      </a>
                    ) : (
                      <div className={className} key={activity.id}>
                        {content}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[0.85rem] bg-white px-3.5 py-3 text-[11px] text-gray-500 dark:bg-[#121212] dark:text-white/55">
                No trade activity yet.
              </div>
            )}
          </div>
        ) : activeTab === "fandrop" ? (
          <div className="px-3.5 pt-2.5">
            <CoinFanDropPanel
              campaigns={fanDropCampaigns}
              compact
              creatorName={creatorDisplayName}
              loading={fanDropsLoading}
            />
          </div>
        ) : (
          <div className="px-3.5 pt-2.5">
            {canJoinFansCorner ? null : (
              <div className="mb-3 rounded-[0.85rem] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                Fans Corner is holder-only. Buy {coin.symbol || coin.name} to
                join the live chat.
              </div>
            )}
            {chatLoading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size="sm" />
              </div>
            ) : chatFeedGroups.length ? (
              <div className="space-y-3.5">
                {chatFeedGroups.map((group) => (
                  <section key={group.label}>
                    <div className="mb-2 border-gray-200 border-b pb-1 text-[10px] text-gray-400 dark:border-white/8 dark:text-white/45">
                      {group.label}
                    </div>
                    <div className="space-y-2.5">
                      {group.items.map((message) => (
                        <div
                          className="flex items-start gap-2.5"
                          key={message.id}
                        >
                          <Image
                            alt={formatChatAuthor(message)}
                            className="size-7 rounded-full object-cover"
                            height={28}
                            src={formatChatAvatar(message)}
                            width={28}
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-[11px] text-gray-950 dark:text-white">
                              {formatChatAuthor(message)}
                            </p>
                            <p className="mt-0.5 text-[11px] text-gray-700 leading-4.5 dark:text-white/72">
                              {message.body}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[0.85rem] bg-white px-3.5 py-3 text-[11px] text-gray-500 dark:bg-[#121212] dark:text-white/55">
                Start the conversation.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.3rem)] z-20 px-3.5 md:hidden">
        {activeTab === "chat" ? (
          <div className="pointer-events-auto rounded-[0.95rem] border border-gray-200/80 bg-white/88 p-1.5 shadow-[0_10px_28px_-20px_rgba(15,23,42,0.35)] backdrop-blur-xl dark:border-white/8 dark:bg-[#090909]/88 dark:shadow-[0_10px_28px_-20px_rgba(0,0,0,0.95)]">
            <div className="space-y-1.5">
              <button
                className="flex h-8 w-full items-center justify-center rounded-[0.75rem] bg-[#10B981] font-semibold text-[10px] text-black shadow-sm dark:shadow-none"
                onClick={() => setTradeMode("buy")}
                type="button"
              >
                Buy
              </button>

              <form
                className="flex items-center gap-1.5 rounded-[0.78rem] bg-gray-100/92 px-2 py-1.5 dark:bg-[#141414]/94"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSubmitChat();
                }}
              >
                <input
                  className="w-full bg-transparent text-[10px] text-gray-950 outline-hidden placeholder:text-gray-400 dark:text-white dark:placeholder:text-white/35"
                  onChange={(event) => setChatDraft(event.target.value)}
                  placeholder={chatInputPlaceholder}
                  readOnly={!canJoinFansCorner}
                  value={chatDraft}
                />
                <button
                  className="inline-flex size-6 items-center justify-center rounded-full bg-[#10B981] text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    sendChatMutation.isPending ||
                    !canJoinFansCorner ||
                    (profile?.id ? !chatDraft.trim() : false)
                  }
                  type="submit"
                >
                  {sendChatMutation.isPending ? (
                    <Spinner size="xs" />
                  ) : (
                    <PaperAirplaneIcon className="size-3" />
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="pointer-events-auto rounded-[1rem] border border-gray-200/80 bg-white/88 p-2 shadow-[0_10px_28px_-20px_rgba(15,23,42,0.35)] backdrop-blur-xl dark:border-white/8 dark:bg-[#090909]/88 dark:shadow-[0_10px_28px_-20px_rgba(0,0,0,0.95)]">
            <div className="flex items-center gap-2">
              <button
                className="flex h-[2.125rem] flex-1 items-center justify-center rounded-[0.8rem] bg-emerald-600 font-semibold text-[11px] text-white shadow-sm dark:shadow-none"
                onClick={() => setTradeMode("sell")}
                type="button"
              >
                Sell
              </button>
              <button
                className="flex h-[2.125rem] flex-1 items-center justify-center rounded-[0.8rem] bg-emerald-500 font-semibold text-[11px] text-white shadow-sm dark:shadow-none"
                onClick={() => setTradeMode("buy")}
                type="button"
              >
                Buy
              </button>
              {hasFansCorner ? (
                <button
                  aria-label="Open Fans Corner"
                  className="inline-flex size-[2.125rem] items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm dark:shadow-none"
                  onClick={openFansCorner}
                  title="Open Fans Corner"
                  type="button"
                >
                  <ChatBubbleOvalLeftEllipsisIcon className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <Transition as={Fragment} show={Boolean(tradeMode)}>
        <Dialog
          as="div"
          className="relative z-[80] md:hidden"
          onClose={() => setTradeMode(null)}
          open={Boolean(tradeMode)}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
          </TransitionChild>

          <div className="fixed inset-0 flex items-end md:hidden">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-250"
              enterFrom="translate-y-full"
              enterTo="translate-y-0"
              leave="ease-in duration-200"
              leaveFrom="translate-y-0"
              leaveTo="translate-y-full"
            >
              <DialogPanel className="flex h-screen w-full flex-col overflow-hidden bg-white pt-[max(env(safe-area-inset-top),0px)] shadow-2xl supports-[height:100dvh]:h-[100dvh] dark:bg-[#111111]">
                <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-gray-300 dark:bg-white/15" />
                <div className="min-h-0 flex-1">
                  {tradeMode ? (
                    <Trade
                      coin={coin}
                      initialMode={tradeMode}
                      onClose={() => setTradeMode(null)}
                      variant="mobile"
                    />
                  ) : null}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default MobileCoinView;
