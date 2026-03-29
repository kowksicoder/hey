import {
  PlusCircleIcon as CreateOutline,
  StarIcon as CreatorsOutline,
  MagnifyingGlassIcon,
  ArrowsRightLeftIcon as SwapOutline
} from "@heroicons/react/24/outline";
import {
  PlusCircleIcon as CreateSolid,
  StarIcon as CreatorsSolid,
  ArrowsRightLeftIcon as SwapSolid
} from "@heroicons/react/24/solid";
import type { MouseEvent, ReactNode } from "react";
import { Link, useLocation } from "react-router";
import {
  CompassExploreOutlineIcon,
  CompassExploreSolidIcon
} from "@/components/Shared/Icons/CompassExploreIcon";
import { Image } from "@/components/Shared/UI";
import getAvatar from "@/helpers//getAvatar";
import useEvery1MobileNavBadgeCounts from "@/hooks/useEvery1MobileNavBadgeCounts";
import { useMobileDrawerModalStore } from "@/store/non-persisted/modal/useMobileDrawerModalStore";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import MobileDrawerMenu from "./MobileDrawerMenu";

interface NavigationItemProps {
  badgeCount?: number;
  path: string;
  label: string;
  outline: ReactNode;
  solid: ReactNode;
  isActive: boolean;
  onClick?: (e: MouseEvent) => void;
}

const NavigationItem = ({
  badgeCount = 0,
  path,
  label,
  outline,
  solid,
  isActive,
  onClick
}: NavigationItemProps) => (
  <Link
    aria-label={label}
    className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2"
    onClick={onClick}
    to={path}
  >
    <span
      className={`relative ${
        isActive
          ? "text-gray-950 dark:text-white"
          : "text-gray-500 dark:text-gray-400"
      }`}
    >
      {isActive ? solid : outline}
      {badgeCount > 0 ? (
        <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full border border-white bg-pink-500 px-1 text-center font-semibold text-[10px] text-white leading-4 dark:border-gray-950">
          {badgeCount > 9 ? "9+" : badgeCount}
        </span>
      ) : null}
    </span>
    <span
      className={`max-w-full truncate px-1 font-medium text-[9px] leading-none ${
        isActive
          ? "text-gray-950 dark:text-white"
          : "text-gray-500 dark:text-gray-400"
      }`}
    >
      {label}
    </span>
  </Link>
);

const BottomNavigation = () => {
  const { pathname } = useLocation();
  const { currentAccount } = useAccountStore();
  const { creatorsCount, exploreCount } = useEvery1MobileNavBadgeCounts();
  const { show: showMobileDrawer, setShow: setShowMobileDrawer } =
    useMobileDrawerModalStore();

  const handleAccountClick = () => setShowMobileDrawer(true);

  const handleHomClick = (path: string, e: MouseEvent) => {
    if (path === "/" && pathname === "/") {
      e.preventDefault();
      window.scrollTo(0, 0);
    }
  };

  const navigationItems = [
    {
      label: "Explore",
      outline: <CompassExploreOutlineIcon className="size-5" strokeWidth={2.25} />,
      path: "/",
      solid: <CompassExploreSolidIcon className="size-5" />
    },
    {
      label: "Search",
      outline: <MagnifyingGlassIcon className="size-5" strokeWidth={2.25} />,
      path: "/search",
      solid: <MagnifyingGlassIcon className="size-5" />
    },
    {
      label: "Create",
      outline: <CreateOutline className="size-5" strokeWidth={2.25} />,
      path: "/create",
      solid: <CreateSolid className="size-5" />
    },
    {
      label: "Swap",
      outline: <SwapOutline className="size-5" strokeWidth={2.25} />,
      path: "/swap",
      solid: <SwapSolid className="size-5" />
    },
    {
      label: "Creators",
      outline: <CreatorsOutline className="size-5" strokeWidth={2.25} />,
      path: "/creators",
      solid: <CreatorsSolid className="size-5" />
    }
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[5] border-gray-200/65 border-t bg-white pb-safe md:hidden dark:border-gray-800/75 dark:bg-black">
      {showMobileDrawer && <MobileDrawerMenu />}
      <div className="flex items-center justify-between gap-1.5 px-1.5 pb-1.5 pt-2">
        {navigationItems.map(({ path, label, outline, solid }) => (
          <NavigationItem
            badgeCount={
              path === "/"
                ? pathname !== "/"
                  ? exploreCount
                  : 0
                : path === "/creators"
                  ? pathname.startsWith("/creators")
                    ? 0
                    : creatorsCount
                  : 0
            }
            isActive={pathname === path}
            key={path}
            label={label}
            onClick={(e) => handleHomClick(path, e)}
            outline={outline}
            path={path}
            solid={solid}
          />
        ))}
        {currentAccount && (
          <button
            aria-label="Your account"
            className="flex flex-1 flex-col items-center justify-center gap-1 py-2"
            onClick={handleAccountClick}
            type="button"
          >
            <Image
              alt={currentAccount.address}
              className="size-7 rounded-full border border-gray-200 dark:border-gray-700"
              src={getAvatar(currentAccount)}
            />
            <span className="px-1 font-medium text-[9px] text-gray-500 leading-none dark:text-gray-400">
              Menu
            </span>
          </button>
        )}
      </div>
    </nav>
  );
};

export default BottomNavigation;
