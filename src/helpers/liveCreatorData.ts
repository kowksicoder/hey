import dayjs from "dayjs";
import { DEFAULT_AVATAR } from "@/data/constants";
import {
  getPublicE1xpTotalsByWallets,
  getPublicEvery1ProfilesByWallets
} from "@/helpers/every1";
import formatAddress from "@/helpers/formatAddress";
import { formatCompactNairaFromUsd } from "@/helpers/formatNaira";
import nFormatter from "@/helpers/nFormatter";
import { listPublicPlatformLaunches } from "@/helpers/platformDiscovery";
import {
  getPublicCreatorOfWeekCampaign,
  getPublicCreatorOverrides
} from "@/helpers/staff";
import { hasSupabaseConfig } from "@/helpers/supabase";

export interface FeaturedCreatorEntry {
  address: string;
  avatar: string;
  bannerUrl?: null | string;
  category?: null | string;
  createdAt: string | undefined;
  creatorE1xpTotal?: number;
  creatorProfileId?: string;
  creatorWalletAddress?: string;
  creatorEarningsUsd?: number;
  handle: string;
  featuredPriceUsd?: number;
  isOfficial?: boolean;
  isPlatformCreated?: boolean;
  launchCount?: number;
  marketCap: string;
  marketCapDelta24h: string;
  name: string;
  symbol: string;
  uniqueHolders: number;
  volume24h: string;
}

export interface TraderLeaderboardEntry {
  address?: string;
  avatar: string;
  categoryCount: number;
  displayName: string;
  e1xpTotal: number;
  handle: string;
  id: string;
  isOfficial?: boolean;
  latestLaunchAt?: string;
  launchesCount: number;
  score: number;
}

const withOfficialCreatorFlags = async (
  entries: FeaturedCreatorEntry[]
): Promise<FeaturedCreatorEntry[]> => {
  const profilesByWallet = hasSupabaseConfig()
    ? await getPublicEvery1ProfilesByWallets(
        entries
          .map((entry) => entry.creatorWalletAddress || entry.address)
          .filter(Boolean)
      ).catch(() => ({}) as Record<string, never>)
    : {};

  return entries.map((entry) => {
    const officialLookupAddress = (
      entry.creatorWalletAddress || entry.address
    ).toLowerCase();
    const officialProfile = profilesByWallet[officialLookupAddress];

    return {
      ...entry,
      creatorE1xpTotal: officialProfile?.e1xpTotal || 0,
      isOfficial: officialProfile?.verificationStatus === "verified"
    };
  });
};

type CreatorOverrideEntry = Awaited<
  ReturnType<typeof getPublicCreatorOverrides>
>[number];

const normalizeCreatorHandle = (handle?: null | string) => {
  const trimmed = handle?.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
};

const getCreatorEntryKey = (entry: FeaturedCreatorEntry) =>
  (
    entry.creatorWalletAddress ||
    entry.handle.replace(/^@/, "").trim() ||
    entry.address
  ).toLowerCase();

const buildOrderedCreatorEntries = (
  entries: FeaturedCreatorEntry[],
  manualFeaturedIdentifiers: string[]
) => {
  const orderedKeys = new Set<string>();
  const orderedEntries: FeaturedCreatorEntry[] = [];

  for (const identifier of manualFeaturedIdentifiers) {
    const normalizedIdentifier = identifier.replace(/^@/, "").toLowerCase();
    const match = entries.find((entry) => {
      const normalizedHandle = entry.handle.replace(/^@/, "").toLowerCase();
      const normalizedWallet = entry.creatorWalletAddress?.toLowerCase();

      return (
        normalizedHandle === normalizedIdentifier ||
        normalizedWallet === identifier.toLowerCase() ||
        entry.address.toLowerCase() === identifier.toLowerCase()
      );
    });

    if (!match) {
      continue;
    }

    const matchKey = getCreatorEntryKey(match);

    if (!orderedKeys.has(matchKey)) {
      orderedKeys.add(matchKey);
      orderedEntries.push(match);
    }
  }

  for (const entry of entries) {
    const entryKey = getCreatorEntryKey(entry);

    if (!orderedKeys.has(entryKey)) {
      orderedKeys.add(entryKey);
      orderedEntries.push(entry);
    }
  }

  return orderedEntries;
};

const applyCreatorCampaignData = async (
  entries: FeaturedCreatorEntry[]
): Promise<FeaturedCreatorEntry[]> => {
  if (!hasSupabaseConfig() || !entries.length) {
    return entries;
  }

  const campaign = await getPublicCreatorOfWeekCampaign().catch(() => null);

  if (!campaign) {
    return entries;
  }

  const normalizedCampaignWallet = campaign.walletAddress?.trim().toLowerCase();
  const normalizedCampaignHandle = (
    campaign.username ||
    campaign.zoraHandle ||
    ""
  )
    .trim()
    .replace(/^@/, "")
    .toLowerCase();

  return entries.map((entry) => {
    const normalizedEntryWallet = entry.creatorWalletAddress?.toLowerCase();
    const normalizedEntryHandle = entry.handle.replace(/^@/, "").toLowerCase();
    const matchesCampaign =
      (normalizedCampaignWallet &&
        normalizedEntryWallet === normalizedCampaignWallet) ||
      (normalizedCampaignHandle &&
        normalizedEntryHandle === normalizedCampaignHandle);

    if (!matchesCampaign) {
      return entry;
    }

    return {
      ...entry,
      category: campaign.category || entry.category,
      creatorEarningsUsd:
        campaign.creatorEarningsUsd ?? entry.creatorEarningsUsd ?? 0,
      featuredPriceUsd: campaign.featuredPriceUsd ?? entry.featuredPriceUsd
    };
  });
};

const buildPlatformFeaturedCreatorEntry = (
  launch: Awaited<ReturnType<typeof listPublicPlatformLaunches>>[number],
  launchCount = 1
): FeaturedCreatorEntry => {
  const fallbackHandle =
    normalizeCreatorHandle(launch.creator.username) ||
    (launch.creator.walletAddress
      ? formatAddress(launch.creator.walletAddress)
      : formatAddress(launch.coinAddress));
  const fallbackName =
    launch.creator.displayName ||
    launch.creator.username ||
    launch.name ||
    formatAddress(launch.coinAddress);
  const fallbackEntry = {
    address: launch.coinAddress,
    avatar: launch.creator.avatarUrl || launch.coverImageUrl || DEFAULT_AVATAR,
    bannerUrl: launch.coverImageUrl,
    category: launch.category,
    createdAt: launch.launchedAt,
    creatorProfileId: launch.creator.id,
    creatorWalletAddress: launch.creator.walletAddress || undefined,
    handle: fallbackHandle,
    isOfficial: launch.creator.isOfficial,
    isPlatformCreated: true,
    launchCount,
    marketCap: "0",
    marketCapDelta24h: "0",
    name: fallbackName,
    symbol: launch.ticker.toUpperCase(),
    uniqueHolders: 0,
    volume24h: "0"
  } satisfies FeaturedCreatorEntry;

  return fallbackEntry;
};

const fetchPlatformFeaturedCreatorEntries = async (
  count: number,
  creatorOverrides: CreatorOverrideEntry[]
) => {
  const hiddenProfileIds = new Set(
    creatorOverrides
      .filter((override) => override.isHidden)
      .map((override) => override.profileId)
  );
  const hiddenWallets = new Set(
    creatorOverrides
      .filter((override) => override.isHidden && override.walletAddress)
      .map((override) => override.walletAddress?.toLowerCase())
  );
  const hiddenHandles = new Set(
    creatorOverrides
      .filter((override) => override.isHidden && override.zoraHandle)
      .map((override) => override.zoraHandle?.toLowerCase())
  );
  const launches = await listPublicPlatformLaunches({
    limit: Math.max(count * 4, 24)
  }).catch(() => []);
  const creatorLaunchCounts = new Map<string, number>();

  for (const launch of launches) {
    const creatorKey =
      launch.creator.walletAddress?.toLowerCase() ||
      launch.creator.username?.toLowerCase() ||
      launch.creator.id.toLowerCase();
    creatorLaunchCounts.set(
      creatorKey,
      (creatorLaunchCounts.get(creatorKey) || 0) + 1
    );
  }

  const seenCreators = new Set<string>();
  const uniqueLaunches = launches.filter((launch) => {
    const creatorWallet = launch.creator.walletAddress?.toLowerCase();
    const creatorHandle = launch.creator.username?.toLowerCase();

    if (
      hiddenProfileIds.has(launch.creator.id) ||
      (creatorWallet && hiddenWallets.has(creatorWallet)) ||
      (creatorHandle && hiddenHandles.has(creatorHandle))
    ) {
      return false;
    }

    const creatorKey =
      creatorWallet ||
      creatorHandle ||
      launch.creator.id.toLowerCase() ||
      launch.coinAddress.toLowerCase();

    if (seenCreators.has(creatorKey)) {
      return false;
    }

    seenCreators.add(creatorKey);
    return true;
  });

  const entries = uniqueLaunches.map((launch) => {
    const creatorKey =
      launch.creator.walletAddress?.toLowerCase() ||
      launch.creator.username?.toLowerCase() ||
      launch.creator.id.toLowerCase();

    return buildPlatformFeaturedCreatorEntry(
      launch,
      creatorLaunchCounts.get(creatorKey) || 1
    );
  });

  return entries.slice(0, Math.max(count, 1));
};

export const fetchFeaturedCreatorEntries = async (
  count = 12
): Promise<FeaturedCreatorEntry[]> => {
  const creatorOverrides = hasSupabaseConfig()
    ? await getPublicCreatorOverrides().catch(() => [])
    : [];
  const featuredOverrides = creatorOverrides
    .filter((override) => override.featuredOrder !== null)
    .sort(
      (a, b) =>
        (a.featuredOrder || Number.MAX_SAFE_INTEGER) -
        (b.featuredOrder || Number.MAX_SAFE_INTEGER)
    );
  const manualFeaturedIdentifiers = featuredOverrides
    .map((override) => override.zoraHandle || override.walletAddress)
    .filter((value): value is string => Boolean(value));
  const platformEntries = await fetchPlatformFeaturedCreatorEntries(
    count,
    creatorOverrides
  );

  const mergedEntries = buildOrderedCreatorEntries(
    platformEntries,
    manualFeaturedIdentifiers
  );
  const campaignAwareEntries = await applyCreatorCampaignData(
    mergedEntries.slice(0, count)
  );

  return withOfficialCreatorFlags(campaignAwareEntries);
};

export const fetchCreatorOfWeekEntry =
  async (): Promise<FeaturedCreatorEntry | null> => {
    if (hasSupabaseConfig()) {
      const campaign = await getPublicCreatorOfWeekCampaign().catch(() => null);

      if (campaign) {
        const campaignWallet =
          campaign.walletAddress?.trim().toLowerCase() || null;
        const campaignProfilesByWallet = campaignWallet
          ? await getPublicEvery1ProfilesByWallets([campaignWallet]).catch(
              () => ({}) as Record<string, never>
            )
          : {};

        return {
          address: campaign.walletAddress || campaign.profileId,
          avatar: campaign.avatarUrl || DEFAULT_AVATAR,
          bannerUrl: campaign.bannerUrl,
          category: campaign.category,
          createdAt: undefined,
          creatorEarningsUsd: campaign.creatorEarningsUsd,
          featuredPriceUsd: campaign.featuredPriceUsd,
          handle: campaign.username
            ? `@${campaign.username}`
            : campaign.zoraHandle
              ? `@${campaign.zoraHandle}`
              : formatAddress(campaign.walletAddress || campaign.profileId),
          isOfficial:
            campaignWallet !== null &&
            campaignProfilesByWallet[campaignWallet]?.verificationStatus ===
              "verified",
          marketCap: "0",
          marketCapDelta24h: "0",
          name:
            campaign.displayName ||
            campaign.username ||
            campaign.zoraHandle ||
            formatAddress(campaign.walletAddress || campaign.profileId),
          symbol: "",
          uniqueHolders: 0,
          volume24h: "0"
        } satisfies FeaturedCreatorEntry;
      }
    }

    const featuredEntry = (
      await fetchFeaturedCreatorEntries(1).catch(() => [])
    )[0];

    if (featuredEntry) {
      return featuredEntry;
    }

    return null;
  };

export const fetchTraderLeaderboardEntries = async (
  count = 20
): Promise<TraderLeaderboardEntry[]> => {
  const creatorOverrides = hasSupabaseConfig()
    ? await getPublicCreatorOverrides().catch(() => [])
    : [];
  const hiddenProfileIds = new Set(
    creatorOverrides
      .filter((override) => override.isHidden)
      .map((override) => override.profileId)
  );
  const hiddenWallets = new Set(
    creatorOverrides
      .filter((override) => override.isHidden && override.walletAddress)
      .map((override) => override.walletAddress?.toLowerCase())
  );
  const hiddenHandles = new Set(
    creatorOverrides
      .filter((override) => override.isHidden && override.zoraHandle)
      .map((override) => override.zoraHandle?.toLowerCase())
  );
  const launches = await listPublicPlatformLaunches({
    limit: Math.max(count * 6, 60)
  }).catch(() => []);

  if (!launches.length) {
    return [];
  }

  const leaderboardBuckets = new Map<
    string,
    {
      address?: string;
      avatar: string;
      categories: Set<string>;
      displayName: string;
      handle: string;
      id: string;
      isOfficial: boolean;
      latestLaunchAt?: string;
      launchesCount: number;
    }
  >();

  for (const launch of launches) {
    const creatorWallet = launch.creator.walletAddress?.toLowerCase();
    const creatorHandle = launch.creator.username?.toLowerCase();

    if (
      hiddenProfileIds.has(launch.creator.id) ||
      (creatorWallet && hiddenWallets.has(creatorWallet)) ||
      (creatorHandle && hiddenHandles.has(creatorHandle))
    ) {
      continue;
    }

    const bucketKey =
      creatorWallet || creatorHandle || launch.creator.id.toLowerCase();
    const displayName =
      launch.creator.displayName ||
      launch.creator.username ||
      formatAddress(launch.creator.walletAddress || launch.coinAddress);
    const handle =
      normalizeCreatorHandle(launch.creator.username) ||
      formatAddress(launch.creator.walletAddress || launch.coinAddress);
    const existingBucket = leaderboardBuckets.get(bucketKey);
    const launchTime = launch.launchedAt || launch.createdAt;

    if (!existingBucket) {
      leaderboardBuckets.set(bucketKey, {
        address: launch.creator.walletAddress || undefined,
        avatar:
          launch.creator.avatarUrl || launch.coverImageUrl || DEFAULT_AVATAR,
        categories: new Set(launch.category ? [launch.category] : []),
        displayName,
        handle,
        id: launch.creator.id,
        isOfficial: launch.creator.isOfficial,
        latestLaunchAt: launchTime,
        launchesCount: 1
      });
      continue;
    }

    existingBucket.launchesCount += 1;
    existingBucket.isOfficial =
      existingBucket.isOfficial || launch.creator.isOfficial;
    existingBucket.avatar =
      existingBucket.avatar ||
      launch.creator.avatarUrl ||
      launch.coverImageUrl ||
      DEFAULT_AVATAR;

    if (launch.category) {
      existingBucket.categories.add(launch.category);
    }

    if (
      launchTime &&
      (!existingBucket.latestLaunchAt ||
        new Date(launchTime).getTime() >
          new Date(existingBucket.latestLaunchAt).getTime())
    ) {
      existingBucket.latestLaunchAt = launchTime;
    }
  }

  const walletAddresses = [...leaderboardBuckets.values()]
    .map((entry) => entry.address)
    .filter((address): address is string => Boolean(address));
  const e1xpTotalsByWallet = walletAddresses.length
    ? await getPublicE1xpTotalsByWallets(walletAddresses).catch(
        () => ({}) as Record<string, number>
      )
    : {};

  return [...leaderboardBuckets.values()]
    .map((entry) => {
      const e1xpTotal = entry.address
        ? e1xpTotalsByWallet[entry.address.toLowerCase()] || 0
        : 0;
      const categoryCount = entry.categories.size;
      const score = e1xpTotal + entry.launchesCount * 50 + categoryCount * 25;

      return {
        address: entry.address,
        avatar: entry.avatar,
        categoryCount,
        displayName: entry.displayName,
        e1xpTotal,
        handle: entry.handle,
        id: entry.id,
        isOfficial: entry.isOfficial,
        latestLaunchAt: entry.latestLaunchAt,
        launchesCount: entry.launchesCount,
        score
      } satisfies TraderLeaderboardEntry;
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.launchesCount !== left.launchesCount) {
        return right.launchesCount - left.launchesCount;
      }

      const leftTime = left.latestLaunchAt
        ? new Date(left.latestLaunchAt).getTime()
        : 0;
      const rightTime = right.latestLaunchAt
        ? new Date(right.latestLaunchAt).getTime()
        : 0;

      return rightTime - leftTime;
    })
    .slice(0, Math.max(count, 1));
};

export const parseMetricNumber = (value?: number | string | null) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number.parseFloat(value ?? "");

  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatUsdMetric = (value?: number | string | null, digits = 2) => {
  const amount = parseMetricNumber(value);

  return formatCompactNairaFromUsd(amount, digits);
};

export const formatCompactMetric = (
  value?: number | string | null,
  digits = 1
) => {
  const amount = parseMetricNumber(value);

  if (amount <= 0) {
    return "0";
  }

  return nFormatter(amount, digits);
};

export const formatDelta = (value?: number | string | null) => {
  const amount = parseMetricNumber(value);
  const absoluteValue = Math.abs(amount);
  const precision = absoluteValue >= 100 ? 0 : absoluteValue >= 10 ? 1 : 2;
  const prefix = amount > 0 ? "+" : amount < 0 ? "-" : "";

  return `${prefix}${absoluteValue.toFixed(precision).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1")}%`;
};

export const isPositiveDelta = (value?: number | string | null) =>
  parseMetricNumber(value) >= 0;

export const getFeaturedCreatorAge = (createdAt?: string) => {
  const createdDate = createdAt ? dayjs(createdAt) : null;

  if (!createdDate?.isValid()) {
    return "--";
  }

  const now = dayjs();
  const diffInDays = now.diff(createdDate, "day");

  if (diffInDays < 1) {
    return "today";
  }

  if (diffInDays < 7) {
    return `${diffInDays}d`;
  }

  if (diffInDays < 30) {
    return `${Math.floor(diffInDays / 7)}w`;
  }

  if (diffInDays < 365) {
    return `${Math.floor(diffInDays / 30)}mo`;
  }

  return `${Math.floor(diffInDays / 365)}y`;
};

export const getCreatorTicker = (symbol?: string) =>
  symbol?.trim() ? `\u20A6${symbol.trim()}` : "";
