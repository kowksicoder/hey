import {
  FilmIcon,
  LinkIcon,
  MusicalNoteIcon,
  PhotoIcon,
  PlayIcon
} from "@heroicons/react/24/outline";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import cn from "@/helpers/cn";
import { resolveCoinMedia } from "@/helpers/coinMedia";

type PreviewSlide = "chart" | "content" | "image";

const providerLabel: Record<
  NonNullable<ReturnType<typeof resolveCoinMedia>>["provider"],
  string
> = {
  apple_music: "Apple Music",
  external: "Project link",
  spotify: "Spotify",
  youtube: "YouTube"
};

const providerBackgroundClass: Record<
  NonNullable<ReturnType<typeof resolveCoinMedia>>["provider"],
  string
> = {
  apple_music: "from-[#24131c] via-[#fa3657] to-[#4b1633]",
  external: "from-[#10243d] via-[#2563eb] to-[#0f172a]",
  spotify: "from-[#103222] via-[#1db954] to-[#0b1410]",
  youtube: "from-[#2a0c0c] via-[#ef4444] to-[#1a0b0b]"
};

interface CoinDetailSlidesPreviewProps {
  category?: null | string;
  compact?: boolean;
  creatorLabel: string;
  mediaUrl?: null | string;
  previewImage?: null | string;
  ticker: string;
  title: string;
}

const CoinDetailSlidesPreview = ({
  category,
  compact = false,
  creatorLabel,
  mediaUrl,
  previewImage,
  ticker,
  title
}: CoinDetailSlidesPreviewProps) => {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const chartGradientId = useId();
  const media = useMemo(
    () => resolveCoinMedia(mediaUrl, category),
    [category, mediaUrl]
  );
  const tickerLabel = ticker.trim() ? ticker.trim().toUpperCase() : "COIN";
  const previewTitle = title.trim() || `${tickerLabel} coin`;
  const slides = useMemo(() => {
    const nextSlides: PreviewSlide[] = [];

    if (media) {
      nextSlides.push("content");
    }

    if (previewImage) {
      nextSlides.push("image");
    }

    nextSlides.push("chart");
    return nextSlides;
  }, [media, previewImage]);

  useEffect(() => {
    setActiveSlide((current) =>
      Math.min(current, Math.max(slides.length - 1, 0))
    );
  }, [slides.length]);

  useEffect(() => {
    const slider = sliderRef.current;

    if (!slider) {
      return;
    }

    const slide = slider.children.item(activeSlide) as HTMLElement | null;

    slider.scrollTo({
      left: slide?.offsetLeft || 0
    });
  }, [activeSlide, slides.length]);

  const scrollToSlide = (nextIndex: number) => {
    const slider = sliderRef.current;

    if (!slider) {
      setActiveSlide(nextIndex);
      return;
    }

    const slide = slider.children.item(nextIndex) as HTMLElement | null;

    slider.scrollTo({
      behavior: "smooth",
      left: slide?.offsetLeft || 0
    });
    setActiveSlide(nextIndex);
  };

  return (
    <div
      className={cn(
        "rounded-[1.7rem] border border-white/10 bg-black/35 backdrop-blur-xl",
        compact ? "p-3" : "p-4"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-[11px] text-white/58 uppercase tracking-[0.18em]">
            Coin Detail Preview
          </p>
          <p
            className={cn(
              "mt-1 font-semibold text-white",
              compact ? "text-sm" : "text-base"
            )}
          >
            {slides.length} {slides.length === 1 ? "slide" : "slides"}
          </p>
        </div>

        <div className="inline-flex rounded-full bg-white/10 px-3 py-1 font-medium text-[11px] text-white/84">
          {slides.join(" / ")}
        </div>
      </div>

      <div
        className={cn(
          "no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth",
          compact ? "min-h-[12rem]" : "min-h-[15rem]"
        )}
        onScroll={(event) => {
          const target = event.currentTarget;
          const renderedSlides = Array.from(target.children) as HTMLElement[];

          if (!renderedSlides.length) {
            return;
          }

          const nextIndex = renderedSlides.reduce(
            (closestIndex, slide, index) => {
              const closestDistance = Math.abs(
                renderedSlides[closestIndex].offsetLeft - target.scrollLeft
              );
              const nextDistance = Math.abs(
                slide.offsetLeft - target.scrollLeft
              );

              return nextDistance < closestDistance ? index : closestIndex;
            },
            0
          );

          setActiveSlide(nextIndex);
        }}
        ref={sliderRef}
      >
        {slides.map((slide) => {
          if (slide === "content" && media) {
            const isAudio = media.kind === "audio";
            const isVideo = media.kind === "video";

            return (
              <div
                className={cn(
                  "relative w-full shrink-0 snap-center overflow-hidden rounded-[1.2rem] border border-white/10",
                  compact ? "h-[12rem]" : "h-[15rem]"
                )}
                key={slide}
              >
                {media.embedUrl ? (
                  <>
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/68 via-black/26 to-transparent px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[0.95rem] text-white">
                          {media.title}
                        </p>
                        <p className="truncate text-[10px] text-white/72">
                          {creatorLabel}
                        </p>
                      </div>
                      <div className="ml-2 flex shrink-0 items-center gap-1.5">
                        <span className="rounded-full bg-white/92 px-2.5 py-1 font-semibold text-[10px] text-gray-950 shadow-sm">
                          {providerLabel[media.provider]}
                        </span>
                        <span className="rounded-full bg-black/24 px-2.5 py-1 font-medium text-[10px] text-white">
                          Content
                        </span>
                      </div>
                    </div>

                    {media.provider === "youtube" ? (
                      <iframe
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        className="h-full w-full border-0 bg-black"
                        loading="lazy"
                        src={media.embedUrl}
                        title={`${previewTitle} content preview`}
                      />
                    ) : (
                      <iframe
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                        className="h-full w-full border-0 bg-[#121212]"
                        loading="lazy"
                        src={media.embedUrl}
                        title={`${previewTitle} content preview`}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <div
                      className={cn(
                        "absolute inset-0 bg-gradient-to-br",
                        providerBackgroundClass[media.provider]
                      )}
                    />
                    {previewImage ? (
                      <img
                        alt={previewTitle}
                        className="absolute inset-0 h-full w-full object-cover opacity-20"
                        src={previewImage}
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-black/18" />

                    <div className="relative flex h-full flex-col justify-between p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="rounded-full bg-white/90 px-2.5 py-1 font-semibold text-[10px] text-gray-950">
                          {providerLabel[media.provider]}
                        </span>
                        <span className="rounded-full bg-black/22 px-2.5 py-1 font-medium text-[10px] text-white">
                          Content
                        </span>
                      </div>

                      <div>
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/14 text-white backdrop-blur-sm">
                            {isAudio ? (
                              <MusicalNoteIcon className="h-5 w-5" />
                            ) : isVideo ? (
                              <FilmIcon className="h-5 w-5" />
                            ) : (
                              <LinkIcon className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[1.05rem] text-white">
                              {media.title}
                            </p>
                            <p className="truncate text-[11px] text-white/72">
                              {creatorLabel}
                            </p>
                          </div>
                        </div>

                        {isAudio ? (
                          <div className="flex items-end gap-1.5">
                            {Array.from({ length: 12 }, (_, index) => (
                              <span
                                className="w-1.5 rounded-full bg-white/82"
                                key={`bar-${index + 1}`}
                                style={{
                                  height: `${18 + ((index % 5) + 1) * 7}px`
                                }}
                              />
                            ))}
                          </div>
                        ) : isVideo ? (
                          <div className="inline-flex items-center gap-2 rounded-full bg-white/14 px-3 py-2 text-white backdrop-blur-sm">
                            <PlayIcon className="h-4 w-4" />
                            <span className="font-medium text-[11px]">
                              Trailer / video slide
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 rounded-full bg-white/14 px-3 py-2 text-white backdrop-blur-sm">
                            <LinkIcon className="h-4 w-4" />
                            <span className="font-medium text-[11px]">
                              External creator link
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          }

          if (slide === "image" && previewImage) {
            return (
              <div
                className={cn(
                  "relative w-full shrink-0 snap-center overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#0f1116]",
                  compact ? "h-[12rem]" : "h-[15rem]"
                )}
                key={slide}
              >
                <img
                  alt={previewTitle}
                  className="absolute inset-0 h-full w-full object-cover"
                  src={previewImage}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/22 to-transparent" />

                <div className="absolute top-3 left-3 rounded-full bg-white/88 px-2.5 py-1 font-semibold text-[10px] text-gray-950">
                  Image
                </div>

                <div className="absolute right-3 bottom-3 left-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/14 px-3 py-2 text-white backdrop-blur-sm">
                    <PhotoIcon className="h-4 w-4" />
                    <span className="font-medium text-[11px]">Coin image</span>
                  </div>
                  <p className="mt-3 truncate font-semibold text-[1.05rem] text-white">
                    {previewTitle}
                  </p>
                  <p className="truncate text-[11px] text-white/72">
                    {tickerLabel} - creator cover slide
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div
              className={cn(
                "relative w-full shrink-0 snap-center overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#0d1015]",
                compact ? "h-[12rem]" : "h-[15rem]"
              )}
              key={slide}
            >
              <div className="absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_top,_rgba(74,222,128,0.28),_transparent_68%)]" />

              <div className="relative flex h-full flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[1.2rem] text-white">
                      {tickerLabel}
                    </p>
                    <p className="mt-1 text-[11px] text-emerald-300">+12.4%</p>
                  </div>

                  <span className="rounded-full bg-white/10 px-2.5 py-1 font-medium text-[10px] text-white">
                    Chart
                  </span>
                </div>

                <div className="mt-4 flex-1">
                  <svg
                    aria-hidden="true"
                    className="h-full w-full"
                    preserveAspectRatio="none"
                    viewBox="0 0 320 150"
                  >
                    <defs>
                      <linearGradient
                        id={chartGradientId}
                        x1="0%"
                        x2="0%"
                        y1="0%"
                        y2="100%"
                      >
                        <stop offset="0%" stopColor="rgba(74,222,128,0.38)" />
                        <stop offset="100%" stopColor="rgba(74,222,128,0)" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 0 118 C 26 112, 38 102, 60 96 C 86 88, 100 92, 120 74 C 140 56, 160 60, 182 54 C 210 46, 226 30, 246 34 C 266 38, 284 24, 320 18 L 320 150 L 0 150 Z"
                      fill={`url(#${chartGradientId})`}
                    />
                    <path
                      d="M 0 118 C 26 112, 38 102, 60 96 C 86 88, 100 92, 120 74 C 140 56, 160 60, 182 54 C 210 46, 226 30, 246 34 C 266 38, 284 24, 320 18"
                      fill="none"
                      stroke="#4ade80"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="5"
                    />
                    <circle
                      cx="320"
                      cy="18"
                      fill="rgba(74,222,128,0.22)"
                      r="13"
                    />
                    <circle cx="320" cy="18" fill="#4ade80" r="6.5" />
                  </svg>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1.5 font-medium text-[10px] text-white">
                    <span className="text-white/58">Hold</span>
                    <span>0</span>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1.5 font-medium text-[10px] text-white">
                    <span className="text-white/58">Slide</span>
                    <span>Chart</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {slides.length > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {slides.map((slide, index) => (
            <button
              aria-label={`Show ${slide} preview`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                activeSlide === index ? "w-5 bg-white" : "w-1.5 bg-white/24"
              )}
              key={`${slide}-${index + 1}`}
              onClick={() => scrollToSlide(index)}
              type="button"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default CoinDetailSlidesPreview;
