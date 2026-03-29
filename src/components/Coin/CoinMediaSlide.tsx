import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { Image } from "@/components/Shared/UI";
import { resolveCoinMedia } from "@/helpers/coinMedia";

const providerLabel: Record<
  NonNullable<ReturnType<typeof resolveCoinMedia>>["provider"],
  string
> = {
  apple_music: "Apple Music",
  external: "Creator link",
  spotify: "Spotify",
  youtube: "YouTube"
};

interface CoinMediaSlideProps {
  category?: null | string;
  coverImage?: null | string;
  mediaUrl?: null | string;
  title: string;
}

const CoinMediaSlide = ({
  category,
  coverImage,
  mediaUrl,
  title
}: CoinMediaSlideProps) => {
  const media = resolveCoinMedia(mediaUrl, category);

  if (!media) {
    return null;
  }

  if (media.kind === "link") {
    return (
      <div className="relative h-[11.25rem] w-full shrink-0 snap-center overflow-hidden rounded-[1rem] border border-gray-200 bg-white dark:border-white/8 dark:bg-[#0f0f10]">
        {coverImage ? (
          <Image
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
            src={coverImage}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-100 via-white to-gray-50 dark:from-gray-950 dark:via-black dark:to-gray-900" />
        )}
        <div className="absolute inset-0 bg-black/45" />

        <div className="absolute top-2.5 left-2.5 inline-flex rounded-full bg-white/92 px-2.5 py-1 font-medium text-[9px] text-gray-950 shadow-sm backdrop-blur dark:bg-black/72 dark:text-white">
          {providerLabel[media.provider]}
        </div>

        <div className="relative flex h-full items-end p-3">
          <div className="max-w-[16rem] rounded-[0.9rem] bg-white/92 p-2.5 backdrop-blur dark:bg-black/72">
            <p className="font-semibold text-[0.92rem] text-gray-950 dark:text-white">
              {media.title}
            </p>
            <p className="mt-1 text-[10px] text-gray-600 leading-4 dark:text-white/72">
              Open the creator&apos;s imported release, trailer, teaser, or
              project link.
            </p>
            <a
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-gray-950 px-2.5 py-1.5 font-medium text-[10px] text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
              href={media.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ArrowTopRightOnSquareIcon className="size-3.5" />
              {media.ctaLabel}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[11.25rem] w-full shrink-0 snap-center overflow-hidden rounded-[1rem] border border-gray-200 bg-white dark:border-white/8 dark:bg-[#0f0f10]">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 via-black/25 to-transparent px-2.5 py-2">
        <p className="truncate font-medium text-[10px] text-white">
          {media.title}
        </p>
        <span className="rounded-full bg-white/92 px-2 py-1 font-medium text-[8px] text-gray-950 shadow-sm backdrop-blur dark:bg-black/72 dark:text-white">
          {providerLabel[media.provider]}
        </span>
      </div>

      {media.provider === "youtube" ? (
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full border-0"
          loading="lazy"
          src={media.embedUrl}
          title={`${title} media player`}
        />
      ) : (
        <iframe
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          className="h-full w-full border-0"
          loading="lazy"
          src={media.embedUrl}
          title={`${title} media player`}
        />
      )}
    </div>
  );
};

export default CoinMediaSlide;
