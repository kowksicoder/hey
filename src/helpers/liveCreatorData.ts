import {
  type GetFeaturedCreatorsResponse,
  type GetProfileCoinsResponse,
  type GetProfileResponse,
  type GetTraderLeaderboardResponse,
  getCoin,
  getFeaturedCreators,
  getMostValuableCreatorCoins,
  getProfile,
  getProfileCoins,
  getTraderLeaderboard,
  setApiKey
} from "@zoralabs/coins-sdk";
import dayjs from "dayjs";
import { DEFAULT_AVATAR } from "@/data/constants";
import {
  getPublicE1xpTotalsByWallets,
  getPublicEvery1ProfilesByWallets
} from "@/helpers/every1";
import formatAddress from "@/helpers/formatAddress";
import { formatCompactNaira } from "@/helpers/formatNaira";
import getZoraApiKey from "@/helpers/getZoraApiKey";
import nFormatter from "@/helpers/nFormatter";
import { listPublicPlatformLaunches } from "@/helpers/platformDiscovery";
import {
  getPublicCreatorOfWeekCampaign,
  getPublicCreatorOverrides
} from "@/helpers/staff";
import { hasSupabaseConfig } from "@/helpers/supabase";

const zoraApiKey = getZoraApiKey();

if (zoraApiKey) {
  setApiKey(zoraApiKey);
}

type FeaturedCreatorNode = NonNullable<
  NonNullable<
    GetFeaturedCreatorsResponse["traderLeaderboardFeaturedCreators"]
  >["edges"][number]["node"]
>;

type ProfileNode = NonNullable<GetProfileResponse["profile"]>;

type ProfileCoinNode = NonNullable<
  NonNullable<
    NonNullable<GetProfileCoinsResponse["profile"]>["createdCoins"]
  >["edges"][number]["node"]
>;

type TraderLeaderboardNode = NonNullable<
  NonNullable<
    GetTraderLeaderboardResponse["exploreTraderLeaderboard"]
  >["edges"][number]["node"]
>;

export interface FeaturedCreatorEntry {
  address: string;
  avatar: string;
  bannerUrl?: null | string;
  category?: null | string;
  createdAt: string | undefined;
  creatorProfileId?: string;
  creatorWalletAddress?: string;
  creatorEarningsUsd?: number;
  handle: string;
  featuredPriceUsd?: number;
  isOfficial?: boolean;
  isPlatformCreated?: boolean;
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
  displayName: string;
  e1xpTotal: number;
  grossVolumeZora: number;
  handle: string;
  id: string;
  isOfficial?: boolean;
  score: number;
  weekTradesCount: number;
  weekVolumeUsd: number;
}

const getProfileDisplayName = (profile: ProfileNode | null | undefined) =>
  profile?.displayName?.trim() ||
  profile?.username?.trim() ||
  profile?.handle?.trim() ||
  "";

const getProfileAvatar = (profile: ProfileNode | null | undefined) =>
  profile?.avatar?.medium || DEFAULT_AVATAR;

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
      isOfficial: officialProfile?.verificationStatus === "verified"
    };
  });
};

const findCreatorCoin = (
  profile: ProfileNode | null | undefined,
  coins: ProfileCoinNode[]
) => {
  const creatorCoinAddress = profile?.creatorCoin?.address?.toLowerCase();

  if (!coins.length) {
    return null;
  }

  if (!creatorCoinAddress) {
    return coins[0];
  }

  return (
    coins.find((coin) => coin.address.toLowerCase() === creatorCoinAddress) ||
    coins[0]
  );
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

const buildPlatformFeaturedCreatorEntry = async (
  launch: Awaited<ReturnType<typeof listPublicPlatformLaunches>>[number]
): Promise<FeaturedCreatorEntry> => {
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
    createdAt: launch.launchedAt,
    creatorProfileId: launch.creator.id,
    creatorWalletAddress: launch.creator.walletAddress || undefined,
    handle: fallbackHandle,
    isOfficial: launch.creator.isOfficial,
    isPlatformCreated: true,
    marketCap: "0",
    marketCapDelta24h: "0",
    name: fallbackName,
    symbol: launch.ticker.toUpperCase(),
    uniqueHolders: 0,
    volume24h: "0"
  } satisfies FeaturedCreatorEntry;

  if (!zoraApiKey) {
    return fallbackEntry;
  }

  try {
    const response = await getCoin({
      address: launch.coinAddress as `0x${string}`,
      chain: 8453
    });
    const coin = response.data?.zora20Token;

    if (!coin || coin.platformBlocked || coin.creatorProfile?.platformBlocked) {
      return fallbackEntry;
    }

    return {
      ...fallbackEntry,
      avatar:
        coin.creatorProfile?.avatar?.previewImage?.medium ||
        coin.creatorProfile?.avatar?.previewImage?.small ||
        coin.mediaContent?.previewImage?.medium ||
        coin.mediaContent?.previewImage?.small ||
        fallbackEntry.avatar,
      createdAt: coin.createdAt || fallbackEntry.createdAt,
      handle:
        normalizeCreatorHandle(coin.creatorProfile?.handle) ||
        fallbackEntry.handle,
      marketCap: coin.marketCap || fallbackEntry.marketCap,
      marketCapDelta24h: coin.marketCapDelta24h || "0",
      name:
        launch.creator.displayName ||
        launch.creator.username ||
        coin.creatorProfile?.handle ||
        coin.name ||
        fallbackEntry.name,
      symbol: coin.symbol || fallbackEntry.symbol,
      uniqueHolders: coin.uniqueHolders || 0,
      volume24h: coin.volume24h || "0"
    } satisfies FeaturedCreatorEntry;
  } catch {
    return fallbackEntry;
  }
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

  const entries = await Promise.all(
    uniqueLaunches.map((launch) => buildPlatformFeaturedCreatorEntry(launch))
  );

  return entries.slice(0, Math.max(count, 1));
};

const buildFeaturedCreatorEntry = async (
  identifier: string
): Promise<FeaturedCreatorEntry | null> => {
  try {
    const [profileResponse, profileCoinsResponse] = await Promise.all([
      getProfile({ identifier }),
      getProfileCoins({ count: 20, identifier })
    ]);

    const profile = profileResponse.data?.profile;
    const createdCoins =
      profileCoinsResponse.data?.profile?.createdCoins?.edges
        ?.map((edge) => edge.node)
        .filter(Boolean) ?? [];
    const creatorCoin = findCreatorCoin(profile, createdCoins);

    if (
      !profile ||
      profile.platformBlocked ||
      !creatorCoin ||
      creatorCoin.platformBlocked
    ) {
      return null;
    }

    return {
      address: creatorCoin.address,
      avatar:
        profile.avatar?.medium ||
        creatorCoin.mediaContent?.previewImage?.medium ||
        creatorCoin.mediaContent?.previewImage?.small ||
        DEFAULT_AVATAR,
      createdAt: creatorCoin.createdAt,
      creatorProfileId: profile.id,
      creatorWalletAddress: profile.publicWallet.walletAddress,
      handle: profile.handle.startsWith("@")
        ? profile.handle
        : `@${profile.handle}`,
      isPlatformCreated: false,
      marketCap: creatorCoin.marketCap,
      marketCapDelta24h:
        creatorCoin.marketCapDelta24h ||
        profile.creatorCoin?.marketCapDelta24h ||
        "0",
      name:
        getProfileDisplayName(profile) ||
        creatorCoin.name ||
        formatAddress(profile.publicWallet.walletAddress),
      symbol: creatorCoin.symbol,
      uniqueHolders: creatorCoin.uniqueHolders,
      volume24h: creatorCoin.volume24h
    } satisfies FeaturedCreatorEntry;
  } catch {
    return null;
  }
};

export const fetchFeaturedCreatorEntries = async (
  count = 12
): Promise<FeaturedCreatorEntry[]> => {
  const creatorOverrides = hasSupabaseConfig()
    ? await getPublicCreatorOverrides().catch(() => [])
    : [];
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
  let zoraEntries: FeaturedCreatorEntry[] = [];

  if (zoraApiKey) {
    try {
      const featuredResponse = await getFeaturedCreators({ first: count });
      const featuredNodes =
        featuredResponse.data?.traderLeaderboardFeaturedCreators?.edges?.map(
          (edge) => edge.node
        ) ?? [];

      const uniqueHandles = Array.from(
        new Set(
          featuredNodes
            .map((node: FeaturedCreatorNode) => node.handle?.trim())
            .filter(Boolean)
        )
      );
      const identifiers = Array.from(
        new Set([...manualFeaturedIdentifiers, ...uniqueHandles])
      );
      const entries = await Promise.all(
        identifiers.map((identifier) => buildFeaturedCreatorEntry(identifier))
      );

      zoraEntries = entries.filter(
        (entry): entry is FeaturedCreatorEntry =>
          entry !== null &&
          !hiddenWallets.has(
            (entry.creatorWalletAddress || "").toLowerCase()
          ) &&
          !hiddenHandles.has(entry.handle.replace(/^@/, "").toLowerCase())
      );
    } catch {
      zoraEntries = [];
    }
  }

  const mergedEntries = buildOrderedCreatorEntries(
    [...platformEntries, ...zoraEntries],
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

    if (!zoraApiKey) {
      return null;
    }

    try {
      const response = await getMostValuableCreatorCoins({ count: 1 });
      const item = response.data?.exploreList?.edges?.[0]?.node;

      if (
        !item ||
        item.platformBlocked ||
        item.creatorProfile?.platformBlocked
      ) {
        return null;
      }

      const handle = item.creatorProfile?.handle?.trim();

      const entry = {
        address: item.address,
        avatar:
          item.creatorProfile?.avatar?.previewImage?.medium ||
          item.mediaContent?.previewImage?.medium ||
          item.mediaContent?.previewImage?.small ||
          DEFAULT_AVATAR,
        createdAt: item.createdAt,
        creatorWalletAddress: item.creatorAddress || undefined,
        handle: handle
          ? handle.startsWith("@")
            ? handle
            : `@${handle}`
          : formatAddress(item.creatorAddress || item.address),
        marketCap: item.marketCap,
        marketCapDelta24h: item.marketCapDelta24h || "0",
        name:
          handle ||
          item.name ||
          formatAddress(item.creatorAddress || item.address),
        symbol: item.symbol,
        uniqueHolders: item.uniqueHolders,
        volume24h: item.volume24h
      } satisfies FeaturedCreatorEntry;

      return (await withOfficialCreatorFlags([entry]))[0];
    } catch {
      return null;
    }
  };

export const fetchTraderLeaderboardEntries = async (
  count = 20
): Promise<TraderLeaderboardEntry[]> => {
  if (!zoraApiKey) {
    throw new Error("Missing Zora API key for trader leaderboard.");
  }

  const leaderboardResponse = await getTraderLeaderboard({ first: count });
  const leaderboardNodes =
    leaderboardResponse.data?.exploreTraderLeaderboard?.edges?.map(
      (edge) => edge.node
    ) ?? [];

  const profiles = await Promise.all(
    leaderboardNodes.map(async (node: TraderLeaderboardNode) => {
      const identifier = node.traderProfile?.handle?.trim();

      if (!identifier) {
        return null;
      }

      try {
        const profileResponse = await getProfile({ identifier });
        return profileResponse.data?.profile ?? null;
      } catch {
        return null;
      }
    })
  );

  const entries = leaderboardNodes.map((node: TraderLeaderboardNode, index) => {
    const profile = profiles[index];
    const walletAddress = profile?.publicWallet.walletAddress;

    return {
      address: walletAddress,
      avatar: getProfileAvatar(profile),
      displayName:
        getProfileDisplayName(profile) ||
        node.entityName ||
        node.traderProfile?.handle ||
        "Unknown trader",
      e1xpTotal: 0,
      grossVolumeZora: node.weekGrossVolumeZora,
      handle: profile?.handle
        ? profile.handle.startsWith("@")
          ? profile.handle
          : `@${profile.handle}`
        : node.traderProfile?.handle
          ? node.traderProfile.handle.startsWith("@")
            ? node.traderProfile.handle
            : `@${node.traderProfile.handle}`
          : walletAddress
            ? formatAddress(walletAddress)
            : node.entityName,
      id: node.traderProfile?.id || `${node.entityName}-${index}`,
      score: node.score,
      weekTradesCount: node.weekTradesCount,
      weekVolumeUsd: node.weekVolumeUsd
    } satisfies TraderLeaderboardEntry;
  });

  let e1xpTotalsByWallet: Record<string, number> = {};
  let profilesByWallet: Record<
    string,
    Awaited<ReturnType<typeof getPublicEvery1ProfilesByWallets>>[string]
  > = {};

  try {
    e1xpTotalsByWallet = await getPublicE1xpTotalsByWallets(
      entries
        .map((entry) => entry.address)
        .filter((address): address is string => Boolean(address))
    );
  } catch {
    e1xpTotalsByWallet = {};
  }

  try {
    profilesByWallet = hasSupabaseConfig()
      ? await getPublicEvery1ProfilesByWallets(
          entries
            .map((entry) => entry.address)
            .filter((address): address is string => Boolean(address))
        )
      : {};
  } catch {
    profilesByWallet = {};
  }

  return entries.map((entry) => ({
    ...entry,
    e1xpTotal: entry.address
      ? e1xpTotalsByWallet[entry.address.toLowerCase()] || 0
      : 0,
    isOfficial: entry.address
      ? profilesByWallet[entry.address.toLowerCase()]?.verificationStatus ===
        "verified"
      : false
  }));
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

  return formatCompactNaira(amount, digits);
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
