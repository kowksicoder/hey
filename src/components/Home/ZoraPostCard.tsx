import {
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  BookmarkIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  EllipsisHorizontalIcon,
  HeartIcon,
  PaperAirplaneIcon
} from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Card, Image } from "@/components/Shared/UI";
import { DEFAULT_AVATAR } from "@/data/constants";
import { HomeFeedView } from "@/data/enums";
import cn from "@/helpers/cn";
import formatAddress from "@/helpers/formatAddress";
import getCoinPath from "@/helpers/getCoinPath";
import nFormatter from "@/helpers/nFormatter";
import truncateByWords from "@/helpers/truncateByWords";
import type { Every1PublicCoinCollaboration } from "@/types/every1";
import type { ZoraFeedItem } from "./zoraHomeFeedConfig";

const formatUsdMetric = (value?: string) => {
  const number = Number.parseFloat(value ?? "");

  if (!Number.isFinite(number) || number <= 0) {
    return "$0";
  }

  return `$${nFormatter(number, 2)}`;
};

const formatDelta = (value?: string) => {
  const number = Number.parseFloat(value ?? "");

  if (!Number.isFinite(number)) {
    return "0%";
  }

  const absoluteValue = Math.abs(number);
  const digits = absoluteValue >= 100 ? 0 : absoluteValue >= 10 ? 1 : 2;
  const prefix = number > 0 ? "+" : number < 0 ? "-" : "";

  return `${prefix}${absoluteValue.toFixed(digits).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1")}%`;
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

const getCollaborationMembers = (
  collaboration?: Every1PublicCoinCollaboration | null
) => collaboration?.members.slice(0, 2) || [];

const getCollaborationLabel = (
  collaboration?: Every1PublicCoinCollaboration | null
) => {
  const names =
    collaboration?.members
      .slice(0, 2)
      .map(
        (member) =>
          member.username?.trim() ||
          member.displayName?.trim() ||
          "Collaborator"
      )
      .filter(Boolean) || [];

  if (!names.length) {
    return null;
  }

  const suffix =
    collaboration && collaboration.activeMemberCount > names.length
      ? ` +${collaboration.activeMemberCount - names.length}`
      : "";

  return `${names.join(" × ")}${suffix}`;
};

const getPreviewImage = (item: ZoraFeedItem) =>
  item.mediaContent?.previewImage?.medium ||
  item.mediaContent?.previewImage?.small ||
  item.creatorProfile?.avatar?.previewImage?.medium ||
  undefined;

const getActionCounts = (item: ZoraFeedItem) => {
  const holderCount = item.uniqueHolders ?? 0;
  const commentCount =
    holderCount > 0 ? Math.max(1, Math.round(holderCount / 18)) : 0;
  const likeCount =
    holderCount > 0
      ? Math.max(commentCount, Math.round(holderCount * 0.62))
      : 0;
  const shareCount =
    commentCount > 0
      ? Math.max(1, Math.round(commentCount * 0.35))
      : Math.round(holderCount / 40);

  return {
    commentCount,
    likeCount,
    shareCount
  };
};

const formatPostTimestamp = (date?: string) => {
  if (!date) {
    return "";
  }

  const now = dayjs();
  const targetDate = dayjs(date);

  if (!targetDate.isValid()) {
    return "";
  }

  const diffInDays = now.diff(targetDate, "day");
  const diffInHours = now.diff(targetDate, "hour");
  const diffInMinutes = now.diff(targetDate, "minute");
  const diffInSeconds = now.diff(targetDate, "second");

  if (diffInDays >= 1) {
    if (diffInDays < 7) {
      return `${diffInDays}d`;
    }

    return targetDate
      .format(now.isSame(targetDate, "year") ? "D MMM" : "D MMM YY")
      .toLowerCase();
  }

  if (diffInHours >= 1) {
    return `${diffInHours}h`;
  }

  if (diffInMinutes >= 1) {
    return `${diffInMinutes}m`;
  }

  return `${Math.max(diffInSeconds, 0)}s`;
};

const MetaPill = ({
  label,
  tone = "default",
  value
}: {
  label: string;
  tone?: "default" | "down" | "up";
  value: string;
}) => (
  <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-[11px] dark:bg-gray-900">
    <span className="text-gray-500 dark:text-gray-400">{label}</span>
    <span
      className={cn(
        "font-semibold tracking-tight",
        tone === "up"
          ? "text-emerald-600 dark:text-emerald-400"
          : tone === "down"
            ? "text-rose-600 dark:text-rose-400"
            : "text-gray-950 dark:text-gray-50"
      )}
    >
      {value}
    </span>
  </div>
);

const ActionButton = ({
  count,
  compact = false,
  Icon,
  align = "left",
  label
}: {
  count?: number;
  compact?: boolean;
  Icon: typeof HeartIcon;
  align?: "left" | "right";
  label: string;
}) => (
  <button
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full text-gray-500 text-sm transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100",
      compact ? "px-1 py-1 md:px-1.5 md:py-1" : "px-2.5 py-2",
      align === "right" ? "justify-center" : undefined
    )}
    onClick={(event) => {
      event.stopPropagation();
    }}
    type="button"
  >
    <Icon className={compact ? "size-3.5" : "size-4"} />
    {typeof count === "number" ? (
      <span
        className={cn(
          "font-semibold tabular-nums",
          compact ? "text-[9px] md:text-[10px]" : "text-[12px]"
        )}
      >
        {nFormatter(count, 1) || "0"}
      </span>
    ) : (
      <span className="sr-only">{label}</span>
    )}
  </button>
);

const ZoraPostCard = ({
  collaboration,
  item,
  onOpenMobileView,
  viewMode = HomeFeedView.LIST
}: {
  collaboration?: Every1PublicCoinCollaboration | null;
  item: ZoraFeedItem;
  onOpenMobileView?: () => void;
  viewMode?: HomeFeedView;
}) => {
  const navigate = useNavigate();
  const isGridView = viewMode === HomeFeedView.GRID;
  const previewImage = getPreviewImage(item);
  const delta = Number.parseFloat(item.marketCapDelta24h ?? "0");
  const isPositive = delta >= 0;
  const creatorName = getCreatorName(item);
  const collaborationLabel = getCollaborationLabel(collaboration);
  const visibleCollaborationMembers = getCollaborationMembers(collaboration);
  const timestamp = item.createdAt
    ? formatPostTimestamp(item.createdAt)
    : formatAddress(item.address);
  const { commentCount, likeCount, shareCount } = getActionCounts(item);
  const caption = item.description?.trim();
  const coinPath = getCoinPath(item.address);
  const handleCoinNavigation = (event: MouseEvent<HTMLElement>) => {
    if (!coinPath || typeof window === "undefined") {
      return;
    }

    if (!isGridView && !window.matchMedia("(min-width: 768px)").matches) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    navigate(coinPath);
  };

  return (
    <Card
      className={cn(
        "w-full min-w-0 max-w-full overflow-hidden px-0 py-0 md:cursor-default",
        isGridView ? "h-full" : undefined
      )}
      forceRounded={isGridView}
      onClick={onOpenMobileView}
    >
      <div
        className={cn(
          isGridView
            ? "px-2 pt-2 pb-1.5 md:px-2.5 md:pt-2.5 md:pb-2"
            : "px-4 pt-4 pb-3"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              "flex min-w-0 items-start",
              isGridView ? "gap-2" : "gap-3"
            )}
          >
            {visibleCollaborationMembers.length > 1 ? (
              <div
                className={cn(
                  "relative shrink-0",
                  isGridView
                    ? "h-5 w-8 md:h-[1.375rem] md:w-9"
                    : "h-11 w-[4.1rem]"
                )}
              >
                {visibleCollaborationMembers.map((member, index) => (
                  <Image
                    alt={
                      member.username ||
                      member.displayName ||
                      `Collaborator ${index + 1}`
                    }
                    className={cn(
                      "absolute top-0 rounded-full border border-white object-cover ring-1 ring-gray-300/90 ring-offset-1 ring-offset-white dark:border-black dark:ring-gray-700 dark:ring-offset-black",
                      isGridView ? "size-5 md:size-[1.375rem]" : "size-11",
                      index === 0 ? "left-0 z-10" : "right-0 z-20"
                    )}
                    height={isGridView ? 20 : 44}
                    key={member.profileId}
                    src={member.avatarUrl || DEFAULT_AVATAR}
                    width={isGridView ? 20 : 44}
                  />
                ))}
              </div>
            ) : (
              <Image
                alt={creatorName}
                className={cn(
                  "shrink-0 rounded-full border border-white object-cover ring-1 ring-gray-300/90 ring-offset-1 ring-offset-white dark:border-black dark:ring-gray-700 dark:ring-offset-black",
                  isGridView ? "size-5 md:size-[1.375rem]" : "size-11"
                )}
                height={isGridView ? 20 : 44}
                src={getCreatorAvatar(item)}
                width={isGridView ? 20 : 44}
              />
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  className={cn(
                    "truncate font-semibold text-gray-950 transition-colors hover:text-emerald-600 dark:text-gray-50 dark:hover:text-emerald-400",
                    isGridView ? "text-[11px] md:text-[12px]" : "text-sm"
                  )}
                  onClick={handleCoinNavigation}
                  type="button"
                >
                  {item.symbol ? `$${item.symbol}` : "Coin"}
                </button>
                {collaboration ? (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-sky-500/12 px-2 py-0.5 font-semibold text-[9px] text-sky-700 ring-1 ring-sky-500/20 dark:bg-sky-500/14 dark:text-sky-300 dark:ring-sky-400/20">
                    Collab
                  </span>
                ) : null}
                {isGridView ? null : (
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-semibold text-[10px] ring-1",
                      isPositive
                        ? "bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-800"
                        : "bg-rose-100 text-rose-800 ring-rose-300 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-800"
                    )}
                  >
                    <span>MC {formatUsdMetric(item.marketCap)}</span>
                  </span>
                )}
              </div>
              {isGridView ? null : (
                <div
                  className={cn(
                    "mt-0.5 flex min-w-0 items-center text-gray-500 dark:text-gray-400",
                    "text-[11px]"
                  )}
                >
                  <span className="truncate">
                    {collaborationLabel || creatorName}
                  </span>
                  <span className="mx-1.5 text-gray-300 dark:text-gray-600">
                    •
                  </span>
                  <span className="truncate">{timestamp}</span>
                </div>
              )}
            </div>
          </div>

          {isGridView ? null : (
            <button
              aria-label={`More options for ${item.name}`}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100"
              onClick={(event) => {
                event.stopPropagation();
              }}
              type="button"
            >
              <EllipsisHorizontalIcon className="size-5" />
            </button>
          )}
        </div>

        {isGridView ? null : (
          <div className="mt-3 min-w-0 max-w-full">
            <h2 className="hidden max-w-full overflow-hidden break-all font-semibold text-base text-gray-950 tracking-tight [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] md:block md:overflow-visible md:break-words md:text-lg dark:text-gray-50 md:[-webkit-line-clamp:unset] md:[display:block] md:[overflow-wrap:anywhere]">
              {item.name}
            </h2>

            {caption ? (
              <p className="mt-1 hidden max-w-full break-all text-gray-600 text-sm leading-6 md:block md:break-words dark:text-gray-300 md:[overflow-wrap:anywhere]">
                {truncateByWords(caption, 34)}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {previewImage ? (
        <div
          className={cn(
            isGridView ? "px-2 pb-1.5 md:px-2.5 md:pb-2" : "px-4 pb-3"
          )}
        >
          <button
            className={cn(
              "relative block w-full overflow-hidden bg-gray-100 transition-transform hover:scale-[1.01] dark:bg-gray-900",
              isGridView
                ? "rounded-[0.8rem] md:rounded-[0.9rem]"
                : "rounded-[1.5rem]"
            )}
            onClick={handleCoinNavigation}
            type="button"
          >
            <Image
              alt={item.name}
              className={cn(
                "w-full max-w-full object-cover",
                isGridView
                  ? "aspect-[6/5] md:aspect-[0.96]"
                  : "aspect-square md:aspect-[4/3]"
              )}
              src={previewImage}
            />
          </button>
        </div>
      ) : null}

      {isGridView ? (
        <div className="px-2 pb-1.5 md:px-2.5 md:pb-2">
          <div className="flex items-center gap-1.5 font-semibold text-[9px] text-gray-500 dark:text-gray-400">
            {collaboration ? (
              <span className="inline-flex items-center justify-center rounded-full bg-sky-500/12 px-1.5 py-0.75 text-sky-700 dark:bg-sky-500/14 dark:text-sky-300">
                Collab
              </span>
            ) : null}
            <span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-1.5 py-0.75 md:px-1.5 md:py-0.75 dark:bg-gray-900">
              MC {formatUsdMetric(item.marketCap)}
            </span>
            {coinPath ? (
              <Link
                className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.75 font-semibold text-[9px] text-white transition-colors hover:bg-emerald-600"
                onClick={(event) => {
                  event.stopPropagation();
                }}
                to={coinPath}
              >
                Trade
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="hidden px-4 pb-3 md:block">
          <div className="flex flex-wrap gap-2">
            <MetaPill label="MCap" value={formatUsdMetric(item.marketCap)} />
            {coinPath ? (
              <Link
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 font-semibold text-[11px] text-white transition-colors hover:bg-emerald-600"
                onClick={(event) => {
                  event.stopPropagation();
                }}
                to={coinPath}
              >
                Trade
              </Link>
            ) : (
              <MetaPill label="Vol" value={formatUsdMetric(item.volume24h)} />
            )}
            <MetaPill
              label="Holders"
              value={nFormatter(item.uniqueHolders ?? 0, 2) || "0"}
            />
            <MetaPill
              label="24h"
              tone={isPositive ? "up" : "down"}
              value={formatDelta(item.marketCapDelta24h)}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="truncate">
              {formatAddress(item.address)} on Base
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 font-semibold",
                isPositive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              )}
            >
              {isPositive ? (
                <ArrowTrendingUpIcon className="size-3.5" />
              ) : (
                <ArrowTrendingDownIcon className="size-3.5" />
              )}
              <span>{formatDelta(item.marketCapDelta24h)}</span>
            </span>
          </div>
        </div>
      )}

      {isGridView ? null : (
        <div className="border-gray-200 border-t px-2 py-2 dark:border-gray-800">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              <ActionButton count={likeCount} Icon={HeartIcon} label="Like" />
              <ActionButton
                count={commentCount}
                Icon={ChatBubbleOvalLeftEllipsisIcon}
                label="Comment"
              />
              <ActionButton
                count={shareCount}
                Icon={PaperAirplaneIcon}
                label="Share"
              />
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <div className="flex items-center gap-2 text-[11px] text-gray-500 md:hidden dark:text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <span className="font-semibold text-gray-950 dark:text-gray-50">
                    {nFormatter(item.uniqueHolders ?? 0, 1) || "0"}
                  </span>
                  <span>H</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="font-semibold text-gray-950 dark:text-gray-50">
                    {formatUsdMetric(item.volume24h)}
                  </span>
                  <span>V</span>
                </span>
              </div>
              <ActionButton align="right" Icon={BookmarkIcon} label="Save" />
            </div>
          </div>
        </div>
      )}

      {isGridView ? null : (
        <div className="min-w-0 max-w-full px-4 pb-4 md:hidden">
          <div className="max-w-full overflow-hidden break-all text-[13px] text-gray-600 leading-5 dark:text-gray-300">
            <span className="mr-1 font-semibold text-gray-950 dark:text-gray-50">
              {collaborationLabel || creatorName}
            </span>
            <span className="[-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]">
              {caption ? truncateByWords(caption, 24) : item.name}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
};

export default ZoraPostCard;
