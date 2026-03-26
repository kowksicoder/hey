import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild
} from "@headlessui/react";
import { Fragment, memo, useMemo, useState } from "react";
import { DEFAULT_AVATAR } from "@/data/constants";
import cn from "@/helpers/cn";
import formatAddress from "@/helpers/formatAddress";
import { formatCompactNaira, NAIRA_SYMBOL } from "@/helpers/formatNaira";
import type { ZoraFeedItem } from "./zoraHomeFeedConfig";

const formatUsdMetric = (value?: string) => {
  const number = Number.parseFloat(value ?? "");

  return formatCompactNaira(number, 2);
};

const getCreatorName = (item: ZoraFeedItem) => {
  const handle = item.creatorProfile?.handle;

  if (handle?.trim()) {
    return handle.startsWith("@") ? handle : `@${handle}`;
  }

  return formatAddress(item.creatorAddress ?? item.address);
};

const getCreatorAvatar = (item: ZoraFeedItem) =>
  item.creatorProfile?.avatar?.previewImage?.medium || DEFAULT_AVATAR;

const getCreatorCover = (item: ZoraFeedItem) =>
  item.mediaContent?.previewImage?.medium ||
  item.mediaContent?.previewImage?.small ||
  getCreatorAvatar(item);

interface WhoToFollowFeedBlockProps {
  suggestions: ZoraFeedItem[];
  startIndex?: number;
}

const SuggestionCard = ({ item }: { item: ZoraFeedItem }) => {
  const creatorName = getCreatorName(item);
  const positive = Number.parseFloat(item.marketCapDelta24h ?? "0") >= 0;

  return (
    <article className="w-[9.75rem] shrink-0 md:w-[13.5rem]">
      <div className="relative overflow-hidden rounded-[1.15rem] bg-[#1b1b1b] md:rounded-[1.6rem]">
        <img
          alt={item.name}
          className="aspect-[4/5] w-full object-cover"
          src={getCreatorCover(item)}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/75" />

        <div className="absolute top-2 left-2 flex size-6 items-center justify-center rounded-full border border-white/20 bg-black/20 p-0.5 backdrop-blur-sm md:top-3 md:left-3 md:size-11">
          <img
            alt={creatorName}
            className="size-full rounded-full object-cover"
            src={getCreatorAvatar(item)}
          />
          <span className="absolute right-[-0.18rem] bottom-[-0.18rem] inline-flex size-3.5 items-center justify-center rounded-full bg-gray-950 font-bold text-[10px] text-white leading-none ring-2 ring-[#1b1b1b] md:right-[-0.05rem] md:bottom-[-0.05rem] md:size-5 md:text-xs">
            +
          </span>
        </div>

        <div className="absolute right-2 bottom-2 left-2 hidden md:right-3 md:bottom-3 md:left-3 md:block">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-[15px] text-white">
                {item.symbol ? `${NAIRA_SYMBOL}${item.symbol}` : item.name}
              </p>
              <p className="mt-1 truncate text-[12px] text-white/70">
                {creatorName}
              </p>
            </div>

            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 font-semibold text-[11px]",
                positive
                  ? "bg-emerald-400/20 text-emerald-200"
                  : "bg-rose-400/20 text-rose-200"
              )}
            >
              MC {formatUsdMetric(item.marketCap)}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-2 md:hidden">
        <p className="overflow-hidden font-semibold text-[15px] text-gray-950 leading-5 [-webkit-box-orient:vertical] [-webkit-line-clamp:1] [display:-webkit-box] dark:text-white">
          {item.symbol ? `${NAIRA_SYMBOL}${item.symbol}` : item.name}
        </p>
        <div className="mt-1">
          <span
            className={cn(
              "inline-flex max-w-full items-center rounded-full px-2 py-1 font-semibold text-[10px]",
              positive
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
            )}
          >
            MC {formatUsdMetric(item.marketCap)}
          </span>
        </div>
      </div>
    </article>
  );
};

const SuggestionListItem = ({ item }: { item: ZoraFeedItem }) => (
  <div className="flex items-center justify-between gap-3 rounded-[1.5rem] bg-gray-100 px-3 py-3 dark:bg-[#151515]">
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative shrink-0">
        <img
          alt={getCreatorName(item)}
          className="size-12 rounded-full object-cover"
          src={getCreatorAvatar(item)}
        />
        <span className="absolute right-0 bottom-0 inline-flex size-4 items-center justify-center rounded-full bg-gray-950 font-bold text-[11px] text-white leading-none ring-2 ring-gray-100 dark:bg-white dark:text-black dark:ring-[#151515]">
          +
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-[15px] text-gray-950 dark:text-white">
          {item.symbol ? `${NAIRA_SYMBOL}${item.symbol}` : item.name}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-gray-500 dark:text-white/55">
          {getCreatorName(item)}
        </p>
      </div>
    </div>

    <button
      className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-gray-950 px-4 py-2 font-semibold text-sm text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
      type="button"
    >
      Follow
    </button>
  </div>
);

const SuggestionsModal = ({
  onClose,
  show,
  suggestions
}: {
  onClose: () => void;
  show: boolean;
  suggestions: ZoraFeedItem[];
}) => (
  <Transition as={Fragment} show={show}>
    <Dialog as="div" className="relative z-[65]" onClose={onClose} open={show}>
      <TransitionChild
        as={Fragment}
        enter="ease-out duration-200"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="ease-in duration-150"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="fixed inset-0 bg-black/60" />
      </TransitionChild>

      <div className="fixed inset-0 flex items-end justify-center p-3 md:items-center">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-250"
          enterFrom="translate-y-full opacity-0 md:translate-y-0 md:scale-95"
          enterTo="translate-y-0 opacity-100 md:scale-100"
          leave="ease-in duration-200"
          leaveFrom="translate-y-0 opacity-100 md:scale-100"
          leaveTo="translate-y-full opacity-0 md:translate-y-0 md:scale-95"
        >
          <DialogPanel className="w-full max-w-md overflow-hidden rounded-[2rem] bg-[#181818] text-white shadow-2xl">
            <div className="flex justify-center pt-2.5">
              <span className="h-1.5 w-14 rounded-full bg-white/15" />
            </div>

            <div className="px-5 pt-4 pb-3 text-center">
              <h3 className="font-semibold text-lg tracking-tight md:text-2xl">
                Who to follow
              </h3>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-4 pb-4">
              <div className="space-y-3">
                {suggestions.map((item) => (
                  <SuggestionListItem item={item} key={`${item.id}-modal`} />
                ))}
              </div>
            </div>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </Transition>
);

const WhoToFollowFeedBlock = ({
  suggestions,
  startIndex = 0
}: WhoToFollowFeedBlockProps) => {
  const [showAll, setShowAll] = useState(false);
  const orderedSuggestions = useMemo(() => {
    if (!suggestions.length) {
      return [];
    }

    const normalizedStartIndex =
      ((startIndex % suggestions.length) + suggestions.length) %
      suggestions.length;

    return [
      ...suggestions.slice(normalizedStartIndex),
      ...suggestions.slice(0, normalizedStartIndex)
    ];
  }, [startIndex, suggestions]);

  const railSuggestions = useMemo(
    () => orderedSuggestions.slice(0, 4),
    [orderedSuggestions]
  );

  if (!orderedSuggestions.length) {
    return null;
  }

  return (
    <>
      <section className="-mx-4 bg-white px-4 py-2.5 md:mx-0 md:bg-transparent md:px-1 md:py-4 dark:bg-black">
        <div className="mb-1.5 flex items-center justify-between gap-2 md:mb-3 md:gap-4">
          <h2 className="font-semibold text-[14px] text-gray-950 leading-none tracking-tight md:text-2xl md:text-gray-950 dark:text-white">
            Who to follow
          </h2>
          <button
            className="shrink-0 font-semibold text-[11px] text-gray-500 leading-none transition-colors hover:text-gray-950 md:text-gray-500 md:text-sm md:hover:text-gray-950 dark:text-white/65 dark:hover:text-white"
            onClick={() => setShowAll(true)}
            type="button"
          >
            Show all
          </button>
        </div>

        <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-0.5 md:-mx-1 md:gap-3 md:px-1 md:pb-1">
          {railSuggestions.map((item) => (
            <SuggestionCard item={item} key={item.id} />
          ))}
        </div>
      </section>

      <SuggestionsModal
        onClose={() => setShowAll(false)}
        show={showAll}
        suggestions={orderedSuggestions}
      />
    </>
  );
};

export default memo(WhoToFollowFeedBlock);
