import { XCircleIcon } from "@heroicons/react/24/solid";
import { usePrivy } from "@privy-io/react-auth";
import { useIsClient } from "@uidotdev/usehooks";
import { memo, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Toaster, type ToasterProps } from "sonner";
import NotificationIcon from "@/components/Notification/NotificationIcon";
import FullPageLoader from "@/components/Shared/FullPageLoader";
import GlobalAlerts from "@/components/Shared/GlobalAlerts";
import GlobalModals from "@/components/Shared/GlobalModals";
import Navbar from "@/components/Shared/Navbar";
import BottomNavigation from "@/components/Shared/Navbar/BottomNavigation";
import MobileHeader from "@/components/Shared/Navbar/MobileHeader";
import { ActionStatusModal, Spinner } from "@/components/Shared/UI";
import { HomeFeedView } from "@/data/enums";
import cn from "@/helpers/cn";
import {
  buildAccountFromPrivyUser,
  hasPrivyConfig,
  mergeEvery1ProfileIntoAccount
} from "@/helpers/privy";
import { useTheme } from "@/hooks/useTheme";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";
import { useHomeTabStore } from "@/store/persisted/useHomeTabStore";
import Every1RuntimeBridge from "./Every1RuntimeBridge";
import ReloadTabsWatcher from "./ReloadTabsWatcher";

const Layout = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { currentAccount, setCurrentAccount } = useAccountStore();
  const { clearSignupCelebration, profile, signupCelebrationProfileId } =
    useEvery1Store();
  const { viewMode } = useHomeTabStore();
  const isMounted = useIsClient();
  const [mobileSplashReady, setMobileSplashReady] = useState(false);
  const { authenticated, ready, user } = usePrivy();
  const isStaffRoute = pathname.startsWith("/staff");
  const isHomeReelMode = pathname === "/" && viewMode === HomeFeedView.LIST;
  const hideMobileHeader =
    isStaffRoute || pathname.startsWith("/coins/") || isHomeReelMode;
  const hideBottomNavigation = isStaffRoute || isHomeReelMode;
  const privyAccount = useMemo(() => {
    const baseAccount = user ? buildAccountFromPrivyUser(user) : undefined;

    if (!baseAccount) {
      return undefined;
    }

    const profileMatchesWallet =
      profile?.walletAddress &&
      profile.walletAddress.toLowerCase() === baseAccount.owner.toLowerCase();

    return profileMatchesWallet
      ? mergeEvery1ProfileIntoAccount(baseAccount, profile)
      : baseAccount;
  }, [profile, user]);
  const hasPrivy = hasPrivyConfig();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 767px)");

    if (!mediaQuery.matches) {
      setMobileSplashReady(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setMobileSplashReady(true);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [isMounted]);

  useEffect(() => {
    if (!hasPrivy || !ready) {
      return;
    }

    if (!authenticated || !privyAccount) {
      if (currentAccount) {
        setCurrentAccount(undefined);
      }
      return;
    }

    if (
      currentAccount?.address !== privyAccount.address ||
      currentAccount?.metadata?.name !== privyAccount.metadata?.name ||
      currentAccount?.metadata?.picture !== privyAccount.metadata?.picture ||
      currentAccount?.metadata?.bio !== privyAccount.metadata?.bio ||
      currentAccount?.username?.value !== privyAccount.username?.value
    ) {
      setCurrentAccount(privyAccount);
    }
  }, [
    authenticated,
    currentAccount,
    hasPrivy,
    privyAccount,
    ready,
    setCurrentAccount
  ]);

  const accountLoading = !isMounted || (hasPrivy && !ready);
  const showSplash = accountLoading || !mobileSplashReady;

  if (showSplash) {
    return <FullPageLoader />;
  }

  const handleSignupCelebrationClose = () => {
    clearSignupCelebration();
  };

  const handleLaunchCoin = () => {
    clearSignupCelebration();
    navigate("/create");
  };

  return (
    <>
      <Toaster
        icons={{
          error: (
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-rose-500/12 ring-1 ring-rose-500/18 dark:bg-rose-500/14 dark:ring-rose-400/20">
              <XCircleIcon className="size-3.5 text-rose-600 dark:text-rose-300" />
            </span>
          ),
          loading: (
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-sky-500/12 ring-1 ring-sky-500/18 dark:bg-sky-500/14 dark:ring-sky-400/20">
              <Spinner size="xs" />
            </span>
          ),
          success: <NotificationIcon kind="verification" />
        }}
        position="bottom-right"
        theme={theme as ToasterProps["theme"]}
        toastOptions={{
          className: "every1-toast font-platform",
          style: { boxShadow: "none" }
        }}
      />
      <GlobalModals />
      <GlobalAlerts />
      <ReloadTabsWatcher />
      <Every1RuntimeBridge />
      <ActionStatusModal
        actionLabel="Launch a coin"
        description="Nice work! Your account is ready. Launch your first coin and start building."
        label="Signup successful"
        onAction={handleLaunchCoin}
        onClose={handleSignupCelebrationClose}
        show={Boolean(signupCelebrationProfileId)}
        title={`Welcome${profile?.displayName ? `, ${profile.displayName}` : ""}`}
        tone="success"
      />
      {hideMobileHeader ? null : <MobileHeader />}
      <div
        className={cn("mx-auto flex w-full items-start px-0 md:px-5", {
          "max-w-[92rem]": isStaffRoute,
          "max-w-6xl gap-x-8": !isStaffRoute
        })}
      >
        {isStaffRoute ? null : <Navbar />}
        <Outlet />
        {hideBottomNavigation ? null : <BottomNavigation />}
      </div>
    </>
  );
};

export default memo(Layout);
