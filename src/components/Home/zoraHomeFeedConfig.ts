import {
  type ExploreResponse,
  getCoinsLastTraded,
  getCoinsLastTradedUnique,
  getCoinsMostValuable,
  getCoinsTopGainers,
  getExploreNewAll,
  getExploreTopVolumeAll24h,
  type QueryRequestType
} from "@zoralabs/coins-sdk";
import { HomeFeedType } from "@/data/enums";

export const ZORA_HOME_FEED_QUERY_KEY = "zora-home-feed";

export type ZoraFeedItem = NonNullable<
  NonNullable<
    NonNullable<ExploreResponse["data"]>["exploreList"]
  >["edges"][number]["node"]
>;

type ZoraFeedQuery = (query?: QueryRequestType) => Promise<ExploreResponse>;

interface ZoraHomeFeedConfigItem {
  emptyMessage: string;
  errorTitle: string;
  label: string;
  query: ZoraFeedQuery;
}

export const zoraHomeFeedConfig: Record<HomeFeedType, ZoraHomeFeedConfigItem> =
  {
    [HomeFeedType.FOLLOWING]: {
      emptyMessage: "No music creator posts yet!",
      errorTitle: "Failed to load music creator posts",
      label: "Music",
      query: getExploreTopVolumeAll24h
    },
    [HomeFeedType.HIGHLIGHTS]: {
      emptyMessage: "No movie creator posts yet!",
      errorTitle: "Failed to load movie creator posts",
      label: "Movies",
      query: getExploreNewAll
    },
    [HomeFeedType.FORYOU]: {
      emptyMessage: "No art creator posts yet!",
      errorTitle: "Failed to load art creator posts",
      label: "Art",
      query: getCoinsTopGainers
    },
    [HomeFeedType.SPORTS]: {
      emptyMessage: "No sports creator posts yet!",
      errorTitle: "Failed to load sports creator posts",
      label: "Sports",
      query: getCoinsMostValuable
    },
    [HomeFeedType.LIFESTYLE]: {
      emptyMessage: "No lifestyle creator posts yet!",
      errorTitle: "Failed to load lifestyle creator posts",
      label: "Lifestyle",
      query: getCoinsLastTraded
    },
    [HomeFeedType.POP_CULTURE]: {
      emptyMessage: "No pop-culture creator posts yet!",
      errorTitle: "Failed to load pop-culture creator posts",
      label: "Pop-Culture",
      query: getCoinsLastTradedUnique
    },
    [HomeFeedType.PODCASTS]: {
      emptyMessage: "No podcast creator posts yet!",
      errorTitle: "Failed to load podcast creator posts",
      label: "Podcasts",
      query: getExploreTopVolumeAll24h
    },
    [HomeFeedType.PHOTOGRAPHY]: {
      emptyMessage: "No photography creator posts yet!",
      errorTitle: "Failed to load photography creator posts",
      label: "Photography",
      query: getExploreNewAll
    },
    [HomeFeedType.FOOD]: {
      emptyMessage: "No food creator posts yet!",
      errorTitle: "Failed to load food creator posts",
      label: "Food",
      query: getCoinsTopGainers
    },
    [HomeFeedType.WRITERS]: {
      emptyMessage: "No writer creator posts yet!",
      errorTitle: "Failed to load writer creator posts",
      label: "Writers",
      query: getCoinsMostValuable
    },
    [HomeFeedType.COMMUNITIES]: {
      emptyMessage: "No community creator posts yet!",
      errorTitle: "Failed to load community creator posts",
      label: "Communities",
      query: getCoinsLastTraded
    },
    [HomeFeedType.COLLABORATIONS]: {
      emptyMessage: "No collaboration coins are live yet!",
      errorTitle: "Failed to load collaboration coins",
      label: "Collaboration",
      query: getExploreNewAll
    },
    [HomeFeedType.COMEDIANS]: {
      emptyMessage: "No comedian creator posts yet!",
      errorTitle: "Failed to load comedian creator posts",
      label: "Comedians",
      query: getCoinsLastTradedUnique
    }
  };
