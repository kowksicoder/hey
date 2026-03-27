import { useApolloClient } from "@apollo/client";
import {
  BellIcon as BellOutline,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  PlusCircleIcon as CreateOutline,
  StarIcon as CreatorsOutline,
  EllipsisHorizontalCircleIcon,
  FireIcon as FanDropOutline,
  TrophyIcon as LeaderboardOutline,
  MoonIcon,
  GiftIcon as ReferralsOutline,
  ShieldCheckIcon as StaffOutline,
  SunIcon,
  ArrowsRightLeftIcon as SwapOutline,
  UserGroupIcon as UserGroupOutline
} from "@heroicons/react/24/outline";
import {
  BellIcon as BellSolid,
  PlusCircleIcon as CreateSolid,
  StarIcon as CreatorsSolid,
  FireIcon as FanDropSolid,
  TrophyIcon as LeaderboardSolid,
  GiftIcon as ReferralsSolid,
  ShieldCheckIcon as StaffSolid,
  ArrowsRightLeftIcon as SwapSolid,
  UserGroupIcon as UserGroupSolid
} from "@heroicons/react/24/solid";
import { useQueryClient } from "@tanstack/react-query";
import {
  type MouseEvent,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { Link, useLocation } from "react-router";
import evLogo from "@/assets/fonts/evlogo.jpg";
import { ZORA_HOME_FEED_QUERY_KEY } from "@/components/Home/zoraHomeFeedConfig";
import {
  CompassExploreOutlineIcon,
  CompassExploreSolidIcon
} from "@/components/Shared/Icons/CompassExploreIcon";
import LoginButton from "@/components/Shared/LoginButton";
import Logout from "@/components/Shared/Navbar/NavItems/Logout";
import SignupButton from "@/components/Shared/Navbar/SignupButton";
import { Image, Spinner, Tooltip } from "@/components/Shared/UI";
import getAccount from "@/helpers//getAccount";
import getAvatar from "@/helpers//getAvatar";
import cn from "@/helpers/cn";
import {
  getDesktopSidebarCollapsed,
  persistDesktopSidebarCollapsed
} from "@/helpers/desktopSidebar";
import useEvery1MobileNavBadgeCounts from "@/hooks/useEvery1MobileNavBadgeCounts";
import useHasNewNotifications from "@/hooks/useHasNewNotifications";
import useOpenAuth from "@/hooks/useOpenAuth";
import { useTheme } from "@/hooks/useTheme";
import {
  type AccountFragment,
  GroupsDocument,
  NotificationIndicatorDocument,
  NotificationsDocument
} from "@/indexer/generated";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import useStaffAdminStore from "@/store/persisted/useStaffAdminStore";

const navigationItems = {
  "/": {
    outline: <CompassExploreOutlineIcon className="size-5" />,
    solid: <CompassExploreSolidIcon className="size-5" />,
    title: "Explore"
  },
  "/create": {
    outline: <CreateOutline className="size-5" />,
    solid: <CreateSolid className="size-5" />,
    title: "Create"
  },
  "/creators": {
    outline: <CreatorsOutline className="size-5" />,
    solid: <CreatorsSolid className="size-5" />,
    title: "Creators"
  },
  "/fandrop": {
    outline: <FanDropOutline className="size-5" />,
    solid: <FanDropSolid className="size-5" />,
    title: "FanDrop"
  },
  "/groups": {
    outline: <UserGroupOutline className="size-5" />,
    refreshDocs: [GroupsDocument],
    solid: <UserGroupSolid className="size-5" />,
    title: "Groups"
  },
  "/leaderboard": {
    outline: <LeaderboardOutline className="size-5" />,
    solid: <LeaderboardSolid className="size-5" />,
    title: "Leaderboard"
  },
  "/notifications": {
    outline: <BellOutline className="size-5" />,
    refreshDocs: [NotificationsDocument, NotificationIndicatorDocument],
    solid: <BellSolid className="size-5" />,
    title: "Notifications"
  },
  "/referrals": {
    outline: <ReferralsOutline className="size-5" />,
    solid: <ReferralsSolid className="size-5" />,
    title: "Referrals"
  },
  "/staff": {
    outline: <StaffOutline className="size-5" />,
    solid: <StaffSolid className="size-5" />,
    title: "Admin"
  },
  "/swap": {
    outline: <SwapOutline className="size-5" />,
    solid: <SwapSolid className="size-5" />,
    title: "Swap"
  }
};

const utilityItems = [
  {
    icon: <Cog6ToothIcon className="size-5" />,
    title: "Settings",
    url: "/settings"
  },
  {
    icon: <BookOpenIcon className="size-5" />,
    title: "FAQ",
    url: "/faq"
  },
  {
    icon: <ChatBubbleLeftRightIcon className="size-5" />,
    title: "Support",
    url: "/support"
  }
] as const;

const SectionLabel = ({
  children,
  collapsed
}: {
  children: ReactNode;
  collapsed: boolean;
}) => {
  if (collapsed) {
    return null;
  }

  return (
    <p className="px-2 font-medium text-[11px] text-gray-400 uppercase tracking-[0.24em] dark:text-gray-500">
      {children}
    </p>
  );
};

const ThemeToggle = ({
  collapsed,
  onToggle
}: {
  collapsed: boolean;
  onToggle: () => void;
}) => {
  const { theme } = useTheme();

  if (collapsed) {
    const icon =
      theme === "dark" ? (
        <span className="text-base leading-none">☀</span>
      ) : (
        <span className="text-base leading-none">☾</span>
      );

    return (
      <Tooltip content={theme === "dark" ? "Light mode" : "Dark mode"}>
        <button
          className="flex size-10 items-center justify-center rounded-[1.125rem] border border-gray-200/80 bg-white/90 text-gray-700 transition hover:border-sky-200 hover:text-sky-600 dark:border-gray-800 dark:bg-gray-950/80 dark:text-gray-200 dark:hover:border-sky-500/30 dark:hover:text-sky-300"
          onClick={onToggle}
          type="button"
        >
          {icon}
        </button>
      </Tooltip>
    );
  }

  return (
    <div className="grid grid-cols-2 rounded-2xl border border-gray-200/80 bg-gray-100/90 p-1 dark:border-gray-800 dark:bg-gray-900/90">
      {(["light", "dark"] as const).map((option) => {
        const isActive = theme === option;

        return (
          <button
            aria-label={option === "light" ? "Light mode" : "Dark mode"}
            className={cn(
              "flex items-center justify-center rounded-xl px-3 py-2 transition",
              isActive
                ? "bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-white"
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            )}
            key={option}
            onClick={() => {
              if (!isActive) {
                onToggle();
              }
            }}
            type="button"
          >
            {option === "light" ? (
              <SunIcon className="size-3.5" />
            ) : (
              <MoonIcon className="size-3.5" />
            )}
          </button>
        );
      })}
    </div>
  );
};

interface DesktopNavItemProps {
  badge?: ReactNode;
  collapsed: boolean;
  icon: ReactNode;
  isActive: boolean;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  title: string;
  url: string;
}

const DesktopNavItem = ({
  badge,
  collapsed,
  icon,
  isActive,
  onClick,
  title,
  url
}: DesktopNavItemProps) => {
  const content = (
    <Link
      className={cn(
        "group relative flex items-center rounded-[0.9rem] px-1.5 py-1.75 font-medium text-[11px] transition",
        collapsed ? "justify-center px-0" : "gap-2",
        isActive
          ? "bg-gray-950 text-white dark:bg-white dark:text-gray-950"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-gray-800/80 dark:hover:text-white"
      )}
      onClick={onClick}
      to={url}
    >
      {isActive ? (
        <span className="absolute inset-y-2 left-1 w-1 rounded-full bg-rose-400 dark:bg-sky-400" />
      ) : null}
      <span className="relative flex items-center justify-center">
        {icon}
        {collapsed && badge ? (
          <span className="absolute -top-1.5 -right-1.5">{badge}</span>
        ) : null}
      </span>
      {collapsed ? null : (
        <>
          <span className="truncate">{title}</span>
          {badge ? <span className="ml-auto">{badge}</span> : null}
        </>
      )}
    </Link>
  );

  if (!collapsed) {
    return content;
  }

  return <Tooltip content={title}>{content}</Tooltip>;
};

interface DesktopActionButtonProps {
  collapsed: boolean;
  icon: ReactNode;
  isActive: boolean;
  onClick: () => void;
  title: string;
  trailing?: ReactNode;
}

const DesktopActionButton = ({
  collapsed,
  icon,
  isActive,
  onClick,
  title,
  trailing
}: DesktopActionButtonProps) => {
  const content = (
    <button
      className={cn(
        "group relative flex w-full items-center rounded-[0.9rem] px-1.5 py-1.75 font-medium text-[11px] transition",
        collapsed ? "justify-center px-0" : "gap-2",
        isActive
          ? "bg-gray-950 text-white dark:bg-white dark:text-gray-950"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-gray-800/80 dark:hover:text-white"
      )}
      onClick={onClick}
      type="button"
    >
      {isActive ? (
        <span className="absolute inset-y-2 left-1 w-1 rounded-full bg-rose-400 dark:bg-sky-400" />
      ) : null}
      <span className="relative flex items-center justify-center">{icon}</span>
      {collapsed ? null : (
        <>
          <span className="truncate">{title}</span>
          {trailing ? <span className="ml-auto">{trailing}</span> : null}
        </>
      )}
    </button>
  );

  if (!collapsed) {
    return content;
  }

  return <Tooltip content={title}>{content}</Tooltip>;
};

const NavItems = ({
  collapsed,
  isLoggedIn
}: {
  collapsed: boolean;
  isLoggedIn: boolean;
}) => {
  const { pathname } = useLocation();
  const { sessionToken } = useStaffAdminStore();
  const { creatorsCount, exploreCount } = useEvery1MobileNavBadgeCounts();
  const hasNewNotifications = useHasNewNotifications();
  const client = useApolloClient();
  const queryClient = useQueryClient();
  const [refreshingRoute, setRefreshingRoute] = useState<string | null>(null);

  const isRouteActive = (route: string) => {
    if (route === "/referrals") {
      return (
        pathname === "/referrals" ||
        pathname.startsWith("/referrals/") ||
        pathname === "/streaks" ||
        pathname.startsWith("/streaks/")
      );
    }

    if (route === "/fandrop") {
      return (
        pathname === "/fandrop" ||
        pathname.startsWith("/fandrop/") ||
        pathname === "/missions" ||
        pathname.startsWith("/missions/")
      );
    }

    return pathname === route;
  };

  const routes = [
    "/",
    "/create",
    "/creators",
    "/fandrop",
    "/leaderboard",
    "/swap",
    "/referrals",
    ...(sessionToken ? ["/staff"] : []),
    ...(isLoggedIn ? ["/notifications", "/groups"] : [])
  ];

  const buildBadge = (route: string) => {
    if (route === "/notifications" && hasNewNotifications) {
      return collapsed ? (
        <span className="size-2.5 rounded-full bg-rose-500" />
      ) : (
        <span className="rounded-full bg-rose-500/12 px-2 py-1 font-semibold text-[11px] text-rose-600 dark:bg-rose-400/12 dark:text-rose-300">
          New
        </span>
      );
    }

    const count =
      route === "/" && pathname !== "/"
        ? exploreCount
        : route === "/creators" && !pathname.startsWith("/creators")
          ? creatorsCount
          : 0;

    if (count <= 0) {
      return null;
    }

    return (
      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 font-semibold text-[10px] text-white leading-none">
        {count > 9 ? "9+" : count}
      </span>
    );
  };

  return (
    <div className="space-y-1">
      {routes.map((route) => {
        const item = navigationItems[route as keyof typeof navigationItems];
        const isActive = isRouteActive(route);
        const badge = buildBadge(route);

        let icon = isActive ? item.solid : item.outline;

        if (refreshingRoute === route) {
          icon = <Spinner className="my-0.5" size="sm" />;
        }

        const handleClick = async (e: MouseEvent<HTMLAnchorElement>) => {
          const isSameRoute = pathname === route;

          if (!isSameRoute) {
            return;
          }

          if (route === "/") {
            e.preventDefault();
            window.scrollTo(0, 0);
            setRefreshingRoute(route);
            try {
              await queryClient.invalidateQueries({
                queryKey: [ZORA_HOME_FEED_QUERY_KEY]
              });
            } finally {
              setRefreshingRoute(null);
            }
            return;
          }

          if (!("refreshDocs" in item) || !item.refreshDocs) {
            return;
          }

          e.preventDefault();
          window.scrollTo(0, 0);
          setRefreshingRoute(route);
          try {
            await client.refetchQueries({ include: item.refreshDocs });
          } finally {
            setRefreshingRoute(null);
          }
        };

        return (
          <DesktopNavItem
            badge={badge}
            collapsed={collapsed}
            icon={icon}
            isActive={isActive}
            key={route}
            onClick={handleClick}
            title={item.title}
            url={route}
          />
        );
      })}
    </div>
  );
};

const Navbar = () => {
  const { pathname } = useLocation();
  const { currentAccount } = useAccountStore();
  const { theme, toggleTheme } = useTheme();
  const openAuth = useOpenAuth();
  const [collapsed, setCollapsed] = useState(getDesktopSidebarCollapsed);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const account = currentAccount as AccountFragment | undefined;
  const accountInfo = useMemo(() => getAccount(account), [account]);
  const hasActiveUtilityRoute = utilityItems.some(
    (item) => pathname === item.url
  );

  useEffect(() => {
    persistDesktopSidebarCollapsed(collapsed);
  }, [collapsed]);

  useEffect(() => {
    if (hasActiveUtilityRoute) {
      setIsMoreOpen(true);
    }
  }, [hasActiveUtilityRoute]);

  const handleLogoClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (pathname === "/") {
        e.preventDefault();
        window.scrollTo(0, 0);
      }
    },
    [pathname]
  );

  const handleAuthClick = useCallback(() => {
    void openAuth("open_login");
  }, [openAuth]);

  return (
    <aside
      className={cn(
        "sticky top-5 mt-5 hidden shrink-0 flex-col overflow-y-auto overflow-x-hidden rounded-[1.45rem] border border-gray-200/70 bg-white/90 px-1.75 py-1.75 backdrop-blur md:flex dark:border-gray-800/70 dark:bg-gray-950/88",
        "max-h-[calc(100vh-2.5rem)] min-h-[calc(100vh-2.5rem)] transition-[width,padding] duration-300 ease-out",
        collapsed
          ? "thin-scrollbar w-[2.875rem] px-[0.35rem] py-1 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)] dark:shadow-[0_18px_42px_-34px_rgba(0,0,0,0.7)]"
          : "ultra-thin-scrollbar w-[9.75rem] px-1 py-1 shadow-none"
      )}
    >
      <div
        className={cn(
          "flex items-center",
          collapsed ? "justify-center" : "justify-between gap-3"
        )}
      >
        <Link
          className={cn(
            "flex min-w-0 items-center",
            collapsed ? "justify-center" : "gap-3"
          )}
          onClick={handleLogoClick}
          to="/"
        >
          <Image
            alt="Every1"
            className={cn(
              "object-cover ring-1 ring-black/5 dark:ring-white/10",
              collapsed ? "size-7 rounded-[0.8rem]" : "size-7 rounded-[0.85rem]"
            )}
            height={28}
            src={evLogo}
            width={28}
          />
          {collapsed ? null : (
            <div className="min-w-0">
              <p className="truncate font-semibold text-[12px] text-gray-950 dark:text-white">
                Every1
              </p>
              <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                Creator network
              </p>
            </div>
          )}
        </Link>
        {collapsed ? null : (
          <button
            className="inline-flex size-5.5 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white transition hover:bg-sky-600"
            onClick={() => {
              setCollapsed(true);
            }}
            type="button"
          >
            <ChevronRightIcon className="size-4 rotate-180" />
          </button>
        )}
      </div>

      {collapsed ? (
        <div className="mt-3 flex flex-col items-center gap-1.5">
          <button
            className="inline-flex size-6.5 items-center justify-center rounded-[0.75rem] border border-gray-200/80 bg-gray-100/80 text-gray-600 transition hover:border-sky-200 hover:text-sky-600 dark:border-gray-800 dark:bg-gray-900/80 dark:text-gray-300 dark:hover:border-sky-500/30 dark:hover:text-sky-300"
            onClick={() => {
              setCollapsed(false);
            }}
            title="Expand menu"
            type="button"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <SectionLabel collapsed={collapsed}>Menu</SectionLabel>
        <div className="mt-2">
          <NavItems
            collapsed={collapsed}
            isLoggedIn={Boolean(currentAccount)}
          />
        </div>

        <div className="mt-4 border-gray-200/70 border-t pt-3.5 dark:border-gray-800/70">
          <DesktopActionButton
            collapsed={collapsed}
            icon={<EllipsisHorizontalCircleIcon className="size-5" />}
            isActive={isMoreOpen || hasActiveUtilityRoute}
            onClick={() => {
              setIsMoreOpen((currentValue) => !currentValue);
            }}
            title="More"
            trailing={
              <ChevronRightIcon
                className={cn(
                  "size-4 transition-transform",
                  isMoreOpen ? "rotate-90" : ""
                )}
              />
            }
          />
          {isMoreOpen ? (
            <div className="mt-2 space-y-1">
              {utilityItems.map((item) => (
                <DesktopNavItem
                  collapsed={collapsed}
                  icon={item.icon}
                  isActive={pathname === item.url}
                  key={item.url}
                  title={item.title}
                  url={item.url}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-auto space-y-2 border-gray-200/70 border-t pt-3.5 dark:border-gray-800/70">
          <ThemeToggle
            collapsed={collapsed}
            onToggle={() => {
              umami.track("switch_theme", {
                theme: theme === "light" ? "dark" : "light"
              });
              toggleTheme();
            }}
          />

          {currentAccount ? (
            collapsed ? (
              <Tooltip content="Your profile">
                <Link
                  className="flex items-center justify-center"
                  to={accountInfo.link}
                >
                  <Image
                    alt={accountInfo.name}
                    className="size-6.5 rounded-[0.75rem] border border-gray-200 object-cover dark:border-gray-800"
                    height={26}
                    src={getAvatar(currentAccount)}
                    width={26}
                  />
                </Link>
              </Tooltip>
            ) : (
              <div className="rounded-[1rem] border border-gray-200/80 bg-gray-50/90 p-1.75 dark:border-gray-800 dark:bg-gray-900/70">
                <Link
                  className="flex min-w-0 items-center gap-2"
                  to={accountInfo.link}
                >
                  <Image
                    alt={accountInfo.name}
                    className="size-6 rounded-[0.8rem] border border-gray-200 object-cover dark:border-gray-800"
                    height={24}
                    src={getAvatar(currentAccount)}
                    width={24}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[10px] text-gray-950 dark:text-white">
                      {accountInfo.name}
                    </p>
                    <p className="truncate text-[10px] text-gray-500 dark:text-gray-400">
                      {accountInfo.username}
                    </p>
                  </div>
                </Link>
                <div className="mt-1.5">
                  <Logout className="w-full justify-center rounded-[0.7rem] border border-gray-200/80 bg-white px-1 py-1.25 text-center font-medium text-[9px] text-gray-700 hover:border-rose-200 hover:text-rose-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-rose-500/30 dark:hover:text-rose-300" />
                </div>
              </div>
            )
          ) : collapsed ? (
            <Tooltip content="Login">
              <button
                className="flex size-6.5 items-center justify-center rounded-[0.75rem] border border-gray-200/80 bg-white/90 transition hover:border-sky-200 dark:border-gray-800 dark:bg-gray-950"
                onClick={handleAuthClick}
                type="button"
              >
                <Image
                  alt="Every1"
                  className="size-4.5 rounded-[0.5rem] object-cover"
                  height={18}
                  src={evLogo}
                  width={18}
                />
              </button>
            </Tooltip>
          ) : (
            <div className="space-y-2">
              <SignupButton className="w-full rounded-2xl" />
              <LoginButton className="w-full rounded-2xl" />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default memo(Navbar);
