import { useApolloClient } from "@apollo/client";
import {
  BellIcon as BellOutline,
  PlusCircleIcon as CreateOutline,
  StarIcon as CreatorsOutline,
  TrophyIcon as LeaderboardOutline,
  FlagIcon as MissionsOutline,
  GiftIcon as ReferralsOutline,
  ShieldCheckIcon as StaffOutline,
  ArrowsRightLeftIcon as SwapOutline,
  UserGroupIcon as UserGroupOutline
} from "@heroicons/react/24/outline";
import {
  BellIcon as BellSolid,
  PlusCircleIcon as CreateSolid,
  StarIcon as CreatorsSolid,
  TrophyIcon as LeaderboardSolid,
  FlagIcon as MissionsSolid,
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
  useState
} from "react";
import { Link, useLocation } from "react-router";
import evLogo from "@/assets/fonts/evlogo.jpg";
import { ZORA_HOME_FEED_QUERY_KEY } from "@/components/Home/zoraHomeFeedConfig";
import {
  CompassExploreOutlineIcon,
  CompassExploreSolidIcon
} from "@/components/Shared/Icons/CompassExploreIcon";
import { Image, Spinner, Tooltip } from "@/components/Shared/UI";
import useEvery1MobileNavBadgeCounts from "@/hooks/useEvery1MobileNavBadgeCounts";
import useHasNewNotifications from "@/hooks/useHasNewNotifications";
import useOpenAuth from "@/hooks/useOpenAuth";
import {
  GroupsDocument,
  NotificationIndicatorDocument,
  NotificationsDocument
} from "@/indexer/generated";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import useStaffAdminStore from "@/store/persisted/useStaffAdminStore";
import SignedAccount from "./SignedAccount";

const navigationItems = {
  "/": {
    outline: <CompassExploreOutlineIcon className="size-6" />,
    solid: <CompassExploreSolidIcon className="size-6" />,
    title: "Explore"
  },
  "/create": {
    outline: <CreateOutline className="size-6" />,
    solid: <CreateSolid className="size-6" />,
    title: "Create"
  },
  "/creators": {
    outline: <CreatorsOutline className="size-6" />,
    solid: <CreatorsSolid className="size-6" />,
    title: "Creators"
  },
  "/groups": {
    outline: <UserGroupOutline className="size-6" />,
    refreshDocs: [GroupsDocument],
    solid: <UserGroupSolid className="size-6" />,
    title: "Groups"
  },
  "/leaderboard": {
    outline: <LeaderboardOutline className="size-6" />,
    solid: <LeaderboardSolid className="size-6" />,
    title: "Leaderboard"
  },
  "/notifications": {
    outline: <BellOutline className="size-6" />,
    refreshDocs: [NotificationsDocument, NotificationIndicatorDocument],
    solid: <BellSolid className="size-6" />,
    title: "Notifications"
  },
  "/referrals": {
    outline: <ReferralsOutline className="size-6" />,
    solid: <ReferralsSolid className="size-6" />,
    title: "Referrals"
  },
  "/fandrop": {
    outline: <MissionsOutline className="size-6" />,
    solid: <MissionsSolid className="size-6" />,
    title: "FanDrop"
  },
  "/staff": {
    outline: <StaffOutline className="size-6" />,
    solid: <StaffSolid className="size-6" />,
    title: "Admin"
  },
  "/swap": {
    outline: <SwapOutline className="size-6" />,
    solid: <SwapSolid className="size-6" />,
    title: "Swap"
  }
};

interface NavItemProps {
  url: string;
  icon: ReactNode;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

const NavItem = memo(({ icon, onClick, url }: NavItemProps) => (
  <Tooltip content={navigationItems[url as keyof typeof navigationItems].title}>
    <Link onClick={onClick} to={url}>
      {icon}
    </Link>
  </Tooltip>
));

const NavItems = memo(({ isLoggedIn }: { isLoggedIn: boolean }) => {
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

    return pathname === route;
  };
  const routes = [
    "/",
    "/create",
    "/creators",
    "/leaderboard",
    "/swap",
    "/referrals",
    "/fandrop",
    ...(sessionToken ? ["/staff"] : []),
    ...(isLoggedIn ? ["/notifications", "/groups"] : [])
  ];

  return (
    <>
      {routes.map((route) => {
        let icon = isRouteActive(route)
          ? navigationItems[route as keyof typeof navigationItems].solid
          : navigationItems[route as keyof typeof navigationItems].outline;

        if (refreshingRoute === route) {
          icon = <Spinner className="my-0.5" size="sm" />;
        }

        const iconWithIndicator =
          route === "/notifications" ||
          route === "/" ||
          route === "/creators" ? (
            <span className="relative">
              {icon}
              {route === "/notifications" && hasNewNotifications ? (
                <span className="absolute -top-1 -right-1 size-2 rounded-full bg-red-500" />
              ) : null}
              {route === "/" && pathname !== "/" && exploreCount > 0 ? (
                <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full border border-white bg-pink-500 px-1 text-center font-semibold text-[10px] text-white leading-4 dark:border-gray-950">
                  {exploreCount > 9 ? "9+" : exploreCount}
                </span>
              ) : null}
              {route === "/creators" &&
              !pathname.startsWith("/creators") &&
              creatorsCount > 0 ? (
                <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full border border-white bg-pink-500 px-1 text-center font-semibold text-[10px] text-white leading-4 dark:border-gray-950">
                  {creatorsCount > 9 ? "9+" : creatorsCount}
                </span>
              ) : null}
            </span>
          ) : (
            icon
          );

        const handleClick = async (e: MouseEvent<HTMLAnchorElement>) => {
          const item = navigationItems[route as keyof typeof navigationItems];
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
          <NavItem
            icon={iconWithIndicator}
            key={route}
            onClick={handleClick}
            url={route}
          />
        );
      })}
    </>
  );
});

const Navbar = () => {
  const { pathname } = useLocation();
  const { currentAccount } = useAccountStore();
  const openAuth = useOpenAuth();

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
    <aside className="sticky top-5 mt-5 hidden w-10 shrink-0 flex-col items-center gap-y-5 md:flex">
      <Link onClick={handleLogoClick} to="/">
        <Image
          alt="Logo"
          className="size-8 rounded-lg object-cover"
          height={32}
          src={evLogo}
          width={32}
        />
      </Link>
      <NavItems isLoggedIn={!!currentAccount} />
      {currentAccount ? (
        <SignedAccount />
      ) : (
        <button onClick={handleAuthClick} type="button">
          <Tooltip content="Login">
            <Image
              alt="Profile"
              className="size-6 rounded-full object-cover"
              height={24}
              src={evLogo}
              width={24}
            />
          </Tooltip>
        </button>
      )}
    </aside>
  );
};

export default memo(Navbar);
