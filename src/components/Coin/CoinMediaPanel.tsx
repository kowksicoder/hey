import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { Image } from "@/components/Shared/UI";
import cn from "@/helpers/cn";
import {
  getTemporaryTestCoinMedia,
  resolveCoinMedia
} from "@/helpers/coinMedia";

const providerLabel: Record<
  NonNullable<ReturnType<typeof resolveCoinMedia>>["provider"],
  string
> = {
  apple_music: "Apple Music",
  external: "Creator link",
  spotify: "Spotify",
  youtube: "YouTube"
};

interface CoinMediaPanelProps {
  category?: null | string;
  compact?: boolean;
  coverImage?: null | string;
  fallbackVariant?: "album" | "track";
  mediaUrl?: null | string;
  showTestFallback?: boolean;
  title: string;
}

const CoinMediaPanel = ({
  category,
  compact = false,
  coverImage,
  fallbackVariant = "album",
  mediaUrl,
  showTestFallback = false,
  title
}: CoinMediaPanelProps) => {
  const media =
    resolveCoinMedia(mediaUrl, category) ||
    (showTestFallback ? getTemporaryTestCoinMedia(fallbackVariant) : null);

  if (!media) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-gray-200 bg-white dark:border-gray-800 dark:bg-black">
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-gray-200 border-b dark:border-gray-800",
          compact ? "px-3 py-2.5" : "px-5 py-4"
        )}
      >
        <div className="min-w-0">
          <p
            className={cn(
              "font-semibold text-gray-950 dark:text-gray-50",
              compact ? "text-sm" : "text-base"
            )}
          >
            {media.title}
          </p>
          <p
            className={cn(
              "mt-0.5 text-gray-500 dark:text-gray-400",
              compact ? "text-[11px]" : "text-xs"
            )}
          >
            {providerLabel[media.provider]} content
          </p>
        </div>

        <a
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-950 px-2.5 py-1 font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200",
            compact ? "text-[10px]" : "text-[11px]"
          )}
          href={media.sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          <ArrowTopRightOnSquareIcon className="size-3.5" />
          Open
        </a>
      </div>

      {media.kind === "link" ? (
        <div
          className={cn(
            "relative overflow-hidden",
            compact ? "min-h-[12rem]" : "min-h-[14rem]"
          )}
        >
          {coverImage ? (
            <Image
              alt={title}
              className="absolute inset-0 h-full w-full object-cover"
              src={coverImage}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-gray-100 via-white to-gray-50 dark:from-gray-950 dark:via-black dark:to-gray-900" />
          )}
          <div className="absolute inset-0 bg-black/40 dark:bg-black/55" />

          <div
            className={cn(
              "relative flex h-full flex-col justify-end",
              compact ? "p-3" : "p-5"
            )}
          >
            <div className="max-w-xl rounded-[1.1rem] bg-white/92 p-3 backdrop-blur dark:bg-black/70">
              <p
                className={cn(
                  "font-semibold text-gray-950 dark:text-gray-50",
                  compact ? "text-sm" : "text-base"
                )}
              >
                {media.title}
              </p>
              <p
                className={cn(
                  "mt-1 text-gray-600 dark:text-gray-300",
                  compact ? "text-[11px] leading-4" : "text-sm leading-5"
                )}
              >
                Open the creator's imported release, teaser, trailer, or project
                link.
              </p>

              <a
                className={cn(
                  "mt-3 inline-flex items-center gap-1 rounded-full bg-gray-950 px-3 py-2 font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200",
                  compact ? "text-[11px]" : "text-sm"
                )}
                href={media.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ArrowTopRightOnSquareIcon className="size-4" />
                {media.ctaLabel}
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative">
          {media.embedUrl ? (
            media.provider === "youtube" ? (
              <div className="aspect-video w-full bg-black">
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="h-full w-full border-0"
                  loading="lazy"
                  src={media.embedUrl}
                  title={`${title} media player`}
                />
              </div>
            ) : (
              <iframe
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                className="w-full border-0"
                height={
                  compact
                    ? Math.max((media.embedHeight || 260) - 40, 152)
                    : media.embedHeight || 260
                }
                loading="lazy"
                src={media.embedUrl}
                title={`${title} media player`}
              />
            )
          ) : (
            <div
              className={cn(
                "relative overflow-hidden",
                compact ? "min-h-[12rem]" : "min-h-[16rem]"
              )}
            >
              {coverImage ? (
                <Image
                  alt={title}
                  className="absolute inset-0 h-full w-full object-cover"
                  src={coverImage}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-100 via-white to-gray-50 dark:from-gray-950 dark:via-black dark:to-gray-900" />
              )}
              <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
              <div
                className={cn(
                  "relative flex h-full items-end",
                  compact ? "p-3" : "p-5"
                )}
              >
                <div className="max-w-xl rounded-[1.1rem] bg-white/92 p-3 backdrop-blur dark:bg-black/72">
                  <p
                    className={cn(
                      "font-semibold text-gray-950 dark:text-gray-50",
                      compact ? "text-sm" : "text-base"
                    )}
                  >
                    {media.title}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-gray-600 dark:text-gray-300",
                      compact ? "text-[11px] leading-4" : "text-sm leading-5"
                    )}
                  >
                    Open the creator's imported media from{" "}
                    {providerLabel[media.provider]}.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default CoinMediaPanel;
