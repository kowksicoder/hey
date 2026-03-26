import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild
} from "@headlessui/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { getMostValuableCreatorCoins, setApiKey } from "@zoralabs/coins-sdk";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Image } from "@/components/Shared/UI";
import { DEFAULT_AVATAR } from "@/data/constants";
import cn from "@/helpers/cn";
import formatAddress from "@/helpers/formatAddress";
import { formatCompactNaira } from "@/helpers/formatNaira";
import getZoraApiKey from "@/helpers/getZoraApiKey";
import { getPublicExploreCoinOverrides } from "@/helpers/staff";
import { hasSupabaseConfig } from "@/helpers/supabase";
import type { ZoraFeedItem } from "./zoraHomeFeedConfig";

const zoraApiKey = getZoraApiKey();

if (zoraApiKey) {
  setApiKey(zoraApiKey);
}

const STORY_BAR_QUERY_KEY = "zora-home-story-bar";
const STORY_PLACEHOLDER_COUNT = 10;
const STORY_DURATION_MS = 5000;
const STORY_FETCH_COUNT = 18;

const formatUsdMetric = (value?: string) => {
  const number = Number.parseFloat(value ?? "");

  return formatCompactNaira(number, 2);
};

const formatDelta = (value?: string) => {
  const number = Number.parseFloat(value ?? "");

  if (!Number.isFinite(number)) {
    return "0%";
  }

  const absoluteValue = Math.abs(number);
  const digits = absoluteValue >= 100 ? 0 : absoluteValue >= 10 ? 1 : 2;

  return `${absoluteValue
    .toFixed(digits)
    .replace(/\.0+$|(\.\d*[1-9])0+$/, "$1")}%`;
};

const getCreatorAvatar = (item: ZoraFeedItem) =>
  item.creatorProfile?.avatar?.previewImage?.medium ||
  item.mediaContent?.previewImage?.medium ||
  item.mediaContent?.previewImage?.small ||
  DEFAULT_AVATAR;

const getCreatorCover = (item: ZoraFeedItem) =>
  item.mediaContent?.previewImage?.medium ||
  item.mediaContent?.previewImage?.small ||
  getCreatorAvatar(item);

const getCreatorLabel = (item: ZoraFeedItem) => {
  const handle = item.creatorProfile?.handle?.trim();

  if (handle) {
    return handle.replace(/^@/, "");
  }

  return formatAddress(item.creatorAddress ?? item.address);
};

const getCreatorHandle = (item: ZoraFeedItem) => {
  const handle = item.creatorProfile?.handle?.trim();

  if (handle) {
    return handle.startsWith("@") ? handle : `@${handle}`;
  }

  return formatAddress(item.creatorAddress ?? item.address);
};

const StoryCard = ({
  compact = false,
  item,
  loading = false,
  onClick
}: {
  compact?: boolean;
  item?: ZoraFeedItem;
  loading?: boolean;
  onClick?: () => void;
}) => {
  const wrapperClassName = compact
    ? "w-[4.25rem] shrink-0"
    : "w-[4.25rem] shrink-0 md:w-[6.75rem]";
  const avatarRingClassName = compact
    ? "rounded-full border border-[#149c7a]/40 bg-[#daf8ef] p-[2px] shadow-[0_10px_20px_-18px_rgba(20,156,122,0.65)] dark:border-[#0f5a49]/80 dark:bg-[#101412]"
    : "rounded-full border border-[#149c7a]/40 bg-[#daf8ef] p-[2px] shadow-[0_10px_20px_-18px_rgba(20,156,122,0.65)] md:p-[3px] dark:border-[#0f5a49]/80 dark:bg-[#101412]";
  const avatarInnerClassName = compact
    ? "rounded-full bg-white p-[2px] dark:bg-[#101412]"
    : "rounded-full bg-white p-[2px] md:p-[3px] dark:bg-[#101412]";
  const avatarClassName = compact
    ? "size-[3.2rem] rounded-full object-cover"
    : "size-[3.2rem] rounded-full object-cover md:size-[5.15rem]";
  const placeholderAvatarClassName = compact
    ? "size-[3.2rem] animate-pulse rounded-full bg-gray-200 dark:bg-white/10"
    : "size-[3.2rem] animate-pulse rounded-full bg-gray-200 md:size-[5.15rem] dark:bg-white/10";
  const badgeClassName = compact
    ? "absolute bottom-0 rounded-full border border-[#0e5746]/25 bg-white px-1.25 py-0.25 font-semibold text-[#0d8f70] text-[9px] shadow-[0_8px_20px_-16px_rgba(0,0,0,0.8)] dark:border-[#0e5746]/70"
    : "absolute bottom-0 rounded-full border border-[#0e5746]/25 bg-white px-1.25 py-0.25 font-semibold text-[#0d8f70] text-[9px] shadow-[0_8px_20px_-16px_rgba(0,0,0,0.8)] md:border-[#0e5746]/30 md:px-2.5 md:py-1 md:text-[13px] dark:border-[#0e5746]/70";
  const labelClassName = compact
    ? "mt-1 truncate px-0 text-center font-semibold text-[10px] text-gray-950 leading-3.5 tracking-[-0.01em] dark:text-white"
    : "mt-1 truncate px-0 text-center font-semibold text-[10px] text-gray-950 leading-3.5 tracking-[-0.01em] md:mt-3 md:px-1 md:text-[15px] md:leading-normal md:tracking-normal dark:text-white";

  if (loading || !item) {
    return (
      <div className={wrapperClassName}>
        <div className="relative flex justify-center">
          <div className={avatarRingClassName}>
            <div className={avatarInnerClassName}>
              <div className={placeholderAvatarClassName} />
            </div>
          </div>
          <div
            className={cn(
              "absolute bottom-0 h-4.5 w-[3.1rem] animate-pulse rounded-full bg-white shadow-[0_8px_20px_-16px_rgba(0,0,0,0.24)] dark:bg-white/10",
              compact ? "" : "md:h-7 md:w-[5.25rem]"
            )}
          />
        </div>
        <div
          className={cn(
            "mx-auto mt-1.5 h-3 w-12 animate-pulse rounded-full bg-gray-200 dark:bg-white/10",
            compact ? "" : "md:mt-4 md:h-4 md:w-16"
          )}
        />
      </div>
    );
  }

  return (
    <button
      className={cn(wrapperClassName, "text-left")}
      onClick={onClick}
      type="button"
    >
      <div className="relative flex justify-center">
        <div className={avatarRingClassName}>
          <div className={avatarInnerClassName}>
            <Image
              alt={getCreatorLabel(item)}
              className={avatarClassName}
              height={82}
              src={getCreatorAvatar(item)}
              width={82}
            />
          </div>
        </div>

        <div className={badgeClassName}>{formatUsdMetric(item.marketCap)}</div>
      </div>

      <p className={labelClassName}>{getCreatorLabel(item)}</p>
    </button>
  );
};

const StoryViewer = ({
  activeIndex,
  items,
  onClose,
  onNext,
  onPrevious
}: {
  activeIndex: number | null;
  items: ZoraFeedItem[];
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) => {
  const activeItem =
    activeIndex !== null && items[activeIndex] ? items[activeIndex] : null;

  return (
    <Transition as={Fragment} show={activeItem !== null}>
      <Dialog
        as="div"
        className="relative z-[70]"
        onClose={onClose}
        open={activeItem !== null}
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-center justify-center p-3 md:p-6">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-250"
            enterFrom="translate-y-4 opacity-0 md:scale-95"
            enterTo="translate-y-0 opacity-100 md:scale-100"
            leave="ease-in duration-200"
            leaveFrom="translate-y-0 opacity-100 md:scale-100"
            leaveTo="translate-y-4 opacity-0 md:scale-95"
          >
            <DialogPanel className="relative h-[82vh] w-full max-w-sm overflow-hidden rounded-[2rem] bg-[#050505] text-white shadow-2xl md:max-w-md">
              {activeItem ? (
                <>
                  <div className="absolute inset-0">
                    <Image
                      alt={getCreatorLabel(activeItem)}
                      className="h-full w-full object-cover"
                      src={getCreatorCover(activeItem)}
                    />
                    <div className="absolute inset-0 bg-black/55" />
                  </div>

                  <div className="relative flex h-full flex-col p-4 md:p-5">
                    <div className="flex gap-1.5">
                      {items.map((item, index) => (
                        <span
                          className="h-1 flex-1 overflow-hidden rounded-full bg-white/20"
                          key={`${item.id}-progress`}
                        >
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              index < (activeIndex ?? 0)
                                ? "w-full bg-white"
                                : index === activeIndex
                                  ? "w-full bg-[#18c79a]"
                                  : "w-0 bg-transparent"
                            )}
                          />
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Image
                          alt={getCreatorLabel(activeItem)}
                          className="size-11 rounded-full border border-white/25 object-cover"
                          height={44}
                          src={getCreatorAvatar(activeItem)}
                          width={44}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-sm md:text-base">
                            {getCreatorLabel(activeItem)}
                          </p>
                          <p className="truncate text-sm text-white/70">
                            {getCreatorHandle(activeItem)}
                          </p>
                        </div>
                      </div>

                      <button
                        aria-label="Close stories"
                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-black/30 text-white/90 transition-colors hover:bg-black/50"
                        onClick={onClose}
                        type="button"
                      >
                        <XMarkIcon className="size-5" />
                      </button>
                    </div>

                    <div className="mt-auto space-y-4">
                      <div className="space-y-2">
                        <p className="font-semibold text-[#7ee5ca] text-[11px] uppercase tracking-[0.24em]">
                          Top creator
                        </p>
                        <h2 className="font-semibold text-lg tracking-tight md:text-[2rem]">
                          {activeItem.name}
                        </h2>
                        <p className="text-sm text-white/80 leading-6">
                          {activeItem.description?.trim() ||
                            "One of the leading creator coins on Every1 right now."}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-2xl bg-white/12 px-3 py-3 backdrop-blur-md">
                          <p className="font-semibold text-sm">
                            {formatUsdMetric(activeItem.marketCap)}
                          </p>
                          <p className="mt-1 text-[11px] text-white/65">MC</p>
                        </div>
                        <div className="rounded-2xl bg-white/12 px-3 py-3 backdrop-blur-md">
                          <p className="font-semibold text-sm">
                            {formatUsdMetric(activeItem.volume24h)}
                          </p>
                          <p className="mt-1 text-[11px] text-white/65">Vol</p>
                        </div>
                        <div className="rounded-2xl bg-white/12 px-3 py-3 backdrop-blur-md">
                          <p className="font-semibold text-sm">
                            {formatDelta(activeItem.marketCapDelta24h)}
                          </p>
                          <p className="mt-1 text-[11px] text-white/65">24h</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          className="inline-flex flex-1 items-center justify-center rounded-full bg-white px-4 py-3 font-semibold text-[#0b0b0b] transition-colors hover:bg-white/90"
                          onClick={onNext}
                          type="button"
                        >
                          {activeIndex === items.length - 1
                            ? "Done"
                            : "Next creator"}
                        </button>
                      </div>
                    </div>

                    <button
                      aria-label="Previous story"
                      className="absolute inset-y-0 left-0 w-1/3"
                      onClick={onPrevious}
                      type="button"
                    />
                    <button
                      aria-label="Next story"
                      className="absolute inset-y-0 right-0 w-1/3"
                      onClick={onNext}
                      type="button"
                    />

                    <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                      <span className="rounded-full bg-black/28 p-2 backdrop-blur-sm">
                        <ChevronLeftIcon className="size-4 text-white/90" />
                      </span>
                    </div>
                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                      <span className="rounded-full bg-black/28 p-2 backdrop-blur-sm">
                        <ChevronRightIcon className="size-4 text-white/90" />
                      </span>
                    </div>
                  </div>
                </>
              ) : null}
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
};

interface HeroProps {
  variant?: "page" | "sidebar";
}

const Hero = ({ variant = "page" }: HeroProps) => {
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const compact = variant === "sidebar";

  const { data, isLoading } = useQuery({
    queryFn: async () => {
      if (!zoraApiKey) {
        return [];
      }

      const response = await getMostValuableCreatorCoins({
        count: STORY_FETCH_COUNT
      });
      const edges = response.data?.exploreList?.edges ?? [];
      const items = edges
        .map((edge) => edge.node)
        .filter(
          (item) =>
            !item.platformBlocked && !item.creatorProfile?.platformBlocked
        );

      if (!hasSupabaseConfig()) {
        return items.slice(0, STORY_PLACEHOLDER_COUNT);
      }

      const overrides = await getPublicExploreCoinOverrides().catch(() => []);
      const hiddenAddresses = new Set(
        overrides
          .filter((override) => override.isHidden && override.coinAddress)
          .map((override) => override.coinAddress?.toLowerCase())
      );
      const hiddenTickers = new Set(
        overrides
          .filter((override) => override.isHidden && override.ticker)
          .map((override) => override.ticker?.toLowerCase())
      );
      const pinnedOverrides = overrides
        .filter(
          (override) => !override.isHidden && override.pinnedSlot !== null
        )
        .sort(
          (a, b) =>
            (a.pinnedSlot || Number.MAX_SAFE_INTEGER) -
            (b.pinnedSlot || Number.MAX_SAFE_INTEGER)
        );

      const filteredItems = items.filter(
        (item) =>
          !hiddenAddresses.has(item.address.toLowerCase()) &&
          !hiddenTickers.has(item.symbol?.toLowerCase?.() || "")
      );

      const orderedItems: ZoraFeedItem[] = [];
      const seenAddresses = new Set<string>();

      for (const override of pinnedOverrides) {
        const match = filteredItems.find(
          (item) =>
            item.address.toLowerCase() ===
              override.coinAddress?.toLowerCase() ||
            (item.symbol?.toLowerCase?.() || "") ===
              (override.ticker?.toLowerCase() || "")
        );

        if (match && !seenAddresses.has(match.address.toLowerCase())) {
          seenAddresses.add(match.address.toLowerCase());
          orderedItems.push(match);
        }
      }

      for (const item of filteredItems) {
        if (!seenAddresses.has(item.address.toLowerCase())) {
          seenAddresses.add(item.address.toLowerCase());
          orderedItems.push(item);
        }
      }

      return orderedItems.slice(0, STORY_PLACEHOLDER_COUNT);
    },
    queryKey: [STORY_BAR_QUERY_KEY],
    staleTime: 60_000
  });

  const items = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    if (activeStoryIndex === null || !items.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      setActiveStoryIndex((currentIndex) => {
        if (currentIndex === null) {
          return null;
        }

        if (currentIndex >= items.length - 1) {
          return null;
        }

        return currentIndex + 1;
      });
    }, STORY_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [activeStoryIndex, items.length]);

  if (!isLoading && !items.length) {
    return null;
  }

  return (
    <>
      <section
        className={cn(
          "w-full",
          compact ? "px-0 py-0" : "-mt-1 px-2 py-2 md:mt-0 md:px-5 md:py-4"
        )}
      >
        <div
          className={cn(
            "no-scrollbar flex overflow-x-auto pb-0.5",
            compact ? "gap-2" : "gap-2 md:gap-5 md:pb-1"
          )}
        >
          {isLoading
            ? Array.from({ length: STORY_PLACEHOLDER_COUNT }).map(
                (_, index) => (
                  <StoryCard
                    compact={compact}
                    key={`story-placeholder-${index}`}
                    loading
                  />
                )
              )
            : items.map((item, index) => (
                <StoryCard
                  compact={compact}
                  item={item}
                  key={item.id}
                  onClick={() => setActiveStoryIndex(index)}
                />
              ))}
        </div>
      </section>

      <StoryViewer
        activeIndex={activeStoryIndex}
        items={items}
        onClose={() => setActiveStoryIndex(null)}
        onNext={() => {
          setActiveStoryIndex((currentIndex) => {
            if (currentIndex === null || currentIndex >= items.length - 1) {
              return null;
            }

            return currentIndex + 1;
          });
        }}
        onPrevious={() => {
          setActiveStoryIndex((currentIndex) => {
            if (currentIndex === null) {
              return null;
            }

            return currentIndex > 0 ? currentIndex - 1 : currentIndex;
          });
        }}
      />
    </>
  );
};

export default Hero;
