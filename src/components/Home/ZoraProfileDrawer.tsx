import { Transition, TransitionChild } from "@headlessui/react";
import {
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { type GetProfileResponse, getProfile } from "@zoralabs/coins-sdk";
import { Fragment, memo } from "react";
import { Spinner } from "@/components/Shared/UI";
import { DEFAULT_AVATAR } from "@/data/constants";
import cn from "@/helpers/cn";
import formatAddress from "@/helpers/formatAddress";
import { formatCompactNairaFromUsd } from "@/helpers/formatNaira";
import type { ZoraFeedItem } from "./zoraHomeFeedConfig";

type ProfileData = NonNullable<GetProfileResponse["profile"]>;

const formatUsdMetric = (value?: string | null) => {
  const number = Number.parseFloat(value ?? "");

  return formatCompactNairaFromUsd(number, 2);
};

const getCreatorName = (item: ZoraFeedItem) => {
  const handle = item.creatorProfile?.handle;

  if (handle?.trim()) {
    return handle.startsWith("@") ? handle : `@${handle}`;
  }

  return formatAddress(item.creatorAddress ?? item.address);
};

const getIdentifier = (item: ZoraFeedItem) =>
  item.creatorProfile?.handle || item.creatorAddress || item.address;

const getFallbackAvatar = (item: ZoraFeedItem) =>
  item.creatorProfile?.avatar?.previewImage?.medium || DEFAULT_AVATAR;

interface ZoraProfileDrawerProps {
  item: ZoraFeedItem | null;
  onClose: () => void;
  show: boolean;
}

const ZoraProfileDrawer = ({ item, onClose, show }: ZoraProfileDrawerProps) => {
  const { data, isLoading } = useQuery({
    enabled: show && Boolean(item),
    queryFn: async () => {
      if (!item) {
        return null;
      }

      const response = await getProfile({
        identifier: getIdentifier(item)
      });

      return response.data?.profile ?? null;
    },
    queryKey: ["zora-profile-drawer", item ? getIdentifier(item) : ""]
  });

  const profile = data as ProfileData | null;
  const displayHandle = profile?.handle
    ? profile.handle.startsWith("@")
      ? profile.handle
      : `@${profile.handle}`
    : item
      ? getCreatorName(item)
      : "@every1";
  const displayName =
    profile?.displayName?.trim() || profile?.username?.trim() || null;
  const bio = profile?.bio?.trim();
  const avatar =
    profile?.avatar?.medium ||
    profile?.avatar?.small ||
    (item ? getFallbackAvatar(item) : DEFAULT_AVATAR);
  const website = profile?.website?.trim();
  const marketCap = profile?.creatorCoin?.marketCap;
  const marketDelta = Number.parseFloat(
    profile?.creatorCoin?.marketCapDelta24h ?? "0"
  );
  const isPositive = marketDelta >= 0;
  const walletAddress =
    profile?.publicWallet?.walletAddress ||
    item?.creatorAddress ||
    item?.address;
  const socialAccountCount = Object.values(
    profile?.socialAccounts ?? {}
  ).filter(Boolean).length;

  return (
    <Transition as={Fragment} show={show}>
      <div className="absolute inset-0 z-40">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <button
            aria-label="Close profile"
            className="absolute inset-0 bg-black/35"
            onClick={onClose}
            type="button"
          />
        </TransitionChild>

        <TransitionChild
          as={Fragment}
          enter="ease-out duration-250"
          enterFrom="translate-y-full"
          enterTo="translate-y-0"
          leave="ease-in duration-200"
          leaveFrom="translate-y-0"
          leaveTo="translate-y-full"
        >
          <div className="absolute inset-x-0 bottom-0 max-h-[72vh] overflow-hidden rounded-t-[1.75rem] bg-white text-gray-950 shadow-2xl dark:bg-gray-950 dark:text-gray-50">
            <div className="flex justify-center pt-2.5">
              <span className="h-1.5 w-12 rounded-full bg-gray-300 dark:bg-gray-700" />
            </div>

            {isLoading ? (
              <div className="flex h-56 items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : (
              <div className="px-5 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
                <div className="flex items-start gap-4">
                  <img
                    alt={displayHandle}
                    className="size-18 shrink-0 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-800"
                    src={avatar}
                  />

                  <div className="min-w-0 flex-1">
                    {displayName ? (
                      <p className="truncate font-semibold text-base">
                        {displayName}
                      </p>
                    ) : null}
                    <p className="mt-1 truncate text-gray-500 text-sm dark:text-gray-400">
                      {displayHandle}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold text-[11px] ring-1",
                          isPositive
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-900/70"
                            : "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-900/70"
                        )}
                      >
                        <span>MC {formatUsdMetric(marketCap)}</span>
                        {Number.isFinite(marketDelta) ? (
                          isPositive ? (
                            <ArrowTrendingUpIcon className="size-3.5" />
                          ) : (
                            <ArrowTrendingDownIcon className="size-3.5" />
                          )
                        ) : null}
                      </span>
                      {socialAccountCount ? (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 font-semibold text-[11px] text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                          {socialAccountCount} socials
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {bio ? (
                  <p className="mt-4 break-words text-[13px] text-gray-700 leading-6 [overflow-wrap:anywhere] dark:text-gray-300">
                    {bio}
                  </p>
                ) : null}

                {website ? (
                  <p className="mt-3 truncate font-medium text-[13px] text-blue-600 dark:text-blue-400">
                    {website}
                  </p>
                ) : null}

                <div className="mt-5 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-gray-100 px-3 py-3 text-center dark:bg-gray-900">
                    <p className="font-semibold text-sm">
                      {walletAddress ? formatAddress(walletAddress) : "--"}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      Wallet
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-100 px-3 py-3 text-center dark:bg-gray-900">
                    <p className="font-semibold text-sm">
                      {socialAccountCount || "0"}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      Socials
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-100 px-3 py-3 text-center dark:bg-gray-900">
                    <p className="font-semibold text-sm">
                      {formatUsdMetric(marketCap)}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      Coin MC
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <button
                    className="inline-flex flex-1 items-center justify-center rounded-full bg-gray-950 px-4 py-3 font-semibold text-sm text-white dark:bg-white dark:text-gray-950"
                    type="button"
                  >
                    Trade
                  </button>
                  <button
                    className="inline-flex flex-1 items-center justify-center rounded-full bg-gray-100 px-4 py-3 font-semibold text-gray-700 text-sm dark:bg-gray-900 dark:text-gray-200"
                    onClick={onClose}
                    type="button"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </TransitionChild>
      </div>
    </Transition>
  );
};

export default memo(ZoraProfileDrawer);
