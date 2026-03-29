import { useQueryClient } from "@tanstack/react-query";
import {
  getCoinsLastTradedUnique,
  getExploreTopVolumeAll24h,
  setApiKey
} from "@zoralabs/coins-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import NotificationIcon from "@/components/Notification/NotificationIcon";
import { Button, Image, Modal } from "@/components/Shared/UI";
import {
  buildReferralLink,
  captureReferralJoin,
  createProfileEngagementNudge,
  dismissSpecialEventPopup,
  EVERY1_ACTIVE_EVENT_POPUP_QUERY_KEY,
  EVERY1_DAILY_STREAK_DASHBOARD_QUERY_KEY,
  EVERY1_ENGAGEMENT_NUDGE_SIGNALS_QUERY_KEY,
  EVERY1_MISSIONS_QUERY_KEY,
  EVERY1_MOBILE_NAV_BADGE_COUNTS_QUERY_KEY,
  EVERY1_NOTIFICATION_COUNT_QUERY_KEY,
  EVERY1_NOTIFICATIONS_QUERY_KEY,
  EVERY1_PROFILE_QUERY_KEY,
  EVERY1_REFERRAL_DASHBOARD_QUERY_KEY,
  getActiveSpecialEventPopup,
  getProfileEngagementNudgeSignals,
  getProfileFanDrops,
  getPublicEvery1Profile,
  markMobileNavBadgeSeen,
  normalizeReferralCode,
  recordDailyLoginStreak,
  syncEvery1Profile,
  syncExploreListingEvents,
  syncFanDropNotifications
} from "@/helpers/every1";
import { formatNairaFromUsd } from "@/helpers/formatNaira";
import getCoinPath from "@/helpers/getCoinPath";
import getZoraApiKey from "@/helpers/getZoraApiKey";
import { listPublicPlatformLaunches } from "@/helpers/platformDiscovery";
import {
  disableBrowserPushSubscription,
  ensureBrowserPushSubscription,
  getBrowserPushPermission,
  getPushPromptStorageKey,
  requestBrowserPushPermission,
  supportsBrowserPush
} from "@/helpers/push";
import { getSupabaseClient, hasSupabaseConfig } from "@/helpers/supabase";
import useEvery1Notifications from "@/hooks/useEvery1Notifications";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";
import type {
  Every1ActivePopupCampaign,
  Every1Notification
} from "@/types/every1";

const zoraApiKey = getZoraApiKey();

if (zoraApiKey) {
  setApiKey(zoraApiKey);
}

type EngagementNudgeCandidate = {
  body: string;
  data?: Record<string, unknown>;
  kind:
    | "buy_activity"
    | "hot_trading"
    | "leaderboard_rank"
    | "mission_winners"
    | "new_drops"
    | "new_missions"
    | "new_perks"
    | "trending_creator";
  sourceKey: string;
  targetKey?: null | string;
  title: string;
};

const getNudgeBucket = (hours = 6) => {
  const now = new Date();
  const utcHourBucket = Math.floor(now.getUTCHours() / hours);

  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}:${utcHourBucket}`;
};

const formatNudgeUsd = (value?: null | number | string) => {
  const parsed = Number.parseFloat(String(value ?? 0));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return formatNairaFromUsd(0);
  }

  return formatNairaFromUsd(parsed, {
    maximumFractionDigits: parsed >= 1000 ? 1 : 2
  });
};

const getCoinLabel = (input: {
  name?: null | string;
  symbol?: null | string;
}) => {
  const symbol = input.symbol?.trim();

  if (symbol) {
    return `\u20A6${symbol}`;
  }

  return input.name?.trim() || "this coin";
};

const normalizeNotificationTarget = (value?: null | string) => {
  const trimmed = value?.trim() || "";

  if (!trimmed) {
    return null;
  }

  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? getCoinPath(trimmed) : trimmed;
};

const getNotificationToastIcon = (
  kind: Every1Notification["kind"] | "browser"
) => <NotificationIcon kind={kind} />;

const withToastEmoji = (title: string, tone: "celebrate" | "neutral") =>
  `${tone === "celebrate" ? "🎉" : "✨"} ${title}`;

const Every1RuntimeBridge = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentAccount } = useAccountStore();
  const {
    setPendingProductTourProfileId,
    lastToastNotificationId,
    pendingReferralCode,
    profile,
    setSignupCelebrationProfileId,
    setLastToastNotificationId,
    setPendingReferralCode,
    setProfile
  } = useEvery1Store();
  const hasConfiguredSupabase = hasSupabaseConfig();
  const hasSyncedProfile = useRef(false);
  const lastStreakCheckKey = useRef<null | string>(null);
  const lastBadgeMarkKey = useRef<null | string>(null);
  const lastFanDropSyncKey = useRef<null | string>(null);
  const exploreSyncInFlight = useRef(false);
  const [activePopupCampaign, setActivePopupCampaign] =
    useState<Every1ActivePopupCampaign | null>(null);

  const notificationQuery = useEvery1Notifications({
    limit: 10,
    refetchInterval: 5000,
    scope: "runtime"
  });

  const latestNotification = useMemo(
    () => notificationQuery.data?.[0] || null,
    [notificationQuery.data]
  );
  const newestUnreadNotification = useMemo(
    () =>
      notificationQuery.data?.find((notification) => !notification.isRead) ||
      null,
    [notificationQuery.data]
  );

  useEffect(() => {
    if (!hasConfiguredSupabase) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const referralCode = normalizeReferralCode(params.get("ref"));

    if (!referralCode) {
      return;
    }

    setPendingReferralCode(referralCode);
    params.delete("ref");
    navigate(
      {
        hash: location.hash,
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : ""
      },
      { replace: true }
    );
  }, [
    hasConfiguredSupabase,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    setPendingReferralCode
  ]);

  useEffect(() => {
    if (!hasConfiguredSupabase) {
      return;
    }

    if (!currentAccount) {
      hasSyncedProfile.current = false;
      setPendingProductTourProfileId(null);
      setProfile(null);
      setSignupCelebrationProfileId(null);
      return;
    }

    let cancelled = false;

    const syncProfile = async () => {
      try {
        let didProfileExistBeforeSync: boolean | null = null;

        try {
          didProfileExistBeforeSync = Boolean(
            await getPublicEvery1Profile({ address: currentAccount.owner })
          );
        } catch {
          didProfileExistBeforeSync = null;
        }

        const syncedProfile = await syncEvery1Profile(currentAccount);

        if (cancelled) {
          return;
        }

        setProfile(syncedProfile);
        hasSyncedProfile.current = true;
        queryClient.setQueryData(
          [EVERY1_PROFILE_QUERY_KEY, syncedProfile.id],
          syncedProfile
        );

        if (didProfileExistBeforeSync === false) {
          setPendingProductTourProfileId(syncedProfile.id);
          setSignupCelebrationProfileId(syncedProfile.id);
        }
      } catch (error) {
        console.error("Failed to sync Every1 profile", error);
      }
    };

    void syncProfile();

    return () => {
      cancelled = true;
    };
  }, [
    currentAccount,
    hasConfiguredSupabase,
    queryClient,
    setPendingProductTourProfileId,
    setProfile,
    setSignupCelebrationProfileId
  ]);

  useEffect(() => {
    if (!hasConfiguredSupabase || !profile?.id) {
      return;
    }

    let cancelled = false;

    const syncLiveFanDrops = async () => {
      try {
        const campaigns = await getProfileFanDrops({
          profileId: profile.id
        });

        if (cancelled || campaigns.length === 0) {
          return;
        }

        const activeFanDropCampaigns = campaigns
          .filter((campaign) => campaign.state !== "ended")
          .map((campaign) => ({
            creatorName: campaign.creatorName || "Every1",
            rewardPoolLabel: campaign.rewardPoolLabel || "Reward pool live",
            slug: campaign.slug,
            state:
              campaign.state === "completed" ||
              campaign.state === "joined" ||
              campaign.state === "live"
                ? campaign.state
                : "live",
            title: campaign.title
          }));

        if (activeFanDropCampaigns.length === 0) {
          return;
        }

        const syncKey = `${profile.id}:${activeFanDropCampaigns.map((campaign) => `${campaign.slug}:${campaign.state}`).join("|")}`;

        if (lastFanDropSyncKey.current === syncKey) {
          return;
        }

        lastFanDropSyncKey.current = syncKey;

        const result = await syncFanDropNotifications(
          profile.id,
          activeFanDropCampaigns
        );

        if (cancelled || result.createdCount <= 0) {
          return;
        }

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [EVERY1_NOTIFICATIONS_QUERY_KEY, profile.id]
          }),
          queryClient.invalidateQueries({
            queryKey: [EVERY1_NOTIFICATION_COUNT_QUERY_KEY, profile.id]
          })
        ]);
      } catch (error) {
        console.error("Failed to sync FanDrop notifications", error);
      }
    };

    void syncLiveFanDrops();

    return () => {
      cancelled = true;
    };
  }, [hasConfiguredSupabase, profile?.id, queryClient]);

  useEffect(() => {
    if (!profile?.id || !supportsBrowserPush()) {
      return;
    }

    let cancelled = false;
    const promptStorageKey = getPushPromptStorageKey(profile.id);

    const enableBrowserPush = async () => {
      try {
        await ensureBrowserPushSubscription(profile.id);

        if (!cancelled) {
          window.localStorage.setItem(promptStorageKey, "enabled");
          toast.success("Browser alerts enabled", {
            description:
              "You’ll now get real Every1 push notifications for rewards, drops, and hot trading.",
            icon: getNotificationToastIcon("browser")
          });
        }
      } catch (error) {
        console.error("Failed to enable browser push", error);

        if (!cancelled) {
          toast.error("Could not enable browser alerts", {
            description:
              "Check your browser notification settings and try again.",
            icon: getNotificationToastIcon("browser")
          });
        }
      }
    };

    const syncBrowserPush = async () => {
      const permission = getBrowserPushPermission();

      if (permission === "granted") {
        await enableBrowserPush();
        return;
      }

      if (permission === "denied") {
        await disableBrowserPushSubscription(profile.id).catch(() => undefined);
        return;
      }

      if (permission !== "default") {
        return;
      }

      if (window.localStorage.getItem(promptStorageKey)) {
        return;
      }

      toast("Turn on browser alerts", {
        action: {
          label: "Enable",
          onClick: () => {
            window.localStorage.setItem(promptStorageKey, "prompted");

            void requestBrowserPushPermission().then((result) => {
              if (result === "granted") {
                void enableBrowserPush();
                return;
              }

              if (!cancelled) {
                toast.message("Browser alerts stayed off for now.", {
                  icon: getNotificationToastIcon("browser")
                });
              }
            });
          }
        },
        cancel: {
          label: "Later",
          onClick: () => {
            window.localStorage.setItem(promptStorageKey, "later");
          }
        },
        description:
          "Enable device alerts for rewards, hot trading, drops, and leaderboard moves.",
        duration: 12000,
        icon: getNotificationToastIcon("browser"),
        id: "enable-browser-push"
      });
    };

    void syncBrowserPush();

    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  useEffect(() => {
    if (!hasConfiguredSupabase || !profile?.id || !pendingReferralCode) {
      return;
    }

    let cancelled = false;

    const connectReferral = async () => {
      try {
        const result = await captureReferralJoin(
          profile.id,
          pendingReferralCode
        );

        if (cancelled) {
          return;
        }

        if (result.captured) {
          toast.success("Referral linked", {
            description: `Your inviter earned ${
              result.e1xpAwarded || 50
            } E1XP now. Your first trade unlocks more.`,
            icon: getNotificationToastIcon("referral")
          });
        }

        setPendingReferralCode(null);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [EVERY1_REFERRAL_DASHBOARD_QUERY_KEY, profile.id]
          }),
          queryClient.invalidateQueries({
            queryKey: [EVERY1_NOTIFICATIONS_QUERY_KEY, profile.id]
          }),
          queryClient.invalidateQueries({
            queryKey: [EVERY1_NOTIFICATION_COUNT_QUERY_KEY, profile.id]
          })
        ]);
      } catch (error) {
        console.error("Failed to capture referral join", error);
      }
    };

    void connectReferral();

    return () => {
      cancelled = true;
    };
  }, [
    hasConfiguredSupabase,
    pendingReferralCode,
    profile?.id,
    queryClient,
    setPendingReferralCode
  ]);

  useEffect(() => {
    if (!hasConfiguredSupabase || !profile?.id || !latestNotification) {
      return;
    }

    if (lastToastNotificationId) {
      return;
    }

    if (latestNotification.kind === "welcome") {
      return;
    }

    setLastToastNotificationId(latestNotification.id);
  }, [
    hasConfiguredSupabase,
    lastToastNotificationId,
    latestNotification,
    profile?.id,
    setLastToastNotificationId
  ]);

  useEffect(() => {
    if (!hasConfiguredSupabase || !profile?.id || !newestUnreadNotification) {
      return;
    }

    if (lastToastNotificationId === newestUnreadNotification.id) {
      return;
    }

    const description =
      newestUnreadNotification.body ||
      (newestUnreadNotification.kind === "referral"
        ? `Open your rewards page to manage ${buildReferralLink(profile.referralCode)}`
        : undefined);
    const isSpecialEventNotification =
      newestUnreadNotification.kind === "system" &&
      newestUnreadNotification.data?.deliveryKind === "notification";

    if (
      newestUnreadNotification.kind === "referral" ||
      newestUnreadNotification.kind === "reward" ||
      newestUnreadNotification.kind === "welcome" ||
      isSpecialEventNotification
    ) {
      toast.success(withToastEmoji(newestUnreadNotification.title, "celebrate"), {
        description,
        icon: getNotificationToastIcon(newestUnreadNotification.kind)
      });
    } else {
      toast(withToastEmoji(newestUnreadNotification.title, "neutral"), {
        description,
        icon: getNotificationToastIcon(newestUnreadNotification.kind)
      });
    }

    setLastToastNotificationId(newestUnreadNotification.id);
  }, [
    hasConfiguredSupabase,
    lastToastNotificationId,
    newestUnreadNotification,
    profile?.id,
    profile?.referralCode,
    setLastToastNotificationId
  ]);

  useEffect(() => {
    if (!hasConfiguredSupabase || !currentAccount || !profile?.id) {
      return;
    }

    const todayKey = new Date().toISOString().slice(0, 10);
    const checkKey = `${profile.id}:${todayKey}`;

    if (lastStreakCheckKey.current === checkKey) {
      return;
    }

    lastStreakCheckKey.current = checkKey;
    let cancelled = false;

    const checkInDailyStreak = async () => {
      try {
        const result = await recordDailyLoginStreak(profile.id);

        if (cancelled || !result.claimed) {
          return;
        }

        if (result.notificationId) {
          setLastToastNotificationId(result.notificationId);
        }

        toast.success(
          withToastEmoji(
            `Daily streak claimed: day ${result.currentStreak}`,
            "celebrate"
          ),
          {
            description: `+${result.rewardE1xp} E1XP added to your balance.`,
            icon: getNotificationToastIcon("streak")
          }
        );

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [EVERY1_DAILY_STREAK_DASHBOARD_QUERY_KEY, profile.id]
          }),
          queryClient.invalidateQueries({
            queryKey: [EVERY1_MISSIONS_QUERY_KEY, profile.id]
          }),
          queryClient.invalidateQueries({
            queryKey: [EVERY1_NOTIFICATIONS_QUERY_KEY, profile.id]
          }),
          queryClient.invalidateQueries({
            queryKey: [EVERY1_NOTIFICATION_COUNT_QUERY_KEY, profile.id]
          })
        ]);
      } catch (error) {
        console.error("Failed to record daily streak", error);
      }
    };

    void checkInDailyStreak();

    return () => {
      cancelled = true;
    };
  }, [
    currentAccount,
    hasConfiguredSupabase,
    profile?.id,
    queryClient,
    setLastToastNotificationId
  ]);

  useEffect(() => {
    if (!hasConfiguredSupabase || !profile?.id) {
      return;
    }

    const badgeKey = location.pathname.startsWith("/leaderboard")
      ? "leaderboard_updates"
      : location.pathname.startsWith("/creators")
        ? "creators_new_profiles"
        : location.pathname === "/"
          ? "explore_new_coins"
          : null;

    if (!badgeKey) {
      return;
    }

    const markKey = `${profile.id}:${badgeKey}:${location.key}`;

    if (lastBadgeMarkKey.current === markKey) {
      return;
    }

    lastBadgeMarkKey.current = markKey;
    let cancelled = false;

    const markBadgeAsSeen = async () => {
      try {
        await markMobileNavBadgeSeen(profile.id, badgeKey);

        if (cancelled) {
          return;
        }

        await queryClient.invalidateQueries({
          queryKey: [EVERY1_MOBILE_NAV_BADGE_COUNTS_QUERY_KEY, profile.id]
        });
      } catch (error) {
        console.error("Failed to mark mobile badge as seen", error);
      }
    };

    void markBadgeAsSeen();

    return () => {
      cancelled = true;
    };
  }, [
    hasConfiguredSupabase,
    location.key,
    location.pathname,
    profile?.id,
    queryClient
  ]);

  useEffect(() => {
    if (!hasConfiguredSupabase || !profile?.id) {
      return;
    }

    let cancelled = false;

    const syncLatestExploreListings = async () => {
      if (exploreSyncInFlight.current) {
        return;
      }

      exploreSyncInFlight.current = true;

      try {
        const launches = await listPublicPlatformLaunches({ limit: 24 });
        const items = launches.map((launch) => ({
          coinAddress: launch.coinAddress,
          creatorAddress: launch.creator.walletAddress || null,
          imageUrl: launch.coverImageUrl || launch.creator.avatarUrl || null,
          listedAt: launch.launchedAt || launch.createdAt || null,
          name: launch.name || null,
          source: "every1_platform",
          ticker: launch.ticker || null
        }));

        await syncExploreListingEvents(items);

        if (cancelled) {
          return;
        }

        await queryClient.invalidateQueries({
          queryKey: [EVERY1_MOBILE_NAV_BADGE_COUNTS_QUERY_KEY, profile.id]
        });
      } catch (error) {
        console.error("Failed to sync explore listing badge events", error);
      } finally {
        exploreSyncInFlight.current = false;
      }
    };

    void syncLatestExploreListings();
    const interval = window.setInterval(() => {
      void syncLatestExploreListings();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hasConfiguredSupabase, profile?.id, queryClient]);

  useEffect(() => {
    if (
      !hasConfiguredSupabase ||
      !profile?.id ||
      location.pathname === "/staff"
    ) {
      setActivePopupCampaign(null);
      return;
    }

    let cancelled = false;

    const loadPopupCampaign = async () => {
      try {
        const campaign = await getActiveSpecialEventPopup(profile.id);

        if (!cancelled) {
          setActivePopupCampaign(campaign);
          queryClient.setQueryData(
            [EVERY1_ACTIVE_EVENT_POPUP_QUERY_KEY, profile.id],
            campaign
          );
        }
      } catch (error) {
        console.error("Failed to load active popup campaign", error);
      }
    };

    void loadPopupCampaign();
    const interval = window.setInterval(() => {
      void loadPopupCampaign();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hasConfiguredSupabase, location.pathname, profile?.id, queryClient]);

  useEffect(() => {
    if (
      !hasConfiguredSupabase ||
      !profile?.id ||
      location.pathname === "/staff"
    ) {
      return;
    }

    const supabase = getSupabaseClient();
    const notificationChannel = supabase
      .channel(`every1-notifications:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          filter: `recipient_id=eq.${profile.id}`,
          schema: "public",
          table: "notifications"
        },
        async () => {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: [EVERY1_NOTIFICATIONS_QUERY_KEY, profile.id]
            }),
            queryClient.invalidateQueries({
              queryKey: [EVERY1_NOTIFICATION_COUNT_QUERY_KEY, profile.id]
            })
          ]);
        }
      );

    const popupChannel = supabase
      .channel(`every1-special-events:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_special_event_campaigns"
        },
        async () => {
          try {
            const campaign = await getActiveSpecialEventPopup(profile.id);
            setActivePopupCampaign(campaign);
            queryClient.setQueryData(
              [EVERY1_ACTIVE_EVENT_POPUP_QUERY_KEY, profile.id],
              campaign
            );
          } catch (error) {
            console.error("Failed to refresh popup campaign", error);
          }
        }
      );

    notificationChannel.subscribe();
    popupChannel.subscribe();

    return () => {
      void supabase.removeChannel(notificationChannel);
      void supabase.removeChannel(popupChannel);
    };
  }, [hasConfiguredSupabase, location.pathname, profile?.id, queryClient]);

  useEffect(() => {
    if (!hasConfiguredSupabase || !profile?.id || !zoraApiKey) {
      return;
    }

    let cancelled = false;

    const maybeDeliverEngagementNudge = async () => {
      try {
        const signals = await getProfileEngagementNudgeSignals(profile.id);

        if (cancelled) {
          return;
        }

        if (
          signals.cooldownUntil &&
          new Date(signals.cooldownUntil).getTime() > Date.now()
        ) {
          return;
        }

        const [hotTradingResponse, buyActivityResponse] = await Promise.all([
          getExploreTopVolumeAll24h({ count: 1 }),
          getCoinsLastTradedUnique({ count: 1 })
        ]);

        if (cancelled) {
          return;
        }

        const hotTradingCoin =
          hotTradingResponse.data?.exploreList?.edges?.[0]?.node;
        const buyActivityCoin =
          buyActivityResponse.data?.exploreList?.edges?.[0]?.node;
        const bucketKey = getNudgeBucket();
        const candidates: EngagementNudgeCandidate[] = [];

        if (signals.activeCreatorOfWeek?.campaignId) {
          const creatorName =
            signals.activeCreatorOfWeek.displayName ||
            signals.activeCreatorOfWeek.username ||
            "Creator of the week";
          const creatorTarget = signals.activeCreatorOfWeek.username
            ? `/@${signals.activeCreatorOfWeek.username}`
            : signals.activeCreatorOfWeek.walletAddress
              ? `/account/${signals.activeCreatorOfWeek.walletAddress}`
              : "/creators";

          candidates.push({
            body: signals.activeCreatorOfWeek.category
              ? `${creatorName} is this week's ${signals.activeCreatorOfWeek.category} pick. Check the price before the crowd piles in.`
              : `${creatorName} is taking over this week. Check the price and story before the next wave hits.`,
            data: {
              campaignId: signals.activeCreatorOfWeek.campaignId,
              category: signals.activeCreatorOfWeek.category,
              creatorEarningsUsd:
                signals.activeCreatorOfWeek.creatorEarningsUsd,
              featuredPriceUsd: signals.activeCreatorOfWeek.featuredPriceUsd,
              profileId: signals.activeCreatorOfWeek.profileId
            },
            kind: "trending_creator",
            sourceKey: `creator-of-week:${signals.activeCreatorOfWeek.campaignId}`,
            targetKey: creatorTarget,
            title: `Trending creator: ${creatorName}`
          });
        }

        if (hotTradingCoin?.address) {
          candidates.push({
            body: `${getCoinLabel({
              name: hotTradingCoin.name,
              symbol: hotTradingCoin.symbol
            })} is moving ${formatNudgeUsd(hotTradingCoin.volume24h)} in 24h volume. Catch the momentum while it's hot.`,
            data: {
              coinAddress: hotTradingCoin.address,
              source: "zora_top_volume",
              volume24h: hotTradingCoin.volume24h
            },
            kind: "hot_trading",
            sourceKey: `hot-trading:${hotTradingCoin.address.toLowerCase()}:${bucketKey}`,
            targetKey: getCoinPath(hotTradingCoin.address),
            title: `${getCoinLabel({
              name: hotTradingCoin.name,
              symbol: hotTradingCoin.symbol
            })} is hot right now`
          });
        }

        if (buyActivityCoin?.address) {
          candidates.push({
            body: `Fresh trade activity is hitting ${getCoinLabel({
              name: buyActivityCoin.name,
              symbol: buyActivityCoin.symbol
            })}. Jump in before you miss the next entry.`,
            data: {
              coinAddress: buyActivityCoin.address,
              source: "zora_last_traded_unique",
              volume24h: buyActivityCoin.volume24h
            },
            kind: "buy_activity",
            sourceKey: `buy-activity:${buyActivityCoin.address.toLowerCase()}:${bucketKey}`,
            targetKey: getCoinPath(buyActivityCoin.address),
            title: `Fresh buyers are moving on ${getCoinLabel({
              name: buyActivityCoin.name,
              symbol: buyActivityCoin.symbol
            })}`
          });
        }

        if (signals.latestLeaderboardUpdate?.id) {
          candidates.push({
            body:
              signals.latestLeaderboardUpdate.body ||
              "The latest leaderboard just shifted. Check the new ranks before everyone else does.",
            data: {
              leaderboardUpdateId: signals.latestLeaderboardUpdate.id,
              source: "leaderboard_updates"
            },
            kind: "leaderboard_rank",
            sourceKey: `leaderboard:${signals.latestLeaderboardUpdate.id}`,
            targetKey: normalizeNotificationTarget(
              signals.latestLeaderboardUpdate.targetKey
            ),
            title: "Leaderboard just moved"
          });
        }

        if (signals.newDropsCount > 0) {
          candidates.push({
            body: `${signals.newDropsCount} new drops hit Explore in the last day. Get in early before they disappear into the feed.`,
            data: {
              newDropsCount: signals.newDropsCount
            },
            kind: "new_drops",
            sourceKey: `new-drops:${bucketKey}:${signals.newDropsCount}`,
            targetKey: "/",
            title:
              signals.newDropsCount === 1
                ? "A new drop is live"
                : `${signals.newDropsCount} new drops are live`
          });
        }

        if (signals.latestMission?.id) {
          candidates.push({
            body: `${signals.latestMission.title} is live now. Lock in +${signals.latestMission.rewardE1xp} E1XP before the next reward wave passes.`,
            data: {
              missionId: signals.latestMission.id,
              rewardE1xp: signals.latestMission.rewardE1xp,
              slug: signals.latestMission.slug
            },
            kind: "new_missions",
            sourceKey: `mission:${signals.latestMission.id}`,
            targetKey: "/fandrop",
            title: "New mission unlocked"
          });
        }

        if (
          signals.topPerkMission?.id &&
          signals.topPerkMission.id !== signals.latestMission?.id
        ) {
          candidates.push({
            body: `${signals.topPerkMission.title} is paying +${signals.topPerkMission.rewardE1xp} E1XP right now. Don’t leave the perk sitting there.`,
            data: {
              missionId: signals.topPerkMission.id,
              rewardE1xp: signals.topPerkMission.rewardE1xp,
              slug: signals.topPerkMission.slug
            },
            kind: "new_perks",
            sourceKey: `perk:${signals.topPerkMission.id}:${signals.topPerkMission.rewardE1xp}`,
            targetKey: "/fandrop",
            title: "New perks are up for grabs"
          });
        }

        if (signals.missionWinners24h > 0) {
          candidates.push({
            body: `${signals.missionWinners24h} users already won mission rewards in the last 24 hours. Don’t watch the next payout from the sidelines.`,
            data: {
              missionWinners24h: signals.missionWinners24h
            },
            kind: "mission_winners",
            sourceKey: `mission-winners:${bucketKey}:${signals.missionWinners24h}`,
            targetKey: "/fandrop",
            title: "Mission rewards are landing"
          });
        }

        if (!candidates.length) {
          return;
        }

        const selectedCandidate =
          candidates[Math.floor(Math.random() * candidates.length)];
        const result = await createProfileEngagementNudge({
          body: selectedCandidate.body,
          cooldownMinutes: 45,
          data: selectedCandidate.data,
          kind: selectedCandidate.kind,
          profileId: profile.id,
          sourceKey: selectedCandidate.sourceKey,
          targetKey: selectedCandidate.targetKey,
          title: selectedCandidate.title
        });

        if (cancelled || !result.created) {
          return;
        }

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [EVERY1_ENGAGEMENT_NUDGE_SIGNALS_QUERY_KEY, profile.id]
          }),
          queryClient.invalidateQueries({
            queryKey: [EVERY1_NOTIFICATIONS_QUERY_KEY, profile.id]
          }),
          queryClient.invalidateQueries({
            queryKey: [EVERY1_NOTIFICATION_COUNT_QUERY_KEY, profile.id]
          })
        ]);
      } catch (error) {
        console.error("Failed to deliver engagement nudge", error);
      }
    };

    void maybeDeliverEngagementNudge();
    const interval = window.setInterval(() => {
      void maybeDeliverEngagementNudge();
    }, 180_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hasConfiguredSupabase, profile?.id, queryClient]);

  const closePopupCampaign = async () => {
    if (!profile?.id || !activePopupCampaign) {
      setActivePopupCampaign(null);
      return;
    }

    try {
      await dismissSpecialEventPopup(profile.id, activePopupCampaign.id);
      await queryClient.invalidateQueries({
        queryKey: [EVERY1_ACTIVE_EVENT_POPUP_QUERY_KEY, profile.id]
      });
    } catch (error) {
      console.error("Failed to dismiss popup campaign", error);
    } finally {
      setActivePopupCampaign(null);
    }
  };

  const handlePopupCampaignCta = async () => {
    const ctaUrl = activePopupCampaign?.ctaUrl?.trim();

    if (!ctaUrl) {
      await closePopupCampaign();
      return;
    }

    await closePopupCampaign();

    if (ctaUrl.startsWith("/")) {
      navigate(ctaUrl);
      return;
    }

    window.open(ctaUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Modal
      onClose={() => void closePopupCampaign()}
      show={Boolean(activePopupCampaign)}
      size="sm"
    >
      {activePopupCampaign ? (
        <div className="space-y-0">
          {activePopupCampaign.bannerUrl ? (
            <Image
              alt={activePopupCampaign.title}
              className="h-44 w-full object-cover"
              src={activePopupCampaign.bannerUrl}
            />
          ) : null}
          <div className="space-y-4 p-5">
            {activePopupCampaign.eventTag ? (
              <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold text-[11px] text-emerald-700 uppercase tracking-[0.14em] dark:text-emerald-300">
                {activePopupCampaign.eventTag}
              </span>
            ) : null}
            <div>
              <h3 className="font-semibold text-[1.2rem] text-gray-950 leading-tight dark:text-gray-50">
                {activePopupCampaign.title}
              </h3>
              <p className="mt-2 text-gray-600 text-sm leading-6 dark:text-gray-300">
                {activePopupCampaign.body}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-w-[8rem] flex-1"
                onClick={() => void handlePopupCampaignCta()}
              >
                {activePopupCampaign.ctaLabel || "Open"}
              </Button>
              <Button onClick={() => void closePopupCampaign()} outline>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
};

export default Every1RuntimeBridge;
