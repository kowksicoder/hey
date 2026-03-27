import { XCircleIcon } from "@heroicons/react/24/solid";
import { usePrivy } from "@privy-io/react-auth";
import { useIsClient } from "@uidotdev/usehooks";
import { memo, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { Toaster, type ToasterProps } from "sonner";
import NotificationIcon from "@/components/Notification/NotificationIcon";
import FullPageLoader from "@/components/Shared/FullPageLoader";
import GlobalAlerts from "@/components/Shared/GlobalAlerts";
import GlobalModals from "@/components/Shared/GlobalModals";
import Navbar from "@/components/Shared/Navbar";
import BottomNavigation from "@/components/Shared/Navbar/BottomNavigation";
import MobileHeader from "@/components/Shared/Navbar/MobileHeader";
import { ActionStatusModal, Button, Spinner } from "@/components/Shared/UI";
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
import Every1ExecutionWalletBridge from "./Every1ExecutionWalletBridge";
import Every1RuntimeBridge from "./Every1RuntimeBridge";
import Every1WalletSync from "./Every1WalletSync";
import ProductTourModal from "./ProductTourModal";
import ReloadTabsWatcher from "./ReloadTabsWatcher";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

const Layout = () => {
  const { pathname } = useLocation();
  const { theme } = useTheme();
  const { currentAccount, setCurrentAccount } = useAccountStore();
  const {
    clearPendingProductTour,
    clearSignupCelebration,
    pendingProductTourProfileId,
    profile,
    signupCelebrationProfileId
  } = useEvery1Store();
  const { viewMode } = useHomeTabStore();
  const isMounted = useIsClient();
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
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
    const getStandaloneState = () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean(
        (
          window.navigator as Navigator & {
            standalone?: boolean;
          }
        ).standalone
      );
    const handleInstallPrompt = (event: Event) => {
      const nextPrompt = event as BeforeInstallPromptEvent;
      nextPrompt.preventDefault();
      setDeferredInstallPrompt(nextPrompt);
    };
    const syncInstallSurface = () => {
      setIsMobileViewport(mediaQuery.matches);
      setIsStandalone(getStandaloneState());
    };
    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setIsStandalone(true);
    };

    syncInstallSurface();

    if (!mediaQuery.matches) {
      setMobileSplashReady(true);
    }

    const timer = mediaQuery.matches
      ? window.setTimeout(() => {
          setMobileSplashReady(true);
        }, 2000)
      : null;

    mediaQuery.addEventListener("change", syncInstallSurface);
    window.addEventListener(
      "beforeinstallprompt",
      handleInstallPrompt as EventListener
    );
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }

      mediaQuery.removeEventListener("change", syncInstallSurface);
      window.removeEventListener(
        "beforeinstallprompt",
        handleInstallPrompt as EventListener
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
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
    clearPendingProductTour();
    window.location.assign("/create");
  };

  const handleCloseProductTour = () => {
    clearPendingProductTour();
  };

  const handleAddToHome = async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    await deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;

    if (result.outcome === "accepted") {
      setDeferredInstallPrompt(null);
      setIsStandalone(true);
    }
  };

  const installNudgeFooter =
    signupCelebrationProfileId && isMobileViewport && !isStandalone ? (
      <div className="mx-auto max-w-[17rem] rounded-[20px] border border-sky-200/80 bg-sky-50/80 px-3 py-3 text-left dark:border-sky-400/14 dark:bg-sky-500/8">
        <p className="font-semibold text-[12px] text-gray-950 dark:text-gray-50">
          Add Every1 to Home
        </p>
        <p className="mt-1 text-[11px] text-gray-600 leading-5 dark:text-gray-400">
          {deferredInstallPrompt
            ? "Install Every1 to your home screen for a faster, app-like experience on mobile."
            : "For the full app feel on iPhone, tap Share in Safari and choose Add to Home Screen."}
        </p>
        {deferredInstallPrompt ? (
          <Button
            className="mt-3 w-full justify-center"
            onClick={() => {
              void handleAddToHome();
            }}
            outline
            size="sm"
          >
            Add to home
          </Button>
        ) : null}
      </div>
    ) : null;

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
      {hasPrivy ? <Every1WalletSync /> : null}
      {hasPrivy ? <Every1ExecutionWalletBridge /> : null}
      <Every1RuntimeBridge />
      <ActionStatusModal
        actionLabel="Launch a coin"
        description="Nice work! Your account is ready. Launch your first coin and start building."
        footer={installNudgeFooter}
        label="Signup successful"
        onAction={handleLaunchCoin}
        onClose={handleSignupCelebrationClose}
        show={Boolean(signupCelebrationProfileId)}
        title={`Welcome${profile?.displayName ? `, ${profile.displayName}` : ""}`}
        tone="success"
      />
      <ProductTourModal
        onClose={handleCloseProductTour}
        onLaunchCoin={() => {
          clearPendingProductTour();
          window.location.assign("/create");
        }}
        show={
          Boolean(pendingProductTourProfileId) && !signupCelebrationProfileId
        }
      />
      {hideMobileHeader ? null : <MobileHeader />}
      <div
        className={cn("mx-auto flex w-full items-start px-0 md:px-5", {
          "max-w-[92rem]": isStaffRoute,
          "max-w-[92rem] gap-x-6 xl:gap-x-8": !isStaffRoute
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
