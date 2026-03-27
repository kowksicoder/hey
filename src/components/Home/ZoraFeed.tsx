import {
  ArrowTrendingUpIcon,
  FireIcon,
  SparklesIcon
} from "@heroicons/react/24/outline";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { setApiKey } from "@zoralabs/coins-sdk";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorMessage, Spinner } from "@/components/Shared/UI";
import { HomeFeedSort, HomeFeedType, HomeFeedView } from "@/data/enums";
import cn from "@/helpers/cn";
import {
  EVERY1_PUBLIC_COIN_COLLABORATIONS_QUERY_KEY,
  listPublicCoinCollaborations,
  listPublicCollaborationCoins
} from "@/helpers/every1";
import getZoraApiKey from "@/helpers/getZoraApiKey";
import { getPlatformLaunchCategoryForFeedType } from "@/helpers/platformCategories";
import {
  fetchPlatformDiscoverCoins,
  mergePriorityItemsByAddress
} from "@/helpers/platformDiscovery";
import useDesktopSidebarCollapsed from "@/hooks/useDesktopSidebarCollapsed";
import useLoadMoreOnIntersect from "@/hooks/useLoadMoreOnIntersect";
import { useHomeTabStore } from "@/store/persisted/useHomeTabStore";
import WhoToFollowFeedBlock from "./WhoToFollowFeedBlock";
import ZoraFeedShimmer from "./ZoraFeedShimmer";
import ZoraPostCard from "./ZoraPostCard";
import ZoraPostMobileViewer from "./ZoraPostMobileViewer";
import {
  ZORA_HOME_FEED_QUERY_KEY,
  type ZoraFeedItem,
  zoraHomeFeedConfig
} from "./zoraHomeFeedConfig";

const zoraApiKey = getZoraApiKey();

if (zoraApiKey) {
  setApiKey(zoraApiKey);
}

interface ZoraFeedPage {
  items: ZoraFeedItem[];
  nextCursor?: string;
}

const getEmptyIcon = (feedType: HomeFeedType) => {
  if (
    feedType === HomeFeedType.HIGHLIGHTS ||
    feedType === HomeFeedType.POP_CULTURE ||
    feedType === HomeFeedType.PHOTOGRAPHY ||
    feedType === HomeFeedType.COMEDIANS
  ) {
    return <SparklesIcon className="size-8" />;
  }

  if (
    feedType === HomeFeedType.FORYOU ||
    feedType === HomeFeedType.LIFESTYLE ||
    feedType === HomeFeedType.PODCASTS ||
    feedType === HomeFeedType.FOOD ||
    feedType === HomeFeedType.WRITERS
  ) {
    return <ArrowTrendingUpIcon className="size-8" />;
  }

  return <FireIcon className="size-8" />;
};

const ZoraFeed = () => {
  const { feedType, sortMode, toggleViewMode, viewMode } = useHomeTabStore();
  const currentFeed = zoraHomeFeedConfig[feedType];
  const [selectedPostIndex, setSelectedPostIndex] = useState<number | null>(
    null
  );
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const isDesktopSidebarCollapsed = useDesktopSidebarCollapsed();
  const isGridView = viewMode === HomeFeedView.GRID;
  const shouldRenderMobileReel = isMobileViewport && !isGridView;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();

    mediaQuery.addEventListener("change", updateViewport);

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading
  } = useInfiniteQuery<ZoraFeedPage, Error>({
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!zoraApiKey) {
        throw new Error("Missing Zora API key for the Zora feed.");
      }

      if (feedType === HomeFeedType.COLLABORATIONS) {
        const offset = Number.isFinite(Number(pageParam))
          ? Number(pageParam)
          : 0;
        const publicCollaborationCoins = await listPublicCollaborationCoins({
          limit: 20,
          offset
        });
        const { getCoin } = await import("@zoralabs/coins-sdk");

        const coinResults = await Promise.all(
          publicCollaborationCoins.map(async (collaboration) => {
            try {
              const response = await getCoin({
                address: collaboration.coinAddress as `0x${string}`,
                chain: 8453
              });
              const coin = response.data?.zora20Token;

              if (
                !coin ||
                (coin as { platformBlocked?: boolean }).platformBlocked ||
                (coin.creatorProfile as { platformBlocked?: boolean } | null)
                  ?.platformBlocked
              ) {
                return null;
              }

              return {
                ...coin,
                id: coin.address
              } as ZoraFeedItem;
            } catch {
              return null;
            }
          })
        );

        return {
          items: coinResults.filter(Boolean) as ZoraFeedItem[],
          nextCursor:
            publicCollaborationCoins.length >= 20
              ? String(offset + 20)
              : undefined
        };
      }

      const response = await currentFeed.query({
        after: pageParam as string | undefined,
        count: 20
      });
      const edges = response.data?.exploreList?.edges ?? [];
      const pageInfo = response.data?.exploreList?.pageInfo;

      return {
        items: edges
          .map((edge) => edge.node)
          .filter(
            (item) =>
              !item.platformBlocked && !item.creatorProfile?.platformBlocked
          ),
        nextCursor: pageInfo?.hasNextPage ? pageInfo.endCursor : undefined
      };
    },
    queryKey: [ZORA_HOME_FEED_QUERY_KEY, feedType],
    staleTime: 30_000
  });
  const platformPriorityQuery = useQuery({
    enabled: feedType !== HomeFeedType.COLLABORATIONS,
    queryFn: async () =>
      await fetchPlatformDiscoverCoins({
        category: getPlatformLaunchCategoryForFeedType(feedType),
        limit: 10
      }),
    queryKey: ["platform-priority-feed-coins", feedType],
    staleTime: 30_000
  });
  const platformPriorityItems = useMemo(
    () => (platformPriorityQuery.data || []) as ZoraFeedItem[],
    [platformPriorityQuery.data]
  );
  const platformPriorityOrder = useMemo(
    () =>
      new Map(
        platformPriorityItems.map((item, index) => [
          item.address.toLowerCase(),
          index
        ])
      ),
    [platformPriorityItems]
  );

  const items = useMemo(
    () =>
      mergePriorityItemsByAddress(
        platformPriorityItems,
        (data?.pages.flatMap((page) => page.items) ?? []) as ZoraFeedItem[]
      ).sort((a, b) => {
        const aPriorityRank = platformPriorityOrder.get(
          a.address.toLowerCase()
        );
        const bPriorityRank = platformPriorityOrder.get(
          b.address.toLowerCase()
        );

        if (aPriorityRank !== undefined || bPriorityRank !== undefined) {
          if (aPriorityRank === undefined) {
            return 1;
          }

          if (bPriorityRank === undefined) {
            return -1;
          }

          if (aPriorityRank !== bPriorityRank) {
            return aPriorityRank - bPriorityRank;
          }
        }

        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;

        return sortMode === HomeFeedSort.OLDEST ? aTime - bTime : bTime - aTime;
      }),
    [data?.pages, platformPriorityItems, platformPriorityOrder, sortMode]
  );
  const collaborationMetadataQuery = useQuery({
    enabled: items.length > 0,
    queryFn: async () =>
      listPublicCoinCollaborations(items.map((item) => item.address)),
    queryKey: [
      EVERY1_PUBLIC_COIN_COLLABORATIONS_QUERY_KEY,
      ...items.map((item) => item.address.toLowerCase()).sort()
    ],
    staleTime: 30_000
  });
  const collaborationByAddress = useMemo(
    () =>
      Object.fromEntries(
        (collaborationMetadataQuery.data || []).map((collaboration) => [
          collaboration.coinAddress.toLowerCase(),
          collaboration
        ])
      ),
    [collaborationMetadataQuery.data]
  );

  const suggestions = useMemo(() => {
    const seen = new Set<string>();

    return items.filter((item) => {
      const key =
        item.creatorProfile?.handle?.toLowerCase() ||
        item.creatorAddress?.toLowerCase() ||
        item.address.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return Boolean(
        item.creatorProfile?.avatar?.previewImage?.medium ||
          item.mediaContent?.previewImage?.medium
      );
    });
  }, [items]);

  const getSuggestionStartIndex = useCallback(
    (index: number) => {
      if (!suggestions.length) {
        return 0;
      }

      return (Math.floor(index / 3) * 4) % suggestions.length;
    },
    [suggestions.length]
  );

  const handleLoadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const loadMoreRef = useLoadMoreOnIntersect(handleLoadMore);
  const handleOpenMobileView = useCallback((index: number) => {
    if (
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 767px)").matches
    ) {
      return;
    }

    setSelectedPostIndex(index);
  }, []);

  if (isLoading) {
    return (
      <ZoraFeedShimmer
        isDesktopSidebarCollapsed={isDesktopSidebarCollapsed}
        viewMode={viewMode}
      />
    );
  }

  if (error) {
    return <ErrorMessage error={error} title={currentFeed.errorTitle} />;
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={getEmptyIcon(feedType)}
        message={currentFeed.emptyMessage}
      />
    );
  }

  if (shouldRenderMobileReel) {
    return (
      <ZoraPostMobileViewer
        collaborationByAddress={collaborationByAddress}
        hasNextPage={Boolean(hasNextPage)}
        initialIndex={0}
        isFetchingMore={isFetchingNextPage}
        items={items}
        onClose={toggleViewMode}
        onRequestMore={handleLoadMore}
        variant="embedded"
      />
    );
  }

  return (
    <>
      <section
        className={cn(
          "min-w-0 overflow-x-hidden pb-5",
          isGridView
            ? cn(
                "grid grid-cols-2 gap-2 px-3 md:grid-cols-4 md:gap-2.5 md:px-0",
                isDesktopSidebarCollapsed
                  ? "lg:grid-cols-6"
                  : "lg:grid-cols-5 xl:grid-cols-6"
              )
            : "space-y-3"
        )}
      >
        {isGridView
          ? items.map((item, index) => (
              <ZoraPostCard
                collaboration={
                  collaborationByAddress[item.address.toLowerCase()]
                }
                item={item}
                key={item.id}
                onOpenMobileView={
                  isGridView ? undefined : () => handleOpenMobileView(index)
                }
                viewMode={viewMode}
              />
            ))
          : items.map((item, index) => (
              <Fragment key={item.id}>
                <ZoraPostCard
                  collaboration={
                    collaborationByAddress[item.address.toLowerCase()]
                  }
                  item={item}
                  onOpenMobileView={() => handleOpenMobileView(index)}
                  viewMode={viewMode}
                />
                {(index + 1) % 3 === 0 && suggestions.length >= 4 ? (
                  <WhoToFollowFeedBlock
                    startIndex={getSuggestionStartIndex(index)}
                    suggestions={suggestions}
                  />
                ) : null}
              </Fragment>
            ))}

        {hasNextPage ? (
          <div
            className={cn(
              "flex justify-center py-4",
              isGridView ? "col-span-full px-0" : "px-5 md:px-0"
            )}
          >
            <span ref={loadMoreRef} />
            {isFetchingNextPage ? <Spinner size="sm" /> : null}
          </div>
        ) : null}
      </section>

      <ZoraPostMobileViewer
        collaborationByAddress={collaborationByAddress}
        hasNextPage={Boolean(hasNextPage)}
        initialIndex={selectedPostIndex ?? 0}
        isFetchingMore={isFetchingNextPage}
        items={selectedPostIndex !== null ? items : []}
        onClose={() => setSelectedPostIndex(null)}
        onRequestMore={handleLoadMore}
      />
    </>
  );
};

export default ZoraFeed;
