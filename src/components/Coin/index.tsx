import {
  ArrowTopRightOnSquareIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  ClipboardDocumentIcon,
  EllipsisHorizontalIcon,
  ExclamationTriangleIcon
} from "@heroicons/react/24/outline";
import { CheckBadgeIcon } from "@heroicons/react/24/solid";
import { useQuery } from "@tanstack/react-query";
import {
  type GetCoinCommentsResponse,
  type GetCoinResponse,
  getCoinComments,
  getProfile,
  setApiKey
} from "@zoralabs/coins-sdk";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import {
  type Address,
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  isAddress
} from "viem";
import { base } from "viem/chains";
import { useAccount } from "wagmi";
import Trade from "@/components/Account/CreatorCoin/Trade";
import CoinFanDropPanel from "@/components/Coin/CoinFanDropPanel";
import CoinMediaPanel from "@/components/Coin/CoinMediaPanel";
import PageLayout from "@/components/Shared/PageLayout";
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Image,
  Spinner,
  Tabs
} from "@/components/Shared/UI";
import { BASE_RPC_URL, DEFAULT_AVATAR } from "@/data/constants";
import cn from "@/helpers/cn";
import formatRelativeOrAbsolute from "@/helpers/datetime/formatRelativeOrAbsolute";
import {
  EVERY1_COIN_CHAT_QUERY_KEY,
  EVERY1_FANDROPS_QUERY_KEY,
  EVERY1_PUBLIC_COIN_COLLABORATIONS_QUERY_KEY,
  getProfileFanDrops,
  getPublicEvery1Profile,
  listCoinChatMessages,
  listPublicCoinCollaborations
} from "@/helpers/every1";
import formatAddress from "@/helpers/formatAddress";
import { formatCompactNaira, NAIRA_SYMBOL } from "@/helpers/formatNaira";
import { getPublicProfilePath } from "@/helpers/getAccount";
import getCoinHolders from "@/helpers/getCoinHolders";
import getCoinPriceHistory from "@/helpers/getCoinPriceHistory";
import getZoraApiKey from "@/helpers/getZoraApiKey";
import nFormatter from "@/helpers/nFormatter";
import { getSupabaseClient, hasSupabaseConfig } from "@/helpers/supabase";
import useCopyToClipboard from "@/hooks/useCopyToClipboard";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";
import type {
  Every1FanDropCampaign,
  Every1PublicCollaborationMember
} from "@/types/every1";
import MobileCoinView from "./MobileCoinView";

type CommentNode = NonNullable<
  NonNullable<
    NonNullable<GetCoinCommentsResponse["zora20Token"]>["zoraComments"]
  >["edges"]
>[number]["node"];

type CoinPageTab = "activity" | "comments" | "details" | "fandrop" | "holders";

type CreatorLaunchRow = {
  category: null | string;
  created_by: string;
  media_url: null | string;
};

const zoraApiKey = getZoraApiKey();

if (zoraApiKey) {
  setApiKey(zoraApiKey);
}

const formatUsdMetric = (value?: null | string) => {
  const number = Number.parseFloat(value ?? "");

  return formatCompactNaira(number, 2);
};

const formatDelta = (value?: null | string) => {
  const number = Number.parseFloat(value ?? "");

  if (!Number.isFinite(number)) {
    return "0%";
  }

  const absoluteValue = Math.abs(number);
  const digits = absoluteValue >= 100 ? 0 : absoluteValue >= 10 ? 1 : 2;
  const prefix = number > 0 ? "+" : number < 0 ? "-" : "";

  return `${prefix}${absoluteValue
    .toFixed(digits)
    .replace(/\.0+$|(\.\d*[1-9])0+$/, "$1")}%`;
};

const formatCommentAuthor = (comment: CommentNode) => {
  const handle = comment?.userProfile?.handle;

  if (handle?.trim()) {
    return handle.startsWith("@") ? handle : `@${handle}`;
  }

  return formatAddress(comment?.userAddress);
};

const formatCommentAvatar = (comment: CommentNode) =>
  comment?.userProfile?.avatar?.previewImage?.small ||
  comment?.userProfile?.avatar?.previewImage?.medium ||
  DEFAULT_AVATAR;

const getCoinPreview = (
  coin?: null | NonNullable<GetCoinResponse["zora20Token"]>
) => {
  if (!coin) {
    return undefined;
  }

  const coinWithMedia = coin as NonNullable<GetCoinResponse["zora20Token"]> & {
    mediaContent?: {
      previewImage?: {
        medium?: null | string;
        small?: null | string;
      };
    };
  };

  return (
    coinWithMedia.mediaContent?.previewImage?.medium ||
    coinWithMedia.mediaContent?.previewImage?.small ||
    undefined
  );
};

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

const Coin = () => {
  const { address } = useParams();
  const [activeTab, setActiveTab] = useState<CoinPageTab>("comments");
  const { address: connectedAddress } = useAccount();
  const { profile } = useEvery1Store();
  const normalizedAddress = useMemo(
    () => address?.trim().toLowerCase() ?? "",
    [address]
  );
  const isValidAddress = isAddress(normalizedAddress);
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: base,
        transport: http(BASE_RPC_URL, { batch: { batchSize: 30 } })
      }),
    []
  );

  const coinQuery = useQuery<GetCoinResponse["zora20Token"] | null, Error>({
    enabled: Boolean(isValidAddress),
    queryFn: async () => {
      const { getCoin } = await import("@zoralabs/coins-sdk");
      const response = await getCoin({
        address: normalizedAddress as Address,
        chain: base.id
      });

      return response.data?.zora20Token ?? null;
    },
    queryKey: ["coin-page", normalizedAddress],
    refetchInterval: 12000
  });

  const coin = coinQuery.data;
  const coinRecord = useMemo(
    () =>
      (coin as
        | (NonNullable<GetCoinResponse["zora20Token"]> & {
            createdAt?: null | string;
            creatorAddress?: null | string;
            creatorProfile?: {
              avatar?: {
                medium?: null | string;
                previewImage?: {
                  medium?: null | string;
                  small?: null | string;
                };
                small?: null | string;
              };
              displayName?: null | string;
              handle?: null | string;
              username?: null | string;
            };
            description?: null | string;
            totalSupply?: null | string;
            totalVolume?: null | string;
          })
        | null) ?? null,
    [coin]
  );

  const creatorIdentifier =
    coinRecord?.creatorProfile?.handle || coinRecord?.creatorAddress || null;

  const creatorQuery = useQuery({
    enabled: Boolean(creatorIdentifier),
    queryFn: async () => {
      if (!creatorIdentifier) {
        return null;
      }

      const response = await getProfile({ identifier: creatorIdentifier });
      return response.data?.profile ?? null;
    },
    queryKey: ["coin-page-creator", creatorIdentifier]
  });
  const creatorEvery1ProfileQuery = useQuery({
    enabled: Boolean(coinRecord?.creatorAddress || creatorQuery.data?.handle),
    queryFn: async () =>
      getPublicEvery1Profile({
        address: coinRecord?.creatorAddress || null,
        username:
          creatorQuery.data?.handle || coinRecord?.creatorProfile?.handle
      }),
    queryKey: [
      "coin-page-creator-every1",
      coinRecord?.creatorAddress?.toLowerCase(),
      creatorQuery.data?.handle || coinRecord?.creatorProfile?.handle
    ]
  });
  const collaborationQuery = useQuery({
    enabled: Boolean(isValidAddress),
    queryFn: async () =>
      (await listPublicCoinCollaborations([normalizedAddress]))[0] ?? null,
    queryKey: [EVERY1_PUBLIC_COIN_COLLABORATIONS_QUERY_KEY, normalizedAddress]
  });
  const creatorLaunchQuery = useQuery<CreatorLaunchRow | null, Error>({
    enabled: hasSupabaseConfig() && Boolean(isValidAddress),
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("creator_launches")
        .select("category, created_by, media_url")
        .eq("status", "launched")
        .eq("coin_address", normalizedAddress)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return (data as CreatorLaunchRow | null) ?? null;
    },
    queryKey: ["coin-page-launch", normalizedAddress]
  });

  const commentsQuery = useQuery({
    enabled: Boolean(isValidAddress),
    queryFn: async () => {
      const response = await getCoinComments({
        address: normalizedAddress,
        count: 12
      });

      const comments =
        response.data?.zora20Token?.zoraComments?.edges?.flatMap((edge) =>
          edge?.node ? [edge.node] : []
        ) ?? [];

      return {
        comments,
        count:
          response.data?.zora20Token?.zoraComments?.count ?? comments.length
      };
    },
    queryKey: ["coin-page-comments", normalizedAddress],
    refetchInterval: 15000
  });
  const coinChatQuery = useQuery({
    enabled:
      hasSupabaseConfig() &&
      Boolean(isValidAddress) &&
      collaborationQuery.isFetched &&
      !collaborationQuery.data,
    queryFn: async () =>
      listCoinChatMessages({
        coinAddress: normalizedAddress,
        limit: 120
      }),
    queryKey: [EVERY1_COIN_CHAT_QUERY_KEY, normalizedAddress],
    refetchInterval: 30000
  });
  const coinPriceHistoryQuery = useQuery({
    enabled: Boolean(isValidAddress),
    queryFn: async () =>
      getCoinPriceHistory({
        address: normalizedAddress as Address
      }),
    queryKey: ["coin-price-history", normalizedAddress],
    refetchInterval: 30000
  });

  const holdersQuery = useQuery({
    enabled: Boolean(isValidAddress && coin),
    queryFn: async () =>
      getCoinHolders({
        address: normalizedAddress as Address,
        createdAt: coinRecord?.createdAt,
        totalSupply: coinRecord?.totalSupply
      }),
    queryKey: ["coin-page-holders", normalizedAddress, coinRecord?.createdAt],
    refetchInterval: 30000
  });
  const holdingQuery = useQuery<number, Error>({
    enabled: Boolean(isValidAddress && connectedAddress && coin?.address),
    queryFn: async () => {
      const balance = await publicClient.readContract({
        abi: erc20Abi,
        address: normalizedAddress as Address,
        args: [connectedAddress as Address],
        functionName: "balanceOf"
      });

      return Number.parseFloat(formatUnits(balance as bigint, 18));
    },
    queryKey: ["coin-page-holding", normalizedAddress, connectedAddress],
    refetchInterval: 12000
  });
  const creatorProfileId =
    creatorLaunchQuery.data?.created_by || creatorEvery1ProfileQuery.data?.id;
  const fanDropsQuery = useQuery<Every1FanDropCampaign[], Error>({
    enabled: hasSupabaseConfig() && Boolean(creatorProfileId),
    queryFn: async () => {
      const campaigns = await getProfileFanDrops({
        profileId: profile?.id || null
      });

      return campaigns.filter(
        (campaign) => campaign.creatorProfileId === creatorProfileId
      );
    },
    queryKey: [
      EVERY1_FANDROPS_QUERY_KEY,
      "coin-page",
      profile?.id || null,
      creatorProfileId || null
    ],
    staleTime: 15000
  });

  const pageTitle = coin?.symbol
    ? `Trade ${NAIRA_SYMBOL}${coin.symbol}`
    : "Trade coin";
  const previewImage = getCoinPreview(coin ?? null);
  const creatorHandle = creatorQuery.data?.handle?.trim()
    ? creatorQuery.data.handle.startsWith("@")
      ? creatorQuery.data.handle
      : `@${creatorQuery.data.handle}`
    : coinRecord?.creatorProfile?.handle?.trim()
      ? coinRecord.creatorProfile.handle.startsWith("@")
        ? coinRecord.creatorProfile.handle
        : `@${coinRecord.creatorProfile.handle}`
      : coinRecord?.creatorAddress
        ? formatAddress(coinRecord.creatorAddress)
        : "@every1";
  const creatorAvatar =
    creatorQuery.data?.avatar?.medium ||
    creatorQuery.data?.avatar?.small ||
    coinRecord?.creatorProfile?.avatar?.medium ||
    coinRecord?.creatorProfile?.avatar?.previewImage?.medium ||
    coinRecord?.creatorProfile?.avatar?.previewImage?.small ||
    previewImage ||
    DEFAULT_AVATAR;
  const creatorDisplayName =
    creatorQuery.data?.displayName?.trim() ||
    creatorQuery.data?.username?.trim() ||
    coinRecord?.creatorProfile?.displayName?.trim() ||
    coinRecord?.creatorProfile?.username?.trim() ||
    creatorHandle;
  const creatorIsOfficial =
    creatorEvery1ProfileQuery.data?.verificationStatus === "verified";
  const collaboration = collaborationQuery.data;
  const collaborationLookupComplete = collaborationQuery.isFetched;
  const collaborationMembers = useMemo(
    () => collaboration?.members || [],
    [collaboration]
  );
  const hasFansCorner = collaborationLookupComplete && !collaboration;
  const comments = commentsQuery.data?.comments ?? [];
  const commentCount = commentsQuery.data?.count ?? 0;
  const chatMessages = coinChatQuery.data ?? [];
  const chatterCount = useMemo(
    () =>
      new Set(
        chatMessages
          .map((message) => message.authorProfileId || message.id)
          .filter(Boolean)
      ).size,
    [chatMessages]
  );
  const holders = holdersQuery.data ?? [];
  const holderCount = coin?.uniqueHolders ?? holders.length;
  const holdingAmount = holdingQuery.data ?? 0;
  const fanDropCampaigns = fanDropsQuery.data ?? [];
  const launchCategory = creatorLaunchQuery.data?.category || null;
  const launchMediaUrl = creatorLaunchQuery.data?.media_url || null;
  const copyAddress = useCopyToClipboard(
    coin?.address ?? "",
    "Coin address copied"
  );
  const collaborationDisplayName = useMemo(() => {
    if (!collaborationMembers.length) {
      return null;
    }

    return collaborationMembers
      .slice(0, 2)
      .map(
        (member) => member.displayName || formatCollaborationMemberLabel(member)
      )
      .join(" × ");
  }, [collaborationMembers]);

  const detailCards = coin
    ? [
        {
          label: "Market Cap",
          tone: "default" as const,
          value: formatUsdMetric(coin.marketCap)
        },
        {
          label: "24H Volume",
          tone: "default" as const,
          value: formatUsdMetric(coin.volume24h)
        },
        {
          label: "Holders",
          tone: "default" as const,
          value: nFormatter(coin.uniqueHolders ?? 0, 1) || "0"
        }
      ]
    : [];

  const renderDesktopTabContent = () => {
    if (!coin) {
      return null;
    }

    if (activeTab === "comments") {
      if (commentsQuery.isLoading) {
        return (
          <div className="flex min-h-[10rem] items-center justify-center">
            <Spinner size="sm" />
          </div>
        );
      }

      if (!comments.length) {
        return (
          <div className="rounded-[1.5rem] border border-gray-200 bg-white px-5 py-8 text-center text-gray-500 dark:border-gray-800 dark:bg-black dark:text-gray-400">
            No comments yet.
          </div>
        );
      }

      return (
        <div className="space-y-3">
          {comments.slice(0, 4).map((comment) => (
            <div
              className="rounded-[1.35rem] border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-black"
              key={comment.commentId}
            >
              <div className="flex items-start gap-3">
                <Image
                  alt={formatCommentAuthor(comment)}
                  className="size-10 rounded-full object-cover"
                  height={40}
                  src={formatCommentAvatar(comment)}
                  width={40}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-semibold text-gray-950 text-sm dark:text-gray-50">
                      {formatCommentAuthor(comment)}
                    </p>
                    <span className="shrink-0 text-gray-500 text-xs dark:text-gray-400">
                      {comment.timestamp
                        ? formatRelativeOrAbsolute(
                            new Date(
                              typeof comment.timestamp === "number"
                                ? comment.timestamp < 1_000_000_000_000
                                  ? comment.timestamp * 1000
                                  : comment.timestamp
                                : comment.timestamp
                            ).toISOString()
                          )
                        : "now"}
                    </span>
                  </div>
                  <p className="mt-1 text-gray-600 text-sm leading-6 dark:text-gray-300">
                    {comment.comment || "No comment body"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === "holders") {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[1.2rem] bg-gray-50 px-4 py-4 dark:bg-gray-950">
              <p className="text-gray-500 text-xs uppercase tracking-[0.2em] dark:text-gray-400">
                Holders
              </p>
              <p className="mt-2 font-semibold text-3xl text-gray-950 dark:text-gray-50">
                {nFormatter(holderCount, 1) || "0"}
              </p>
            </div>
            <div className="rounded-[1.2rem] bg-gray-50 px-4 py-4 dark:bg-gray-950">
              <p className="text-gray-500 text-xs uppercase tracking-[0.2em] dark:text-gray-400">
                Supply
              </p>
              <p className="mt-2 font-semibold text-3xl text-gray-950 dark:text-gray-50">
                {coinRecord?.totalSupply
                  ? nFormatter(Number(coinRecord.totalSupply), 2)
                  : "—"}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.5rem] border border-gray-200 bg-white dark:border-gray-800 dark:bg-black">
            <div className="border-gray-200 border-b px-5 py-3 dark:border-gray-800">
              <p className="font-semibold text-gray-950 text-sm dark:text-gray-50">
                Top holders
              </p>
              <p className="mt-1 text-gray-500 text-xs dark:text-gray-400">
                Live balances pulled from onchain transfer history.
              </p>
            </div>

            {holdersQuery.isLoading ? (
              <div className="flex min-h-[14rem] items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : holders.length ? (
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {holders.slice(0, 20).map((holder, index) => {
                  const profilePath = getPublicProfilePath({
                    address: holder.address,
                    handle: holder.handle
                  });
                  const content = (
                    <>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-6 text-gray-400 text-xs dark:text-gray-500">
                          #{index + 1}
                        </span>
                        <Image
                          alt={holder.displayName}
                          className="size-9 rounded-full object-cover"
                          height={36}
                          src={holder.avatar}
                          width={36}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-950 text-sm dark:text-gray-50">
                            {holder.displayName}
                          </p>
                          <p className="truncate text-gray-500 text-xs dark:text-gray-400">
                            {holder.handle}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="font-medium text-gray-950 text-sm dark:text-gray-50">
                          {nFormatter(holder.balance, 4)}{" "}
                          {coin.symbol || "COIN"}
                        </p>
                        <p className="text-gray-500 text-xs dark:text-gray-400">
                          {holder.percentage.toFixed(
                            holder.percentage >= 1 ? 2 : 3
                          )}
                          %
                        </p>
                      </div>
                    </>
                  );

                  const className =
                    "flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-950";

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
            ) : (
              <div className="px-5 py-8 text-center text-gray-500 text-sm dark:text-gray-400">
                Holder data is still syncing for this coin.
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activeTab === "activity") {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-[1.5rem] px-5 py-5" forceRounded>
            <p className="text-gray-500 text-xs uppercase tracking-[0.2em] dark:text-gray-400">
              24H Change
            </p>
            <p className="mt-2 font-semibold text-3xl text-gray-950 dark:text-gray-50">
              {formatDelta(coin.marketCapDelta24h)}
            </p>
          </Card>
          <Card className="rounded-[1.5rem] px-5 py-5" forceRounded>
            <p className="text-gray-500 text-xs uppercase tracking-[0.2em] dark:text-gray-400">
              Total Volume
            </p>
            <p className="mt-2 font-semibold text-3xl text-gray-950 dark:text-gray-50">
              {formatUsdMetric(coinRecord?.totalVolume || coin.volume24h)}
            </p>
          </Card>
        </div>
      );
    }

    if (activeTab === "fandrop") {
      return (
        <CoinFanDropPanel
          campaigns={fanDropCampaigns}
          creatorName={creatorDisplayName}
          loading={fanDropsQuery.isLoading}
        />
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-[1.5rem] px-5 py-5" forceRounded>
          <p className="text-gray-500 text-xs uppercase tracking-[0.2em] dark:text-gray-400">
            Contract
          </p>
          <p className="mt-2 break-all font-medium text-gray-950 text-sm dark:text-gray-50">
            {coin.address}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={copyAddress} outline size="sm">
              <ClipboardDocumentIcon className="mr-1 size-4" />
              Copy
            </Button>
            <Button
              onClick={() =>
                window.open(
                  `https://basescan.org/address/${coin.address}`,
                  "_blank"
                )
              }
              outline
              size="sm"
            >
              <ArrowTopRightOnSquareIcon className="mr-1 size-4" />
              Basescan
            </Button>
          </div>
        </Card>

        <Card className="rounded-[1.5rem] px-5 py-5" forceRounded>
          <p className="text-gray-500 text-xs uppercase tracking-[0.2em] dark:text-gray-400">
            Coin Details
          </p>
          <p className="mt-2 text-gray-600 text-sm leading-6 dark:text-gray-300">
            {coinRecord?.description?.trim() ||
              `${coin.name} is live on Base and available to trade on Every1.`}
          </p>
          {coinRecord?.createdAt ? (
            <p className="mt-4 text-gray-500 text-xs dark:text-gray-400">
              Created {dayjs(coinRecord.createdAt).format("D MMM YYYY")}
            </p>
          ) : null}
        </Card>
      </div>
    );
  };

  return (
    <PageLayout
      description="Review live coin stats and open the Every1 trade flow."
      hideDesktopSidebar
      hideSearch
      sidebar={null}
      title={pageTitle}
      zeroTopMargin
    >
      <div className="mx-auto w-full max-w-[min(100%,96rem)] px-4 md:px-0">
        {isValidAddress ? (
          coinQuery.isLoading ? (
            <div className="flex min-h-[16rem] items-center justify-center rounded-[1.75rem] border border-gray-200 bg-white dark:border-gray-800 dark:bg-black">
              <Spinner size="sm" />
            </div>
          ) : coinQuery.error ? (
            <ErrorMessage
              error={coinQuery.error}
              title="Failed to load this coin"
            />
          ) : coin ? (
            <>
              <div className="md:hidden">
                <MobileCoinView
                  address={normalizedAddress as Address}
                  chartLoading={coinPriceHistoryQuery.isLoading}
                  chatLoading={coinChatQuery.isLoading}
                  chatMessages={chatMessages}
                  chatterCount={chatterCount}
                  coin={coin}
                  collaboration={collaboration}
                  collaborationLookupComplete={collaborationLookupComplete}
                  createdAt={coinRecord?.createdAt}
                  creatorAvatar={creatorAvatar}
                  creatorDisplayName={creatorDisplayName}
                  creatorHandle={creatorHandle}
                  creatorIsOfficial={creatorIsOfficial}
                  description={coinRecord?.description}
                  fanDropCampaigns={fanDropCampaigns}
                  fanDropsLoading={fanDropsQuery.isLoading}
                  holderCount={holderCount}
                  holders={holders}
                  holdersLoading={holdersQuery.isLoading}
                  holdingAmount={holdingAmount}
                  launchCategory={launchCategory}
                  launchMediaUrl={launchMediaUrl}
                  priceHistory={coinPriceHistoryQuery.data ?? []}
                  totalSupply={coinRecord?.totalSupply}
                  totalVolume={coinRecord?.totalVolume}
                />
              </div>

              <div className="hidden md:block">
                <div className="space-y-3.5">
                  <div className="grid items-stretch gap-3.5 lg:grid-cols-[minmax(0,1.08fr)_minmax(19.5rem,23.75rem)]">
                    <div className="relative h-[27rem] overflow-hidden rounded-[1.5rem] border border-gray-200 bg-white xl:h-[28.5rem] dark:border-gray-800 dark:bg-black">
                      {previewImage ? (
                        <Image
                          alt={coin.name}
                          className="h-full w-full object-cover"
                          src={previewImage}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gray-100 dark:bg-gray-950">
                          <Image
                            alt={coin.name}
                            className="size-24 rounded-full"
                            height={96}
                            src={DEFAULT_AVATAR}
                            width={96}
                          />
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-2.5 flex justify-center">
                        <div className="flex items-center gap-1 rounded-[0.8rem] border border-white/70 bg-white/90 p-1 shadow-sm backdrop-blur dark:border-gray-800/80 dark:bg-black/80">
                          {hasFansCorner ? (
                            <button
                              className="flex size-7.5 items-center justify-center rounded-[0.7rem] text-gray-500 transition-colors hover:text-gray-950 dark:text-gray-400 dark:hover:text-gray-50"
                              type="button"
                            >
                              <ChatBubbleOvalLeftEllipsisIcon className="size-3.5" />
                            </button>
                          ) : null}
                          <button
                            className="flex size-7.5 items-center justify-center rounded-[0.7rem] text-gray-500 transition-colors hover:text-gray-950 dark:text-gray-400 dark:hover:text-gray-50"
                            type="button"
                          >
                            <EllipsisHorizontalIcon className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex h-[27rem] flex-col rounded-[1.5rem] border border-gray-200 bg-white px-3.5 py-3.5 xl:h-[28.5rem] dark:border-gray-800 dark:bg-black">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          {collaborationMembers.length > 1 ? (
                            <div className="relative h-7.5 w-11 shrink-0">
                              {collaborationMembers
                                .slice(0, 2)
                                .map((member, index) => (
                                  <Image
                                    alt={formatCollaborationMemberLabel(member)}
                                    className={cn(
                                      "absolute top-0 size-7.5 rounded-full border border-white object-cover dark:border-black",
                                      index === 0
                                        ? "left-0 z-10"
                                        : "right-0 z-20"
                                    )}
                                    height={30}
                                    key={member.profileId}
                                    src={member.avatarUrl || DEFAULT_AVATAR}
                                    width={30}
                                  />
                                ))}
                            </div>
                          ) : (
                            <Image
                              alt={creatorHandle}
                              className="size-7.5 rounded-full object-cover"
                              height={30}
                              src={creatorAvatar}
                              width={30}
                            />
                          )}
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <p className="truncate font-semibold text-[13px] text-gray-950 dark:text-gray-50">
                                {collaborationDisplayName || creatorDisplayName}
                              </p>
                              {creatorIsOfficial ? (
                                <CheckBadgeIcon className="size-4 shrink-0 text-brand-500" />
                              ) : null}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1">
                              <p className="truncate text-[10px] text-gray-500 dark:text-gray-400">
                                {collaboration
                                  ? `${collaboration.activeMemberCount} collaborators`
                                  : creatorHandle}
                              </p>
                            </div>
                          </div>
                        </div>

                        <p className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
                          {coinRecord?.createdAt
                            ? formatRelativeOrAbsolute(coinRecord.createdAt)
                            : "now"}
                        </p>
                      </div>

                      <h1 className="mt-2.5 font-semibold text-[1.5rem] text-gray-950 leading-[0.94] tracking-tight xl:text-[1.7rem] dark:text-gray-50">
                        {coin.name}
                      </h1>
                      {collaboration ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-sky-500/12 px-2.5 py-1 font-semibold text-[10px] text-sky-700 ring-1 ring-sky-500/20 dark:bg-sky-500/14 dark:text-sky-300 dark:ring-sky-400/20">
                            Collab
                          </span>
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
                                <span>
                                  {formatCollaborationMemberLabel(member)}
                                </span>
                              </>
                            );

                            return profilePath ? (
                              <a
                                className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-1 font-medium text-[10px] text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                href={profilePath}
                                key={member.profileId}
                              >
                                {content}
                              </a>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-1 font-medium text-[10px] text-gray-700 dark:bg-gray-900 dark:text-gray-200"
                                key={member.profileId}
                              >
                                {content}
                              </span>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="mt-2.5 grid grid-cols-3 overflow-hidden rounded-[0.9rem] border border-gray-200 dark:border-gray-800">
                        {detailCards.map((card) => (
                          <div
                            className="border-gray-200 not-first:border-l px-2 py-2.25 text-center first:border-l-0 dark:border-gray-800"
                            key={card.label}
                          >
                            <p className="font-medium text-[8px] text-gray-500 uppercase tracking-[0.12em] dark:text-gray-400">
                              {card.label}
                            </p>
                            <p className="mt-1 font-semibold text-[0.95rem] text-gray-950 leading-none dark:text-gray-50">
                              {card.value}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-2.5 min-h-0 flex-1">
                        <Trade coin={coin} variant="page" />
                      </div>
                    </div>
                  </div>

                  <CoinMediaPanel
                    category={launchCategory}
                    coverImage={previewImage}
                    mediaUrl={launchMediaUrl}
                    title={coin.name}
                  />

                  <div className="rounded-[2rem] border border-gray-200 bg-white px-6 py-5 dark:border-gray-800 dark:bg-black">
                    <Tabs
                      active={activeTab}
                      className="border-gray-200 border-b pb-4 dark:border-gray-800"
                      itemClassName="px-0 py-0 pr-7 text-base text-gray-500 dark:text-gray-400"
                      layoutId="coin-page-tabs"
                      setActive={(value) => setActiveTab(value as CoinPageTab)}
                      tabs={[
                        {
                          name: "Comments",
                          suffix: commentCount ? (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] dark:bg-gray-900">
                              {commentCount}
                            </span>
                          ) : null,
                          type: "comments"
                        },
                        {
                          name: "FanDrop",
                          suffix: fanDropCampaigns.length ? (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] dark:bg-gray-900">
                              {fanDropCampaigns.length}
                            </span>
                          ) : null,
                          type: "fandrop"
                        },
                        {
                          name: "Holders",
                          suffix: (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] dark:bg-gray-900">
                              {nFormatter(holderCount, 1) || "0"}
                            </span>
                          ),
                          type: "holders"
                        },
                        { name: "Activity", type: "activity" },
                        { name: "Details", type: "details" }
                      ]}
                    />

                    <div className="mt-5">{renderDesktopTabContent()}</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<ExclamationTriangleIcon className="size-8" />}
              message="We couldn't find this coin."
            />
          )
        ) : (
          <EmptyState
            icon={<ExclamationTriangleIcon className="size-8" />}
            message="This coin address is invalid."
          />
        )}
      </div>
    </PageLayout>
  );
};

export default Coin;
