import {
  ArrowRightStartOnRectangleIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  FireIcon,
  GiftIcon,
  InformationCircleIcon,
  PlusCircleIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  UserGroupIcon
} from "@heroicons/react/24/outline";
import { usePrivy } from "@privy-io/react-auth";
import { Link, useLocation } from "react-router";
import evLogo from "@/assets/fonts/evlogo.jpg";
import { Button, Image } from "@/components/Shared/UI";
import cn from "@/helpers/cn";
import getAccount from "@/helpers/getAccount";
import reloadAllTabs from "@/helpers/reloadAllTabs";
import useOpenAuth from "@/hooks/useOpenAuth";
import { useMobileDrawerModalStore } from "@/store/non-persisted/modal/useMobileDrawerModalStore";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import { signOut } from "@/store/persisted/useAuthStore";
import useStaffAdminStore from "@/store/persisted/useStaffAdminStore";

const isActivePath = (pathname: string, path: string) => {
  if (path === "/") {
    return pathname === "/";
  }

  if (path === "/referrals") {
    return (
      pathname === "/referrals" ||
      pathname.startsWith("/referrals/") ||
      pathname === "/streaks" ||
      pathname.startsWith("/streaks/")
    );
  }

  if (path === "/fandrop") {
    return (
      pathname === "/fandrop" ||
      pathname.startsWith("/fandrop/") ||
      pathname === "/missions" ||
      pathname.startsWith("/missions/")
    );
  }

  return pathname === path || pathname.startsWith(`${path}/`);
};

const MobileDrawerMenu = () => {
  const { pathname } = useLocation();
  const { currentAccount } = useAccountStore();
  const { sessionToken } = useStaffAdminStore();
  const { logout } = usePrivy();
  const openAuth = useOpenAuth();
  const { setShow: setShowMobileDrawer } = useMobileDrawerModalStore();

  const handleCloseDrawer = () => {
    setShowMobileDrawer(false);
  };

  const itemClass =
    "flex w-full items-center justify-between gap-2 rounded-[0.85rem] px-2.5 py-2 text-left text-sm font-medium leading-5 transition-colors";

  const loggedInPrimaryItems = [
    {
      icon: <UserCircleIcon className="size-5" />,
      label: "Profile",
      path: getAccount(currentAccount).link
    },
    {
      icon: <UserGroupIcon className="size-5" />,
      label: "Community",
      path: "/groups"
    },
    {
      icon: <PlusCircleIcon className="size-4.5" />,
      label: "Create",
      path: "/create"
    },
    {
      icon: <DocumentTextIcon className="size-4.5" />,
      label: "Showcase",
      path: "/showcase"
    },
    {
      icon: <GiftIcon className="size-4.5" />,
      label: "Referrals",
      path: "/referrals"
    },
    ...(sessionToken
      ? [
          {
            icon: <ShieldCheckIcon className="size-4.5" />,
            label: "Admin",
            path: "/staff"
          }
        ]
      : []),
    {
      icon: <FireIcon className="size-4.5" />,
      label: "FanDrop",
      path: "/fandrop"
    },
    {
      icon: <Cog6ToothIcon className="size-4.5" />,
      label: "Settings",
      path: "/settings"
    }
  ];

  const loggedOutPrimaryItems = [
    {
      icon: <UserGroupIcon className="size-4.5" />,
      label: "Community",
      path: "/groups"
    },
    {
      icon: <PlusCircleIcon className="size-4.5" />,
      label: "Create",
      path: "/create"
    },
    {
      icon: <DocumentTextIcon className="size-4.5" />,
      label: "Showcase",
      path: "/showcase"
    },
    {
      icon: <GiftIcon className="size-4.5" />,
      label: "Referrals",
      path: "/referrals"
    },
    {
      icon: <FireIcon className="size-4.5" />,
      label: "FanDrop",
      path: "/fandrop"
    }
  ];

  const primaryItems = currentAccount
    ? loggedInPrimaryItems
    : loggedOutPrimaryItems;

  return (
    <div
      className="fixed inset-0 z-10 bg-black/8 px-2.5 pt-10 pb-2 backdrop-blur-[1px] md:hidden"
      onClick={handleCloseDrawer}
    >
      <div
        className="max-h-[calc(100dvh-6.5rem)] w-[15.75rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[1.15rem] bg-white p-1.5 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.32)] dark:bg-gray-950 dark:shadow-none"
        onClick={(event) => event.stopPropagation()}
      >
        {currentAccount ? null : (
          <div className="space-y-1.5 px-1.5 pb-1.5">
            <div className="flex items-center gap-2">
              <Image
                alt="Every1"
                className="size-7 rounded-lg object-cover"
                height={28}
                src={evLogo}
                width={28}
              />
              <div className="space-y-0.5">
                <p className="font-semibold text-[13px] text-gray-950 dark:text-gray-50">
                  Every1
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  Open social for everyone.
                </p>
              </div>
            </div>

            <div className="flex gap-1.5">
              <Button
                className="w-full"
                onClick={() => {
                  handleCloseDrawer();
                  void openAuth("open_login");
                }}
                size="sm"
              >
                Login
              </Button>
              <Button
                className="w-full"
                onClick={() => {
                  handleCloseDrawer();
                  void openAuth("open_signup");
                }}
                outline
                size="sm"
              >
                Signup
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-0.5">
          {primaryItems.map(({ icon, label, path }) => {
            const isActive = isActivePath(pathname, path);

            return (
              <Link
                className={cn(
                  itemClass,
                  isActive
                    ? "bg-gray-100 text-gray-950 dark:bg-gray-900 dark:text-gray-50"
                    : "text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900"
                )}
                key={path}
                onClick={handleCloseDrawer}
                to={path}
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-gray-700 dark:text-gray-300 [&>svg]:size-4.5">
                    {icon}
                  </span>
                  <span>{label}</span>
                </span>
              </Link>
            );
          })}

          <div className="my-0.5 border-gray-200/65 border-t dark:border-gray-800/75" />

          {currentAccount ? (
            <Link
              className={cn(
                itemClass,
                isActivePath(pathname, "/support")
                  ? "bg-gray-100 text-gray-950 dark:bg-gray-900 dark:text-gray-50"
                  : "text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900"
              )}
              onClick={handleCloseDrawer}
              to="/support"
            >
              <span className="flex items-center gap-2.5">
                <InformationCircleIcon className="size-4 text-gray-700 dark:text-gray-300" />
                <span>Help center</span>
              </span>
            </Link>
          ) : null}

          {currentAccount ? (
            <button
              className={cn(
                itemClass,
                "text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900"
              )}
              onClick={async () => {
                await logout();
                await signOut();
                reloadAllTabs();
                handleCloseDrawer();
              }}
              type="button"
            >
              <span className="flex items-center gap-2.5">
                <ArrowRightStartOnRectangleIcon className="size-4 text-gray-700 dark:text-gray-300" />
                <span>Sign out</span>
              </span>
            </button>
          ) : (
            <>
              <Link
                className={cn(
                  itemClass,
                  isActivePath(pathname, "/support")
                    ? "bg-gray-100 text-gray-950 dark:bg-gray-900 dark:text-gray-50"
                    : "text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900"
                )}
                onClick={handleCloseDrawer}
                to="/support"
              >
                <span className="flex items-center gap-2.5">
                  <InformationCircleIcon className="size-4 text-gray-700 dark:text-gray-300" />
                  <span>Help center</span>
                </span>
              </Link>
              <button
                className={cn(
                  itemClass,
                  "text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900"
                )}
                onClick={() => {
                  handleCloseDrawer();
                  void openAuth("open_login");
                }}
                type="button"
              >
                <span className="flex items-center gap-3">
                  <ArrowRightStartOnRectangleIcon className="size-4.5 text-gray-700 dark:text-gray-300" />
                  <span>Sign in</span>
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileDrawerMenu;
