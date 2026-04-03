import { type GetCoinResponse, getCoin, setApiKey } from "@zoralabs/coins-sdk";
import type { Address } from "viem";
import { isAddress } from "viem";
import { base } from "viem/chains";
import { DEFAULT_AVATAR } from "@/data/constants";
import getZoraApiKey from "@/helpers/getZoraApiKey";
import { normalizePlatformLaunchCategory } from "@/helpers/platformCategories";
import { getPublicExploreCoinOverrides } from "@/helpers/staff";
import { getSupabaseClient } from "@/helpers/supabase";

type LaunchProfileRow = {
  avatar_url: null | string;
  display_name: null | string;
  id: string;
  username: null | string;
  verification_status: null | string;
  wallet_address: null | string;
};

type LaunchRow = {
  category: null | string;
  coin_address: null | string;
  cover_image_url: null | string;
  created_by: string;
  created_at: string;
  description: null | string;
  id: string;
  launched_at: null | string;
  name: string;
  post_destination: string;
  ticker: string;
};

export type PublicPlatformLaunch = {
  category: null | string;
  coinAddress: string;
  coverImageUrl: null | string;
  createdAt: string;
  creator: {
    avatarUrl: null | string;
    displayName: null | string;
    id: string;
    isOfficial: boolean;
    username: null | string;
    walletAddress: null | string;
  };
  description: null | string;
  id: string;
  launchedAt: string;
  name: string;
  pinnedSlot: null | number;
  postDestination: string;
  ticker: string;
};

export type PlatformDiscoverCoin = {
  address: string;
  category?: null | string;
  coverImageUrl?: null | string;
  createdAt: string;
  creatorAddress: null | string;
  creatorDisplayName?: null | string;
  creatorProfile: {
    avatar?: {
      previewImage?: {
        medium?: null | string;
        small?: null | string;
      };
    };
    handle?: null | string;
    platformBlocked?: boolean;
  } | null;
  description?: null | string;
  id: string;
  isPlatformCreated?: boolean;
  marketCap?: null | string;
  marketCapDelta24h?: null | string;
  mediaContent?: {
    mimeType?: null | string;
    previewImage?: {
      medium?: null | string;
      small?: null | string;
    };
    videoHlsUrl?: null | string;
    videoPreviewUrl?: null | string;
  } | null;
  name: string;
  platformBlocked?: boolean;
  symbol: string;
  tokenPrice?: {
    priceInPoolToken?: null | string;
    priceInUsdc?: null | string;
  } | null;
  uniqueHolders?: null | number;
  volume24h?: null | string;
};

type ZoraCoin = NonNullable<GetCoinResponse["zora20Token"]>;

const zoraApiKey = getZoraApiKey();

if (zoraApiKey) {
  setApiKey(zoraApiKey);
}

const toPreviewImage = (value?: null | string) =>
  value
    ? {
        medium: value,
        small: value
      }
    : undefined;

const buildFallbackCoin = (
  launch: PublicPlatformLaunch
): PlatformDiscoverCoin => ({
  address: launch.coinAddress,
  category: launch.category,
  coverImageUrl: launch.coverImageUrl,
  createdAt: launch.launchedAt,
  creatorAddress: launch.creator.walletAddress,
  creatorDisplayName: launch.creator.displayName,
  creatorProfile: {
    avatar: {
      previewImage: toPreviewImage(
        launch.creator.avatarUrl || launch.coverImageUrl || DEFAULT_AVATAR
      )
    },
    handle: launch.creator.username,
    platformBlocked: false
  },
  description: launch.description,
  id: launch.coinAddress,
  isPlatformCreated: true,
  marketCap: "0",
  marketCapDelta24h: "0",
  mediaContent: {
    previewImage: toPreviewImage(
      launch.coverImageUrl || launch.creator.avatarUrl || DEFAULT_AVATAR
    )
  },
  name: launch.name,
  platformBlocked: false,
  symbol: launch.ticker.toUpperCase(),
  tokenPrice: {
    priceInPoolToken: "0",
    priceInUsdc: "0"
  },
  uniqueHolders: 0,
  volume24h: "0"
});

const buildPlatformCoin = (
  launch: PublicPlatformLaunch,
  zoraCoin: ZoraCoin | null
): PlatformDiscoverCoin => {
  const fallback = buildFallbackCoin(launch);

  if (!zoraCoin) {
    return fallback;
  }

  return {
    ...fallback,
    coverImageUrl: fallback.coverImageUrl,
    creatorAddress: fallback.creatorAddress || zoraCoin.creatorAddress || null,
    description: fallback.description ?? zoraCoin.description ?? null,
    marketCap: zoraCoin.marketCap ?? fallback.marketCap,
    marketCapDelta24h: zoraCoin.marketCapDelta24h ?? fallback.marketCapDelta24h,
    name: fallback.name || zoraCoin.name || fallback.name,
    symbol: fallback.symbol || zoraCoin.symbol || fallback.symbol,
    tokenPrice: zoraCoin.tokenPrice ?? fallback.tokenPrice,
    uniqueHolders: zoraCoin.uniqueHolders ?? fallback.uniqueHolders,
    volume24h: zoraCoin.volume24h ?? fallback.volume24h
  };
};

const fetchZoraCoinLookup = async (addresses: string[]) => {
  const entries = await Promise.all(
    addresses.map(async (address) => {
      if (!isAddress(address)) {
        return null;
      }

      try {
        const response = await getCoin({
          address: address as Address,
          chain: base.id
        });
        const coin = response.data?.zora20Token ?? null;

        if (!coin) {
          return null;
        }

        return [address.toLowerCase(), coin] as const;
      } catch {
        return null;
      }
    })
  );

  return new Map<string, ZoraCoin>(
    entries.filter((entry): entry is readonly [string, ZoraCoin] =>
      Boolean(entry)
    )
  );
};

export const listPublicPlatformLaunches = async (input?: {
  category?: null | string;
  limit?: number;
  offset?: number;
}) => {
  const limit = Math.max(input?.limit || 24, 1);
  const offset = Math.max(input?.offset || 0, 0);
  const normalizedCategory = normalizePlatformLaunchCategory(input?.category);
  const supabase = getSupabaseClient();
  const overrides = await getPublicExploreCoinOverrides().catch(() => []);
  const hiddenLaunchIds = new Set(
    overrides
      .filter((override) => override.isHidden)
      .map((override) => override.launchId)
  );
  const pinnedLaunches = new Map(
    overrides
      .filter((override) => !override.isHidden)
      .map((override) => [override.launchId, override.pinnedSlot])
  );

  let launchQuery = supabase
    .from("creator_launches")
    .select(
      "id, created_by, ticker, name, description, cover_image_url, coin_address, launched_at, created_at, post_destination, category"
    )
    .eq("status", "launched")
    .not("coin_address", "is", null);

  if (normalizedCategory) {
    launchQuery = launchQuery.eq("category", normalizedCategory);
  }

  const { data: launchRows, error: launchError } = await launchQuery
    .order("launched_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit * 3 - 1);

  if (launchError) {
    throw launchError;
  }

  const rows = ((launchRows || []) as LaunchRow[]).filter(
    (row) => row.coin_address && !hiddenLaunchIds.has(row.id)
  );
  const creatorIds = Array.from(new Set(rows.map((row) => row.created_by)));
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, username, display_name, avatar_url, wallet_address, verification_status"
    )
    .in("id", creatorIds);

  if (profileError) {
    throw profileError;
  }

  const profilesById = Object.fromEntries(
    ((profileRows || []) as LaunchProfileRow[]).map((row) => [row.id, row])
  ) as Record<string, LaunchProfileRow>;

  return rows
    .map((row) => {
      const creator = profilesById[row.created_by];

      if (!row.coin_address || !creator) {
        return null;
      }

      return {
        category: row.category,
        coinAddress: row.coin_address.toLowerCase(),
        coverImageUrl: row.cover_image_url,
        createdAt: row.created_at,
        creator: {
          avatarUrl: creator.avatar_url,
          displayName: creator.display_name,
          id: creator.id,
          isOfficial: creator.verification_status === "verified",
          username: creator.username,
          walletAddress: creator.wallet_address
        },
        description: row.description,
        id: row.id,
        launchedAt: row.launched_at || row.created_at,
        name: row.name,
        pinnedSlot: pinnedLaunches.get(row.id) ?? null,
        postDestination: row.post_destination,
        ticker: row.ticker
      } satisfies PublicPlatformLaunch;
    })
    .filter((row): row is PublicPlatformLaunch => Boolean(row))
    .sort((left, right) => {
      if (left.pinnedSlot !== null || right.pinnedSlot !== null) {
        if (left.pinnedSlot === null) return 1;
        if (right.pinnedSlot === null) return -1;
        if (left.pinnedSlot !== right.pinnedSlot) {
          return left.pinnedSlot - right.pinnedSlot;
        }
      }

      return (
        new Date(right.launchedAt).getTime() -
        new Date(left.launchedAt).getTime()
      );
    })
    .slice(0, limit);
};

export const fetchPlatformDiscoverCoins = async (input?: {
  category?: null | string;
  limit?: number;
  offset?: number;
}) => {
  const launches = await listPublicPlatformLaunches(input);

  if (!launches.length) {
    return [];
  }

  const zoraCoinLookup = await fetchZoraCoinLookup(
    launches.map((launch) => launch.coinAddress)
  );

  return launches.map((launch) =>
    buildPlatformCoin(launch, zoraCoinLookup.get(launch.coinAddress) || null)
  );
};

export const mergePriorityItemsByAddress = <TItem extends { address: string }>(
  priorityItems: TItem[],
  fallbackItems: TItem[],
  limit?: number
) => {
  const merged = new Map<string, TItem>();

  for (const item of priorityItems) {
    merged.set(item.address.toLowerCase(), item);
  }

  for (const item of fallbackItems) {
    const key = item.address.toLowerCase();

    if (!merged.has(key)) {
      merged.set(key, item);
    }
  }

  const values = [...merged.values()];
  return typeof limit === "number" ? values.slice(0, limit) : values;
};
