import type { FiatWalletSummary } from "@/types/fiat";

const CACHE_EVENT = "every1:fiat-wallet-cache";
const CACHE_PREFIX = "every1:fiat-wallet";

export type FiatWalletCacheEntry = {
  cachedAt: string;
  wallet: FiatWalletSummary;
};

export const getFiatWalletCacheKey = (profileId?: null | string) =>
  profileId ? `${CACHE_PREFIX}:${profileId}` : null;

export const readFiatWalletCache = (profileId?: null | string) => {
  if (typeof window === "undefined") {
    return null;
  }

  const cacheKey = getFiatWalletCacheKey(profileId);

  if (!cacheKey) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(cacheKey);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as FiatWalletCacheEntry;

    if (!parsed?.wallet) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const writeFiatWalletCache = (
  profileId: string,
  wallet: FiatWalletSummary
) => {
  if (typeof window === "undefined") {
    return;
  }

  const cacheKey = getFiatWalletCacheKey(profileId);

  if (!cacheKey) {
    return;
  }

  const payload: FiatWalletCacheEntry = {
    cachedAt: new Date().toISOString(),
    wallet
  };

  window.localStorage.setItem(cacheKey, JSON.stringify(payload));
  window.dispatchEvent(new Event(CACHE_EVENT));
};

export const subscribeFiatWalletCache = (handler: () => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent) => {
    if (!event.key || !event.key.startsWith(CACHE_PREFIX)) {
      return;
    }

    handler();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(CACHE_EVENT, handler);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CACHE_EVENT, handler);
  };
};
