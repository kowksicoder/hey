import {
  ArrowRightIcon,
  Bars3Icon,
  ChatBubbleBottomCenterTextIcon,
  CurrencyDollarIcon,
  InformationCircleIcon,
  MoonIcon,
  QuestionMarkCircleIcon,
  SunIcon,
  XMarkIcon
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import evLogo from "@/assets/fonts/evlogo.jpg";
import { Image } from "@/components/Shared/UI";
import { convertUsdToNgn } from "@/helpers/formatNaira";
import { getAppUrl, shouldServeMarketingLanding } from "@/helpers/hosts";
import nFormatter from "@/helpers/nFormatter";
import {
  fetchPlatformDiscoverCoins,
  type PlatformDiscoverCoin
} from "@/helpers/platformDiscovery";
import { useTheme } from "@/hooks/useTheme";

type MarketingPage = "about" | "contact" | "faq" | "home" | "pricing";

type ShowcaseTile = {
  fallbackHandle: string;
  fallbackName: string;
  featured?: boolean;
  stockImage: string;
};

type LandingTileDisplayVariant = "compact" | "wide";

type MarketingCard = {
  body: string;
  icon: typeof InformationCircleIcon;
  title: string;
};

const navigation: Array<{
  label: string;
  page: Exclude<MarketingPage, "home">;
}> = [
  { label: "About", page: "about" },
  { label: "FAQ", page: "faq" },
  { label: "Pricing", page: "pricing" },
  { label: "Contact", page: "contact" }
];

const floatingPillPositions = [
  {
    className: "top-6 left-[7%] hidden sm:flex lg:left-[9%]",
    delay: "0s"
  },
  {
    className: "top-12 right-[8%] hidden sm:flex lg:right-[11%]",
    delay: "0.35s"
  },
  {
    className: "bottom-10 left-[11%] hidden md:flex lg:left-[16%]",
    delay: "0.7s"
  },
  {
    className: "bottom-12 right-[12%] hidden md:flex lg:right-[17%]",
    delay: "1.05s"
  }
] as const;

const showcaseTiles: ShowcaseTile[] = [
  {
    fallbackHandle: "\u20A6mist",
    fallbackName: "Mist",
    stockImage:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80"
  },
  {
    fallbackHandle: "\u20A6camp",
    fallbackName: "Camp",
    stockImage:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80"
  },
  {
    fallbackHandle: "\u20A6tide",
    fallbackName: "Blue Tide",
    stockImage:
      "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80"
  },
  {
    fallbackHandle: "\u20A6pulse",
    fallbackName: "Pulse",
    featured: true,
    stockImage:
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=80"
  },
  {
    fallbackHandle: "\u20A6terrain",
    fallbackName: "Terrain",
    stockImage:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80"
  },
  {
    fallbackHandle: "\u20A6orbit",
    fallbackName: "Orbit",
    stockImage:
      "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=900&q=80"
  },
  {
    fallbackHandle: "\u20A6studio",
    fallbackName: "Studio",
    stockImage:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80"
  },
  {
    fallbackHandle: "\u20A6echo",
    fallbackName: "Echo",
    stockImage:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80"
  }
];

const marketingPageContent: Record<
  Exclude<MarketingPage, "home">,
  {
    cards: MarketingCard[];
    eyebrow: string;
    title: string;
  }
> = {
  about: {
    cards: [
      {
        body: "Support creators with a Naira-first flow that feels simple and local.",
        icon: InformationCircleIcon,
        title: "Built for support"
      },
      {
        body: "Discover coins, back moments early, and stay close to creators you care about.",
        icon: ChatBubbleBottomCenterTextIcon,
        title: "Made for fans"
      },
      {
        body: "Base powers the rails underneath, while Every1 keeps the experience cleaner.",
        icon: CurrencyDollarIcon,
        title: "Simple on the surface"
      }
    ],
    eyebrow: "About",
    title: "Support creators in a way that feels local, fast, and clear."
  },
  contact: {
    cards: [
      {
        body: "Open support in the app if you need help with wallets, trading, or rewards.",
        icon: ChatBubbleBottomCenterTextIcon,
        title: "App support"
      },
      {
        body: "Start with the FAQ if you just need a quick answer without the back and forth.",
        icon: QuestionMarkCircleIcon,
        title: "Quick help"
      },
      {
        body: "Need to move fast? Jump into the app and reach the team from there.",
        icon: InformationCircleIcon,
        title: "Reach the team"
      }
    ],
    eyebrow: "Contact",
    title: "Need help? We kept the path short."
  },
  faq: {
    cards: [
      {
        body: "Every1 lets you support creator coins in a Naira-first experience.",
        icon: QuestionMarkCircleIcon,
        title: "What is Every1?"
      },
      {
        body: "Creator coins live on Base, but the product is designed to feel simpler than that.",
        icon: InformationCircleIcon,
        title: "Why Base underneath?"
      },
      {
        body: "You can open the app, fund your wallet, support creators, and track what you earn.",
        icon: CurrencyDollarIcon,
        title: "What can I do here?"
      }
    ],
    eyebrow: "FAQ",
    title: "Short answers, less noise."
  },
  pricing: {
    cards: [
      {
        body: "Free to explore creators, coins, and drops.",
        icon: CurrencyDollarIcon,
        title: "Join free"
      },
      {
        body: "Costs show up before confirmation, so nothing feels hidden or confusing.",
        icon: InformationCircleIcon,
        title: "Clear before you act"
      },
      {
        body: "Creators and fans move through the same clean wallet and support flow.",
        icon: ChatBubbleBottomCenterTextIcon,
        title: "One simple product"
      }
    ],
    eyebrow: "Pricing",
    title: "Simple pricing, less guesswork."
  }
};

const getCoinHandle = (
  coin: PlatformDiscoverCoin | undefined,
  fallbackHandle: string
) => {
  const handle = coin?.creatorProfile?.handle?.trim();

  if (handle) {
    return `\u20A6${handle.replace(/^[@\u20A6]/, "")}`;
  }

  if (coin?.symbol) {
    return `\u20A6${coin.symbol.toLowerCase()}`;
  }

  return fallbackHandle;
};

const getCoinTicker = (
  coin: PlatformDiscoverCoin | undefined,
  fallbackHandle: string
) => {
  if (coin?.symbol?.trim()) {
    return `\u20A6${coin.symbol.trim().toUpperCase()}`;
  }

  return fallbackHandle;
};

const getCoinPriceLabel = (coin?: PlatformDiscoverCoin) => {
  const usdPrice = Number.parseFloat(coin?.tokenPrice?.priceInUsdc ?? "");

  if (!Number.isFinite(usdPrice) || usdPrice <= 0) {
    return null;
  }

  const ngnPrice = convertUsdToNgn(usdPrice);

  return `\u20A6${nFormatter(ngnPrice, ngnPrice >= 1_000 ? 1 : 2).replace("k", "K")}`;
};

const getCoinSlideImage = (coin?: PlatformDiscoverCoin) =>
  coin?.coverImageUrl ||
  coin?.mediaContent?.previewImage?.medium ||
  coin?.mediaContent?.previewImage?.small ||
  coin?.creatorProfile?.avatar?.previewImage?.medium ||
  coin?.creatorProfile?.avatar?.previewImage?.small ||
  undefined;

const getMarketingPath = (page: MarketingPage) => {
  const previewBase = shouldServeMarketingLanding() ? "" : "/landing-preview";

  if (page === "home") {
    return previewBase || "/";
  }

  return `${previewBase}/${page}`;
};

const MarketingInfoPage = ({
  appSupportUrl,
  ctaHref,
  ctaLabel,
  page
}: {
  appSupportUrl: string;
  ctaHref: string;
  ctaLabel: string;
  page: Exclude<MarketingPage, "home">;
}) => {
  const content = marketingPageContent[page];

  return (
    <main className="flex flex-1 items-center justify-center py-10 sm:py-14">
      <div className="w-full max-w-[980px]">
        <div className="mx-auto max-w-[720px] text-center">
          <p className="mb-4 inline-flex items-center rounded-full border border-black/8 bg-white/78 px-3 py-1 font-semibold text-[#111111]/68 text-[9px] uppercase tracking-[0.22em] shadow-[0_12px_36px_rgba(17,17,17,0.05)] backdrop-blur dark:border-white/10 dark:bg-[#050505] dark:text-white/70 dark:shadow-none">
            {content.eyebrow}
          </p>
          <h1 className="text-balance font-semibold text-[clamp(2.15rem,5vw,4.2rem)] leading-[0.95] tracking-[-0.08em]">
            {content.title}
          </h1>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {content.cards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                className="rounded-[28px] border border-black/8 bg-white/88 p-5 text-left shadow-[0_18px_40px_rgba(17,17,17,0.06)] backdrop-blur-sm dark:border-white/10 dark:bg-[#060606]/96 dark:shadow-none"
                key={card.title}
              >
                <div className="mb-4 inline-flex rounded-full border border-black/8 bg-black/[0.03] p-2.5 dark:border-white/10 dark:bg-[#101010]">
                  <Icon className="size-5" />
                </div>
                <h2 className="font-semibold text-[1.05rem] tracking-[-0.04em]">
                  {card.title}
                </h2>
                <p className="mt-2 text-[#111111]/68 text-sm leading-6 dark:text-white/68">
                  {card.body}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#111111] px-6 py-3 font-semibold text-sm text-white shadow-[0_22px_48px_rgba(17,17,17,0.16)] transition hover:-translate-y-0.5 dark:bg-white dark:text-[#111111] dark:shadow-none"
            href={ctaHref}
          >
            {ctaLabel}
            <ArrowRightIcon className="size-4" />
          </a>
          <a
            className="inline-flex items-center justify-center rounded-full border border-black/8 bg-white/80 px-6 py-3 font-semibold text-[#111111] text-sm shadow-[0_18px_36px_rgba(17,17,17,0.06)] transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-[#050505] dark:text-white dark:shadow-none"
            href={appSupportUrl}
          >
            Open support
          </a>
        </div>
      </div>
    </main>
  );
};

const LandingTile = ({
  coin,
  fallbackHandle,
  fallbackName,
  featured = false,
  href,
  stockImage,
  variant = "wide"
}: ShowcaseTile & {
  coin?: PlatformDiscoverCoin;
  href: string;
  variant?: LandingTileDisplayVariant;
}) => {
  const coverImage = getCoinSlideImage(coin) || stockImage;
  const coinName = coin?.name || fallbackName;
  const coinHandle = getCoinHandle(coin, fallbackHandle);
  const coinTicker = getCoinTicker(coin, fallbackHandle);
  const coinPrice = getCoinPriceLabel(coin);

  if (variant === "compact") {
    return (
      <a
        aria-label={`Open ${coinName} coin`}
        className="group relative block h-[96px] w-[96px] shrink-0 overflow-hidden rounded-[30px] border border-black/6 bg-white shadow-[0_10px_24px_rgba(17,17,17,0.06)] transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_14px_30px_rgba(17,17,17,0.08)] focus-visible:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]/20 sm:h-[112px] sm:w-[112px] dark:border-white/8 dark:bg-[#060606] dark:shadow-none dark:focus-visible:ring-white/20 dark:hover:shadow-none"
        href={href}
      >
        <Image
          alt={coinName}
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]"
          src={coverImage}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,17,17,0.02),rgba(17,17,17,0.3))]" />
        <div className="absolute right-3 bottom-3 left-3">
          <span className="inline-flex rounded-full bg-black/66 px-2 py-1 font-semibold text-[9px] text-white uppercase tracking-[0.14em] backdrop-blur-sm">
            {coinTicker}
          </span>
        </div>
      </a>
    );
  }

  return (
    <a
      aria-label={`Open ${coinName} coin`}
      className="group relative flex h-[96px] w-[284px] shrink-0 items-center gap-4 rounded-[30px] border border-black/6 bg-white/90 px-4 py-3 text-left shadow-[0_10px_24px_rgba(17,17,17,0.06)] transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_14px_30px_rgba(17,17,17,0.08)] focus-visible:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]/20 sm:h-[112px] sm:w-[332px] sm:px-5 dark:border-white/8 dark:bg-[#060606]/96 dark:shadow-none dark:focus-visible:ring-white/20 dark:hover:shadow-none"
      href={href}
    >
      <div className="relative size-14 shrink-0 overflow-hidden rounded-[18px] border border-black/8 bg-[#f4f4f2] sm:size-16 dark:border-white/10 dark:bg-[#101010]">
        <Image
          alt={coinName}
          className="h-full w-full object-cover"
          src={coverImage}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-[1rem] tracking-[-0.05em] sm:text-[1.08rem]">
            {coinName}
          </p>
          {featured ? (
            <span className="inline-flex rounded-full bg-[#111111] px-2 py-0.5 font-semibold text-[9px] text-white uppercase tracking-[0.12em] dark:bg-white dark:text-[#111111]">
              Hot
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-[#111111]/62 text-sm leading-5 dark:text-white/62">
          {coinHandle}
          {coinPrice ? ` • ${coinPrice}` : ""}
        </p>
      </div>
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#ffe44e] text-[#111111]">
        <ArrowRightIcon className="size-4.5" />
      </span>
    </a>
  );
};

const Landing = ({ page = "home" }: { page?: MarketingPage }) => {
  const appUrl = getAppUrl("/");
  const appSupportUrl = getAppUrl("/support");
  const faqUrl = getMarketingPath("faq");
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { data: featuredCoins = [] } = useQuery({
    enabled: page === "home",
    queryFn: async () =>
      fetchPlatformDiscoverCoins({ limit: showcaseTiles.length, offset: 0 }),
    queryKey: ["landing-featured-coins"],
    staleTime: 60_000
  });

  const liveShowcaseTiles = useMemo(
    () =>
      showcaseTiles.map((tile, index) => ({
        ...tile,
        coin: featuredCoins[index],
        href: featuredCoins[index]
          ? getAppUrl(`coins/${featuredCoins[index].address}`)
          : appUrl,
        tileKey: `${tile.fallbackName}-${index}`
      })),
    [appUrl, featuredCoins]
  );

  const topRowTiles = useMemo(
    () =>
      liveShowcaseTiles.map((tile, index) => ({
        ...tile,
        variant: index % 3 === 2 ? ("compact" as const) : ("wide" as const)
      })),
    [liveShowcaseTiles]
  );
  const bottomRowTiles = useMemo(
    () =>
      [...liveShowcaseTiles.slice(3), ...liveShowcaseTiles.slice(0, 3)].map(
        (tile, index) => ({
          ...tile,
          variant: index % 3 === 1 ? ("compact" as const) : ("wide" as const)
        })
      ),
    [liveShowcaseTiles]
  );

  const floatingPills = useMemo(
    () =>
      liveShowcaseTiles
        .map((tile) => {
          const price = getCoinPriceLabel(tile.coin);

          if (!tile.coin || !price) {
            return null;
          }

          return {
            price,
            ticker: getCoinTicker(tile.coin, tile.fallbackHandle)
          };
        })
        .filter((value): value is { price: string; ticker: string } =>
          Boolean(value)
        )
        .slice(0, floatingPillPositions.length),
    [liveShowcaseTiles]
  );

  return (
    <div className="min-h-screen overflow-hidden bg-white text-[#111111] dark:bg-black dark:text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,1),rgba(255,255,255,0.98)_38%,rgba(248,250,252,0.94)_100%)] dark:bg-[radial-gradient(circle_at_top,rgba(34,34,34,0.64),rgba(8,8,8,0.94)_38%,rgba(0,0,0,1)_100%)]" />
        <div className="absolute top-0 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-white/72 blur-3xl dark:bg-white/4" />
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,rgba(17,17,17,0.08)_1px,transparent_0)] [background-size:24px_24px] dark:opacity-10 dark:[background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_0)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1380px] flex-col px-4 pt-3 pb-6 sm:px-6 sm:pb-8 lg:px-8">
        <header className="relative flex items-center justify-between gap-4 px-1 py-3 sm:px-2">
          <a className="flex items-center gap-3" href={appUrl}>
            <img
              alt="Every1"
              className="size-10 rounded-[16px] object-cover shadow-[0_10px_24px_rgba(17,17,17,0.08)]"
              src={evLogo}
            />
            <span className="font-semibold text-lg tracking-[-0.04em]">
              Every1
            </span>
          </a>

          <nav className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-5 font-medium text-[#111111]/78 text-sm lg:flex dark:text-white/78">
            {navigation.map((item) => (
              <a
                className={`transition hover:text-[#111111] dark:hover:text-white ${page === item.page ? "text-[#111111] dark:text-white" : ""}`}
                href={getMarketingPath(item.page)}
                key={item.page}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              aria-expanded={isMobileMenuOpen}
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              className="rounded-full border border-black/8 bg-white/92 p-2 text-[#111111] shadow-[0_10px_24px_rgba(17,17,17,0.05)] transition hover:-translate-y-0.5 lg:hidden dark:border-white/10 dark:bg-[#050505] dark:text-white dark:shadow-none"
              onClick={() => setIsMobileMenuOpen((current) => !current)}
              type="button"
            >
              {isMobileMenuOpen ? (
                <XMarkIcon className="size-5" />
              ) : (
                <Bars3Icon className="size-5" />
              )}
            </button>
            <button
              aria-label={
                theme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
              className="hidden rounded-full border border-black/8 bg-white/92 p-2 text-[#111111] shadow-[0_10px_24px_rgba(17,17,17,0.05)] transition hover:-translate-y-0.5 lg:inline-flex dark:border-white/10 dark:bg-[#050505] dark:text-white dark:shadow-none"
              onClick={toggleTheme}
              type="button"
            >
              {theme === "light" ? (
                <MoonIcon className="size-5" />
              ) : (
                <SunIcon className="size-5" />
              )}
            </button>
          </div>

          {isMobileMenuOpen ? (
            <div className="absolute top-full right-0 z-30 mt-3 w-[220px] overflow-hidden rounded-[28px] border border-black/8 bg-white/96 p-2 shadow-[0_20px_48px_rgba(17,17,17,0.08)] backdrop-blur-sm lg:hidden dark:border-white/10 dark:bg-[#050505]/98 dark:shadow-none">
              <nav className="flex flex-col">
                {navigation.map((item) => (
                  <a
                    className={`rounded-[20px] px-4 py-3 font-medium text-[0.96rem] tracking-[-0.03em] transition hover:bg-black/[0.04] dark:hover:bg-white/8 ${page === item.page ? "text-[#111111] dark:text-white" : "text-[#111111]/74 dark:text-white/74"}`}
                    href={getMarketingPath(item.page)}
                    key={item.page}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
                <button
                  className="mt-1 flex items-center justify-between rounded-[20px] px-4 py-3 font-medium text-[#111111] text-[0.96rem] tracking-[-0.03em] transition hover:bg-black/[0.04] dark:text-white dark:hover:bg-white/8"
                  onClick={() => {
                    toggleTheme();
                    setIsMobileMenuOpen(false);
                  }}
                  type="button"
                >
                  <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
                  {theme === "light" ? (
                    <MoonIcon className="size-4.5" />
                  ) : (
                    <SunIcon className="size-4.5" />
                  )}
                </button>
              </nav>
            </div>
          ) : null}
        </header>

        {page === "home" ? (
          <main className="flex flex-1 flex-col items-center justify-center pt-8 pb-4 text-center sm:pt-10 lg:pt-10 lg:pb-6">
            <p className="mb-3 inline-flex items-center rounded-full border border-black/8 bg-white/76 px-3 py-1 font-semibold text-[#111111]/68 text-[9px] uppercase tracking-[0.22em] shadow-[0_12px_36px_rgba(17,17,17,0.05)] backdrop-blur dark:border-white/10 dark:bg-[#050505] dark:text-white/70 dark:shadow-none">
              Naira-first on Base
            </p>

            <h1 className="max-w-[920px] text-balance font-semibold text-[clamp(2.05rem,5.1vw,4.35rem)] leading-[0.94] tracking-[-0.08em]">
              Support your favourite creators 🎨, earn daily 💸!
            </h1>

            <div className="relative mt-7 w-full max-w-[1180px] overflow-hidden py-10 sm:mt-8 sm:py-12">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white via-white/92 to-transparent dark:from-black dark:via-black/92" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white via-white/92 to-transparent dark:from-black dark:via-black/92" />
              <div className="absolute inset-x-[16%] top-[71%] h-18 rounded-full bg-black/10 blur-3xl dark:bg-black/30" />

              {floatingPills.map((pill, index) => (
                <div
                  className={`landing-pill-float pointer-events-none absolute z-20 items-center gap-2 rounded-full bg-[#050505] px-2.5 py-1.5 text-white shadow-[0_18px_40px_rgba(17,17,17,0.16)] dark:bg-black ${floatingPillPositions[index]?.className ?? "hidden"}`}
                  key={`${pill.ticker}-${index}`}
                  style={{
                    animationDelay: floatingPillPositions[index]?.delay
                  }}
                >
                  <span className="grid size-6 place-items-center rounded-full bg-white font-semibold text-[#050505] text-[8px] uppercase tracking-[-0.04em]">
                    {pill.ticker.replace("\u20A6", "").slice(0, 2)}
                  </span>
                  <span className="font-medium text-[11px] tracking-[-0.03em] sm:text-xs">
                    {pill.ticker} • {pill.price}
                  </span>
                </div>
              ))}

              <div className="space-y-4">
                <div className="landing-marquee-left flex w-max items-center gap-4">
                  {[...topRowTiles, ...topRowTiles].map((tile, index) => (
                    <LandingTile
                      key={`top-${tile.tileKey}-${index}`}
                      {...tile}
                    />
                  ))}
                </div>
                <div className="landing-marquee-right flex w-max items-center gap-4 pl-8 sm:pl-12">
                  {[...bottomRowTiles, ...bottomRowTiles].map((tile, index) => (
                    <LandingTile
                      key={`bottom-${tile.tileKey}-${index}`}
                      {...tile}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 max-w-[720px] space-y-5 sm:mt-5">
              <p className="mx-auto max-w-[640px] text-[#111111]/70 text-base leading-7 sm:text-lg dark:text-white/72">
                Back creators you love, discover new coins early, and keep the
                whole experience simple in Naira.
              </p>

              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#111111] px-7 py-3.5 font-semibold text-sm text-white shadow-[0_22px_48px_rgba(17,17,17,0.16)] transition hover:-translate-y-0.5 dark:bg-white dark:text-[#111111] dark:shadow-none"
                  href={appUrl}
                >
                  Open Every1
                  <ArrowRightIcon className="size-4" />
                </a>
                <a
                  className="inline-flex items-center justify-center rounded-full border border-black/8 bg-white/78 px-7 py-3.5 font-semibold text-[#111111] text-sm shadow-[0_18px_36px_rgba(17,17,17,0.06)] transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-[#050505] dark:text-white dark:shadow-none"
                  href={faqUrl}
                >
                  Read FAQ
                </a>
              </div>
            </div>
          </main>
        ) : (
          <MarketingInfoPage
            appSupportUrl={appSupportUrl}
            ctaHref={page === "contact" ? appSupportUrl : appUrl}
            ctaLabel={page === "contact" ? "Open support" : "Open Every1"}
            page={page}
          />
        )}
      </div>
    </div>
  );
};

export default Landing;
