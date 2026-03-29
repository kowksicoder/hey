import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild
} from "@headlessui/react";
import {
  ArrowLeftIcon,
  BookmarkIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  HeartIcon,
  PaperAirplaneIcon,
  PlusIcon
} from "@heroicons/react/24/outline";
import {
  Fragment,
  memo,
  type UIEvent,
  useEffect,
  useRef,
  useState
} from "react";
import { useNavigate } from "react-router";
import { Spinner } from "@/components/Shared/UI";
import { DEFAULT_AVATAR } from "@/data/constants";
import cn from "@/helpers/cn";
import {
  formatCompactNairaFromUsd,
  NAIRA_SYMBOL
} from "@/helpers/formatNaira";
import getCoinPath from "@/helpers/getCoinPath";
import nFormatter from "@/helpers/nFormatter";
import truncateByWords from "@/helpers/truncateByWords";
import type { Every1PublicCoinCollaboration } from "@/types/every1";
import ZoraPostCommentsDrawer from "./ZoraPostCommentsDrawer";
import ZoraProfileDrawer from "./ZoraProfileDrawer";
import type { ZoraFeedItem } from "./zoraHomeFeedConfig";

const formatUsdMetric = (value?: null | string) => {
  const number = Number.parseFloat(value ?? "");

  return formatCompactNairaFromUsd(number, 2);
};

const getCreatorName = (item: ZoraFeedItem) => {
  const handle = item.creatorProfile?.handle;

  if (handle?.trim()) {
    return handle.startsWith("@") ? handle : `@${handle}`;
  }

  return "@every1";
};

const getCreatorAvatar = (item: ZoraFeedItem) =>
  item.creatorProfile?.avatar?.previewImage?.medium || DEFAULT_AVATAR;

const getCollaborationLabel = (
  collaboration?: Every1PublicCoinCollaboration | null
) => {
  const names =
    collaboration?.members
      .slice(0, 2)
      .map((member) => member.username || member.displayName || "Collaborator")
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

interface ViewerActionProps {
  count?: number;
  icon: typeof HeartIcon;
  label: string;
  onClick?: () => void;
}

const ViewerAction = ({
  count,
  icon: Icon,
  label,
  onClick
}: ViewerActionProps) => {
  return (
    <button
      className="flex flex-col items-center justify-center"
      onClick={onClick}
      type="button"
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm">
        <Icon className="size-5" />
      </span>
      <span className="mt-1 font-semibold text-[11px] text-white">
        {typeof count === "number" ? nFormatter(count, 1) || "0" : label}
      </span>
    </button>
  );
};

interface ZoraPostMobileViewerProps {
  collaborationByAddress?: Record<string, Every1PublicCoinCollaboration>;
  hasNextPage: boolean;
  initialIndex: number;
  isFetchingMore: boolean;
  items: ZoraFeedItem[];
  onClose: () => void;
  onRequestMore: () => void;
  variant?: "embedded" | "modal";
}

const ZoraPostMobileViewer = ({
  collaborationByAddress = {},
  hasNextPage,
  initialIndex,
  isFetchingMore,
  items,
  onClose,
  onRequestMore,
  variant = "modal"
}: ZoraPostMobileViewerProps) => {
  const navigate = useNavigate();
  const show = items.length > 0;
  const isEmbedded = variant === "embedded";
  const [commentDrawerItem, setCommentDrawerItem] =
    useState<ZoraFeedItem | null>(null);
  const [profileDrawerItem, setProfileDrawerItem] =
    useState<ZoraFeedItem | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!show || isEmbedded) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isEmbedded, show]);

  useEffect(() => {
    if (!show) {
      setCommentDrawerItem(null);
      setProfileDrawerItem(null);
    }
  }, [show]);

  useEffect(() => {
    if (!show) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const targetSlide = slideRefs.current[initialIndex];
      targetSlide?.scrollIntoView({ block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [initialIndex, show]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    const remainingDistance =
      node.scrollHeight - node.scrollTop - node.clientHeight;

    if (
      remainingDistance < node.clientHeight * 1.25 &&
      hasNextPage &&
      !isFetchingMore
    ) {
      onRequestMore();
    }
  };

  const scroller = (
    <>
      <button
        className={cn(
          "absolute left-4 z-30 inline-flex size-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm",
          isEmbedded
            ? "top-[max(env(safe-area-inset-top),1rem)]"
            : "top-[max(env(safe-area-inset-top),1rem)]"
        )}
        onClick={onClose}
        type="button"
      >
        <ArrowLeftIcon className="size-4" />
      </button>

      <div
        className={cn(
          "snap-y snap-mandatory overflow-y-auto overscroll-y-contain",
          isEmbedded ? "h-[100dvh]" : "h-full"
        )}
        onScroll={handleScroll}
        ref={containerRef}
      >
        {items.map((item, index) => {
          const collaboration =
            collaborationByAddress[item.address.toLowerCase()];
          const creatorName = getCreatorName(item);
          const collaborationLabel = getCollaborationLabel(collaboration);
          const previewImage = getPreviewImage(item);
          const videoSource =
            item.mediaContent?.videoHlsUrl ||
            item.mediaContent?.videoPreviewUrl;
          const hasVideo = Boolean(
            item.mediaContent?.mimeType?.startsWith("video/") && videoSource
          );
          const { commentCount, likeCount, shareCount } = getActionCounts(item);
          const caption = item.description?.trim();
          const slideIsPositive =
            Number.parseFloat(item.marketCapDelta24h ?? "0") >= 0;
          const coinPath = getCoinPath(item.address);

          return (
            <div
              className={cn(
                "relative w-full snap-start overflow-hidden bg-black",
                "h-[100dvh]"
              )}
              key={item.id}
              ref={(node) => {
                slideRefs.current[index] = node;
              }}
            >
              {previewImage ? (
                <div className="absolute inset-0">
                  {hasVideo ? (
                    <video
                      autoPlay
                      className="h-full w-full object-cover"
                      loop
                      muted
                      playsInline
                      poster={previewImage}
                      src={videoSource || undefined}
                    />
                  ) : (
                    <img
                      alt={item.name}
                      className="h-full w-full object-cover"
                      src={previewImage}
                    />
                  )}
                </div>
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_35%),linear-gradient(180deg,_#101010_0%,_#050505_100%)]" />
              )}

              <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/80" />

              <div
                className={cn(
                  "absolute top-0 right-0 left-0 z-10 flex justify-center px-4",
                  isEmbedded
                    ? "pt-[max(env(safe-area-inset-top),1rem)]"
                    : "pt-[max(env(safe-area-inset-top),1rem)]"
                )}
              >
                <div className="flex items-center gap-2 rounded-full px-2 py-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-3 py-1 font-semibold text-[11px] ring-1",
                      slideIsPositive
                        ? "bg-emerald-500/20 text-emerald-100 ring-emerald-300/40"
                        : "bg-rose-500/20 text-rose-100 ring-rose-300/40"
                    )}
                  >
                    MC {formatUsdMetric(item.marketCap)}
                  </span>
                  <button
                    className="inline-flex items-center rounded-full bg-white px-3 py-1 font-semibold text-[11px] text-gray-950"
                    onClick={() => {
                      if (!coinPath) {
                        return;
                      }

                      navigate(coinPath);
                    }}
                    type="button"
                  >
                    Trade
                  </button>
                </div>
              </div>

              <div className="absolute right-0 bottom-0 left-0 z-10 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
                <div className="relative min-h-[15rem]">
                  <div className="absolute right-0 bottom-0 left-0 pr-20">
                    <p className="font-semibold text-[15px]">
                      {item.symbol
                        ? `${NAIRA_SYMBOL}${item.symbol}`
                        : item.name}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[13px] text-white/80">
                      <p className="truncate">
                        {collaborationLabel || creatorName}
                      </p>
                      {collaboration ? (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-sky-500/16 px-2 py-0.5 font-semibold text-[9px] text-sky-100 ring-1 ring-sky-300/30">
                          Collab
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-3 max-w-full overflow-hidden break-words text-[14px] text-white/90 leading-6 [-webkit-box-orient:vertical] [-webkit-line-clamp:4] [display:-webkit-box] [overflow-wrap:anywhere]">
                      {caption ? truncateByWords(caption, 34) : item.name}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full bg-black/30 px-3 py-1 font-semibold text-[11px] text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                        H {nFormatter(item.uniqueHolders ?? 0, 1) || "0"}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-black/30 px-3 py-1 font-semibold text-[11px] text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                        V {formatUsdMetric(item.volume24h)}
                      </span>
                    </div>
                  </div>

                  <div className="absolute top-0 right-2 flex w-14 shrink-0 -translate-y-2 flex-col items-center gap-3.5">
                    <div className="relative">
                      <button
                        className="block"
                        onClick={() => setProfileDrawerItem(item)}
                        type="button"
                      >
                        {collaboration && collaboration.members.length > 1 ? (
                          <div className="relative h-12 w-14">
                            {collaboration.members
                              .slice(0, 2)
                              .map((member, memberIndex) => (
                                <img
                                  alt={
                                    member.username ||
                                    member.displayName ||
                                    `Collaborator ${memberIndex + 1}`
                                  }
                                  className={cn(
                                    "absolute top-0 size-12 rounded-full border-2 border-white/80 object-cover",
                                    memberIndex === 0
                                      ? "left-0 z-10"
                                      : "right-0 z-20"
                                  )}
                                  key={member.profileId}
                                  src={member.avatarUrl || DEFAULT_AVATAR}
                                />
                              ))}
                          </div>
                        ) : (
                          <img
                            alt={creatorName}
                            className="size-12 rounded-full border-2 border-white/80 object-cover"
                            src={getCreatorAvatar(item)}
                          />
                        )}
                      </button>
                      <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-rose-500 text-white">
                        <PlusIcon className="size-3" />
                      </span>
                    </div>

                    <ViewerAction
                      count={likeCount}
                      icon={HeartIcon}
                      label="Like"
                    />
                    <ViewerAction
                      count={commentCount}
                      icon={ChatBubbleOvalLeftEllipsisIcon}
                      label="Comment"
                      onClick={() => setCommentDrawerItem(item)}
                    />
                    <ViewerAction
                      count={shareCount}
                      icon={PaperAirplaneIcon}
                      label="Share"
                    />
                    <ViewerAction icon={BookmarkIcon} label="Save" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {isFetchingMore ? (
          <div className="flex h-24 snap-start items-center justify-center bg-black/90">
            <Spinner className="text-white" size="sm" />
          </div>
        ) : null}
      </div>

      <ZoraPostCommentsDrawer
        item={commentDrawerItem}
        onClose={() => setCommentDrawerItem(null)}
        show={Boolean(commentDrawerItem)}
      />
      <ZoraProfileDrawer
        item={profileDrawerItem}
        onClose={() => setProfileDrawerItem(null)}
        show={Boolean(profileDrawerItem)}
      />
    </>
  );

  if (isEmbedded) {
    return (
      <div className="overflow-hidden bg-black text-white md:hidden">
        {scroller}
      </div>
    );
  }

  return (
    <Transition as={Fragment} show={show}>
      <Dialog
        as="div"
        className="relative z-[70] md:hidden"
        onClose={onClose}
        open={show}
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
          <div className="fixed inset-0 bg-black/95" />
        </TransitionChild>

        <div className="fixed inset-0 md:hidden">
          <DialogPanel className="relative h-full w-full overflow-hidden bg-black text-white">
            {scroller}
          </DialogPanel>
        </div>
      </Dialog>
    </Transition>
  );
};

export default memo(ZoraPostMobileViewer);
