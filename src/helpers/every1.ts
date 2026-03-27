import getAvatar from "@/helpers/getAvatar";
import sanitizeDStorageUrl from "@/helpers/sanitizeDStorageUrl";
import { getSupabaseClient } from "@/helpers/supabase";
import type { AccountFragment } from "@/indexer/generated";
import type {
  DailyStreakClaimResult,
  DailyStreakDashboard,
  Every1ActivePopupCampaign,
  Every1CoinChatMessage,
  Every1CoinChatMutationResult,
  Every1Collaboration,
  Every1CollaborationCancelResult,
  Every1CollaborationEarningsItem,
  Every1CollaborationEarningsSummary,
  Every1CollaborationInviteInput,
  Every1CollaborationInviteResult,
  Every1CollaborationLaunchResult,
  Every1CollaborationMember,
  Every1CollaborationPayoutAuditItem,
  Every1CollaborationPayoutItem,
  Every1CollaborationResponseResult,
  Every1CollaborationRuntimeConfig,
  Every1CollaborationSettlementItem,
  Every1CommunityDetails,
  Every1CommunityMember,
  Every1CommunityMutationResult,
  Every1CommunityPost,
  Every1CommunitySummary,
  Every1CommunityVerificationConfirmation,
  Every1CommunityVerificationConfirmationResult,
  Every1CommunityVerificationContext,
  Every1CommunityVerificationRequestResult,
  Every1EngagementNudgeResult,
  Every1EngagementNudgeSignals,
  Every1FanDropCampaign,
  Every1FanDropCampaignNotificationInput,
  Every1FanDropJoinResult,
  Every1FanDropNotificationSyncResult,
  Every1FanDropParticipation,
  Every1FanDropRuntimeConfig,
  Every1FanDropUpsertInput,
  Every1FanDropUpsertResult,
  Every1FollowListProfile,
  Every1FollowMutationResult,
  Every1FollowRelationship,
  Every1FollowStats,
  Every1Mission,
  Every1MobileNavBadgeCounts,
  Every1MobileNavBadgeKey,
  Every1MobileNavBadgeSeenResult,
  Every1Notification,
  Every1Profile,
  Every1ProfileSocialAccount,
  Every1ProfileVerificationRequest,
  Every1PublicCoinCollaboration,
  Every1PublicCollaborationMember,
  Every1PublicProfileStats,
  Every1VerificationProofResult,
  Every1WalletActivityItem,
  Every1WalletRewardToken,
  MissionClaimResult,
  ReferralDashboard,
  ReferralJoinResult,
  ReferralRewardResult
} from "@/types/every1";

export const EVERY1_PROFILE_QUERY_KEY = "every1-profile";
export const EVERY1_REFERRAL_DASHBOARD_QUERY_KEY = "every1-referral-dashboard";
export const EVERY1_NOTIFICATIONS_QUERY_KEY = "every1-notifications";
export const EVERY1_NOTIFICATION_COUNT_QUERY_KEY = "every1-notification-count";
export const EVERY1_DAILY_STREAK_DASHBOARD_QUERY_KEY =
  "every1-daily-streak-dashboard";
export const EVERY1_MISSIONS_QUERY_KEY = "every1-missions";
export const EVERY1_FANDROPS_QUERY_KEY = "every1-fandrops";
export const EVERY1_FANDROP_PARTICIPATION_QUERY_KEY =
  "every1-fandrop-participation";
export const EVERY1_MOBILE_NAV_BADGE_COUNTS_QUERY_KEY =
  "every1-mobile-nav-badge-counts";
export const EVERY1_PROFILE_SOCIAL_ACCOUNTS_QUERY_KEY =
  "every1-profile-social-accounts";
export const EVERY1_PROFILE_VERIFICATION_REQUESTS_QUERY_KEY =
  "every1-profile-verification-requests";
export const EVERY1_PUBLIC_PROFILE_STATS_QUERY_KEY =
  "every1-public-profile-stats";
export const EVERY1_PUBLIC_COIN_COLLABORATIONS_QUERY_KEY =
  "every1-public-coin-collaborations";
export const EVERY1_COLLABORATIONS_QUERY_KEY = "every1-collaborations";
export const EVERY1_COLLABORATION_EARNINGS_SUMMARY_QUERY_KEY =
  "every1-collaboration-earnings-summary";
export const EVERY1_COLLABORATION_EARNINGS_QUERY_KEY =
  "every1-collaboration-earnings";
export const EVERY1_COLLABORATION_PAYOUTS_QUERY_KEY =
  "every1-collaboration-payouts";
export const EVERY1_COLLABORATION_SETTLEMENTS_QUERY_KEY =
  "every1-collaboration-settlements";
export const EVERY1_COLLABORATION_PAYOUT_AUDIT_QUERY_KEY =
  "every1-collaboration-payout-audit";
export const EVERY1_WALLET_ACTIVITY_QUERY_KEY = "every1-wallet-activity";
export const EVERY1_WALLET_REWARD_TOKENS_QUERY_KEY =
  "every1-wallet-reward-tokens";
export const EVERY1_FOLLOW_STATS_QUERY_KEY = "every1-follow-stats";
export const EVERY1_FOLLOW_RELATIONSHIP_QUERY_KEY =
  "every1-follow-relationship";
export const EVERY1_FOLLOW_LIST_QUERY_KEY = "every1-follow-list";
export const EVERY1_COMMUNITIES_QUERY_KEY = "every1-communities";
export const EVERY1_COMMUNITY_QUERY_KEY = "every1-community";
export const EVERY1_COMMUNITY_FEED_QUERY_KEY = "every1-community-feed";
export const EVERY1_COMMUNITY_VERIFICATION_QUERY_KEY =
  "every1-community-verification";
export const EVERY1_COMMUNITY_VERIFICATION_CONFIRMATIONS_QUERY_KEY =
  "every1-community-verification-confirmations";
export const EVERY1_ENGAGEMENT_NUDGE_SIGNALS_QUERY_KEY =
  "every1-engagement-nudge-signals";
export const EVERY1_ACTIVE_EVENT_POPUP_QUERY_KEY = "every1-active-event-popup";
export const EVERY1_COIN_CHAT_QUERY_KEY = "every1-coin-chat";

const PUBLIC_PROFILE_SELECT =
  "id, username, display_name, bio, avatar_url, banner_url, wallet_address, execution_wallet_address, lens_account_address, zora_handle, verification_status, verification_category, verified_at";

type PublicProfileRow = {
  avatar_url: null | string;
  banner_url: null | string;
  bio: null | string;
  display_name: null | string;
  execution_wallet_address: null | string;
  id: string;
  lens_account_address: null | string;
  username: null | string;
  verification_category: null | string;
  verification_status: Every1Profile["verificationStatus"];
  verified_at: null | string;
  wallet_address: null | string;
  zora_handle: null | string;
};

type CommunityRow = {
  avatar_url: null | string;
  banner_url: null | string;
  description: null | string;
  id: string;
  is_member: boolean;
  is_owner: boolean;
  joined_at: null | string;
  member_count: number | string;
  membership_role: Every1CommunitySummary["membershipRole"];
  membership_status: Every1CommunitySummary["membershipStatus"];
  name: string;
  owner_avatar_url: null | string;
  owner_display_name: null | string;
  owner_id: string;
  owner_username: null | string;
  post_count: number | string;
  slug: string;
  status: Every1CommunitySummary["status"];
  verification_kind: Every1CommunitySummary["verificationKind"];
  verification_status: Every1CommunitySummary["verificationStatus"];
  verified_at: null | string;
  visibility: Every1CommunitySummary["visibility"];
};

type CommunityMemberRow = {
  avatar_url: null | string;
  display_name: null | string;
  id: string;
  joined_at: null | string;
  role: Every1CommunityMember["role"];
  username: null | string;
  wallet_address: null | string;
};

type NotificationRow = {
  actor_avatar_url: null | string;
  actor_display_name: null | string;
  actor_id: null | string;
  actor_username: null | string;
  body: null | string;
  created_at: string;
  data: Record<string, unknown>;
  id: string;
  is_read: boolean;
  kind: Every1Notification["kind"];
  target_key: null | string;
  title: string;
};

type FollowListRow = {
  avatar_url: null | string;
  banner_url: null | string;
  bio: null | string;
  display_name: null | string;
  execution_wallet_address?: null | string;
  followed_at: string;
  id: string;
  lens_account_address: null | string;
  username: null | string;
  wallet_address: null | string;
  zora_handle: null | string;
};

type CommunityPostRow = {
  author_avatar_url: null | string;
  author_display_name: null | string;
  author_profile_id: string;
  author_username: null | string;
  body: string;
  community_id: string;
  created_at: string;
  id: string;
  media_url: null | string;
  updated_at: string;
};

type SocialAccountRow = {
  avatar_url: null | string;
  created_at: string;
  display_name: null | string;
  handle: string;
  id: string;
  is_primary: boolean;
  is_verified: boolean;
  last_verified_at: null | string;
  linked_at: string;
  profile_url: null | string;
  provider: Every1ProfileSocialAccount["provider"];
  provider_user_id: null | string;
};

type VerificationRequestRow = {
  admin_note: null | string;
  category: null | string;
  claimed_handle: string;
  created_at: string;
  id: string;
  note: null | string;
  proof_checked_at: null | string;
  proof_error: null | string;
  proof_handle: null | string;
  proof_post_id: null | string;
  proof_post_url: null | string;
  proof_posted_text: null | string;
  proof_status: Every1ProfileVerificationRequest["proofStatus"];
  proof_verified_at: null | string;
  provider: Every1ProfileVerificationRequest["provider"];
  reviewed_at: null | string;
  status: Every1ProfileVerificationRequest["status"];
  verification_code: string;
};

type CoinChatMessageRow = {
  author_avatar_url: null | string;
  author_display_name: null | string;
  author_profile_id: string;
  author_username: null | string;
  body: string;
  coin_address: string;
  created_at: string;
  id: string;
};

type PopupCampaignRow = {
  banner_url: null | string;
  body: string;
  cta_label: null | string;
  cta_url: null | string;
  event_tag: null | string;
  id: string;
  priority: number;
  title: string;
  triggered_at: null | string;
};

type PublicProfileStatsRow = {
  creator_coin_address: null | string;
  creator_coin_ticker: null | string;
  profile_id: null | string;
  referral_coin_rewards: null | number | string;
};

type PublicCoinCollaborationMemberRow = {
  acceptedAt: null | string;
  avatarUrl: null | string;
  displayName: null | string;
  inviteExpiresAt: null | string;
  joinedAt: null | string;
  note: null | string;
  profileId: string;
  role: Every1PublicCollaborationMember["role"];
  splitPercent: null | number | string;
  status: Every1PublicCollaborationMember["status"];
  username: null | string;
  walletAddress: null | string;
};

type PublicCoinCollaborationRow = {
  active_member_count: number | string;
  coin_address: string;
  collaboration_id: string;
  cover_image_url: null | string;
  description: null | string;
  launch_id: string;
  launched_at: null | string;
  members: PublicCoinCollaborationMemberRow[] | null;
  owner_avatar_url: null | string;
  owner_display_name: null | string;
  owner_id: string;
  owner_username: null | string;
  ticker: string;
  title: string;
};

type CollaborationMemberRow = {
  acceptedAt: null | string;
  avatarUrl: null | string;
  displayName: null | string;
  inviteExpiresAt: null | string;
  joinedAt: null | string;
  note: null | string;
  profileId: string;
  role: Every1CollaborationMember["role"];
  splitPercent: null | number | string;
  status: Every1CollaborationMember["status"];
  username: null | string;
};

type CollaborationRow = {
  accepted_at: null | string;
  active_member_count: number;
  collaboration_id: string;
  coin_address: null | string;
  cover_image_url: null | string;
  created_at: string;
  description: null | string;
  invite_expires_at: null | string;
  is_expired: boolean;
  launch_id: null | string;
  launch_status: Every1Collaboration["launchStatus"];
  metadata_uri: null | string;
  members: CollaborationMemberRow[] | null;
  owner_avatar_url: null | string;
  owner_display_name: null | string;
  owner_id: string;
  owner_username: null | string;
  pending_member_count: number;
  split_locked_at: null | string;
  status: Every1Collaboration["status"];
  ticker: string;
  title: string;
  viewer_can_cancel: boolean;
  viewer_can_launch: boolean;
  viewer_can_respond: boolean;
  viewer_role: Every1Collaboration["viewerRole"];
  viewer_status: Every1Collaboration["viewerStatus"];
};

type CollaborationEarningsSummaryRow = {
  allocation_count: number | string;
  collaboration_count: number | string;
  last_earned_at: null | string;
  latest_amount: null | number | string;
  latest_coin_symbol: null | string;
};

type CollaborationEarningsRow = {
  allocation_count: number | string;
  coin_address: null | string;
  coin_symbol: null | string;
  collaboration_id: string;
  last_earned_at: null | string;
  ticker: string;
  title: string;
  total_amount: null | number | string;
};

type CollaborationPayoutRow = {
  allocation_id: string;
  amount: null | number | string;
  coin_address: string;
  coin_symbol: string;
  collaboration_id: string;
  created_at: string;
  error_message: null | string;
  payout_attempted_at: null | string;
  recipient_wallet_address: null | string;
  sent_at: null | string;
  split_percent: null | number | string;
  status: Every1CollaborationPayoutItem["status"];
  ticker: string;
  title: string;
  tx_hash: null | string;
};

type CollaborationSettlementRow = {
  coin_address: string;
  coin_symbol: string;
  collaboration_id: string;
  collaboration_status: string;
  failed_amount: null | number | string;
  failed_count: null | number | string;
  gross_amount: null | number | string;
  last_activity_at: null | string;
  launch_status: string;
  paid_amount: null | number | string;
  paid_count: null | number | string;
  payouts_paused: boolean;
  payouts_paused_at: null | string;
  payouts_paused_reason: null | string;
  queued_amount: null | number | string;
  queued_count: null | number | string;
  reward_token_decimals: null | number | string;
  source_types: null | string[];
  ticker: string;
  title: string;
  total_count: null | number | string;
  viewer_split_percent: null | number | string;
};

type CollaborationPayoutAuditRow = {
  allocation_id: string;
  amount: null | number | string;
  coin_address: string;
  coin_symbol: string;
  collaboration_id: string;
  created_at: string;
  error_message: null | string;
  payout_attempted_at: null | string;
  recipient_name: null | string;
  recipient_profile_id: string;
  recipient_username: null | string;
  recipient_wallet_address: null | string;
  sent_at: null | string;
  source_type: string;
  split_percent: null | number | string;
  status: Every1CollaborationPayoutItem["status"];
  ticker: string;
  title: string;
  tx_hash: null | string;
};

type WalletRewardTokenRow = {
  last_received_at: null | string;
  reward_count: number | string;
  token_address: string;
  token_decimals: number | string;
  token_symbol: string;
};

type WalletActivityRow = {
  activity_id: string;
  activity_kind: Every1WalletActivityItem["activityKind"];
  amount: null | number | string;
  created_at: string;
  source_name: string;
  status: string;
  target_key: null | string;
  token_address: string;
  token_symbol: string;
  tx_hash: null | string;
};

const callRpc = async <TData>(
  fn: string,
  args?: Record<string, unknown>
): Promise<TData> => {
  const { data, error } = await getSupabaseClient().rpc(fn, args);

  if (error) {
    throw error;
  }

  return data as TData;
};

const parseResponseError = async (response: Response) => {
  try {
    const payload = await response.json();
    return (
      payload?.error ||
      payload?.message ||
      `${response.status} ${response.statusText}`
    );
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const fetchJson = async <TData>(
  input: string,
  init?: RequestInit
): Promise<TData> => {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(await parseResponseError(response));
  }

  return (await response.json()) as TData;
};

const asRemoteAsset = (value?: null | string) => {
  const sanitized = sanitizeDStorageUrl(value || undefined);

  return /^https?:\/\//.test(sanitized) ? sanitized : null;
};

const getPreferredUsername = (account: AccountFragment) =>
  account.username?.localName ||
  account.username?.value?.split("/").pop() ||
  null;

const getCoverPicture = (account: AccountFragment) =>
  typeof account.metadata?.coverPicture === "string"
    ? account.metadata.coverPicture
    : null;

const normalizeHandle = (value?: null | string) =>
  (value || "").trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, "") ||
  null;

const normalizeWalletAddress = (value?: null | string) =>
  value?.trim().toLowerCase() || null;

const toNumber = (value?: null | number | string) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const mapProfileRow = (
  row: PublicProfileRow,
  extras?: {
    e1xpTotal?: number;
    referralCode?: null | string;
  }
): Every1Profile => ({
  avatarUrl: row.avatar_url,
  bannerUrl: row.banner_url,
  bio: row.bio,
  displayName: row.display_name,
  e1xpTotal: extras?.e1xpTotal || 0,
  executionWalletAddress: row.execution_wallet_address,
  id: row.id,
  lensAccountAddress: row.lens_account_address,
  referralCode: extras?.referralCode || null,
  username: row.username,
  verificationCategory: row.verification_category,
  verificationStatus: row.verification_status || "unverified",
  verifiedAt: row.verified_at,
  walletAddress: row.wallet_address,
  zoraHandle: row.zora_handle
});

const mapCommunityRow = (row: CommunityRow): Every1CommunitySummary => ({
  avatarUrl: row.avatar_url,
  bannerUrl: row.banner_url,
  description: row.description,
  id: row.id,
  isMember: Boolean(row.is_member),
  isOwner: Boolean(row.is_owner),
  joinedAt: row.joined_at,
  memberCount: toNumber(row.member_count),
  membershipRole: row.membership_role,
  membershipStatus: row.membership_status,
  name: row.name,
  ownerAvatarUrl: row.owner_avatar_url,
  ownerDisplayName: row.owner_display_name,
  ownerId: row.owner_id,
  ownerUsername: row.owner_username,
  postCount: toNumber(row.post_count),
  slug: row.slug,
  status: row.status,
  verificationKind: row.verification_kind,
  verificationStatus: row.verification_status || "unverified",
  verifiedAt: row.verified_at,
  visibility: row.visibility
});

const mapCommunityMemberRow = (
  row: CommunityMemberRow
): Every1CommunityMember => ({
  avatarUrl: row.avatar_url,
  displayName: row.display_name,
  id: row.id,
  joinedAt: row.joined_at,
  role: row.role,
  username: row.username,
  walletAddress: row.wallet_address
});

const mapFollowListProfile = (row: FollowListRow): Every1FollowListProfile => ({
  avatarUrl: row.avatar_url,
  bannerUrl: row.banner_url,
  bio: row.bio,
  displayName: row.display_name,
  followedAt: row.followed_at,
  id: row.id,
  lensAccountAddress: row.lens_account_address,
  username: row.username,
  walletAddress: row.wallet_address,
  zoraHandle: row.zora_handle
});

const mapCommunityPostRow = (row: CommunityPostRow): Every1CommunityPost => ({
  authorAvatarUrl: row.author_avatar_url,
  authorDisplayName: row.author_display_name,
  authorProfileId: row.author_profile_id,
  authorUsername: row.author_username,
  body: row.body,
  communityId: row.community_id,
  createdAt: row.created_at,
  id: row.id,
  mediaUrl: row.media_url,
  updatedAt: row.updated_at
});

const mapSocialAccountRow = (
  row: SocialAccountRow
): Every1ProfileSocialAccount => ({
  avatarUrl: row.avatar_url,
  createdAt: row.created_at,
  displayName: row.display_name,
  handle: row.handle,
  id: row.id,
  isPrimary: row.is_primary,
  isVerified: row.is_verified,
  lastVerifiedAt: row.last_verified_at,
  linkedAt: row.linked_at,
  profileUrl: row.profile_url,
  provider: row.provider,
  providerUserId: row.provider_user_id
});

const mapVerificationRequestRow = (
  row: VerificationRequestRow
): Every1ProfileVerificationRequest => ({
  adminNote: row.admin_note,
  category: row.category,
  claimedHandle: row.claimed_handle,
  createdAt: row.created_at,
  id: row.id,
  note: row.note,
  proofCheckedAt: row.proof_checked_at,
  proofError: row.proof_error,
  proofHandle: row.proof_handle,
  proofPostedText: row.proof_posted_text,
  proofPostId: row.proof_post_id,
  proofPostUrl: row.proof_post_url,
  proofStatus: row.proof_status,
  proofVerifiedAt: row.proof_verified_at,
  provider: row.provider,
  reviewedAt: row.reviewed_at,
  status: row.status,
  verificationCode: row.verification_code
});

const mapCoinChatMessageRow = (
  row: CoinChatMessageRow
): Every1CoinChatMessage => ({
  authorAvatarUrl: row.author_avatar_url,
  authorDisplayName: row.author_display_name,
  authorProfileId: row.author_profile_id,
  authorUsername: row.author_username,
  body: row.body,
  coinAddress: row.coin_address,
  createdAt: row.created_at,
  id: row.id
});

const mapPopupCampaignRow = (
  row: PopupCampaignRow
): Every1ActivePopupCampaign => ({
  bannerUrl: row.banner_url,
  body: row.body,
  ctaLabel: row.cta_label,
  ctaUrl: row.cta_url,
  eventTag: row.event_tag,
  id: row.id,
  priority: toNumber(row.priority),
  title: row.title,
  triggeredAt: row.triggered_at
});

const getProfileRowByAddress = async (
  address: string
): Promise<null | PublicProfileRow> => {
  const client = getSupabaseClient();

  const walletResult = await client
    .from("profiles")
    .select(PUBLIC_PROFILE_SELECT)
    .eq("wallet_address", address)
    .maybeSingle<PublicProfileRow>();

  if (walletResult.error) {
    throw walletResult.error;
  }

  if (walletResult.data) {
    return walletResult.data;
  }

  const lensResult = await client
    .from("profiles")
    .select(PUBLIC_PROFILE_SELECT)
    .eq("lens_account_address", address)
    .maybeSingle<PublicProfileRow>();

  if (lensResult.error) {
    throw lensResult.error;
  }

  return lensResult.data || null;
};

const getProfileRowByUsername = async (
  username: string
): Promise<null | PublicProfileRow> => {
  const client = getSupabaseClient();

  const usernameResult = await client
    .from("profiles")
    .select(PUBLIC_PROFILE_SELECT)
    .eq("username", username)
    .maybeSingle<PublicProfileRow>();

  if (usernameResult.error) {
    throw usernameResult.error;
  }

  if (usernameResult.data) {
    return usernameResult.data;
  }

  const zoraResult = await client
    .from("profiles")
    .select(PUBLIC_PROFILE_SELECT)
    .eq("zora_handle", username)
    .maybeSingle<PublicProfileRow>();

  if (zoraResult.error) {
    throw zoraResult.error;
  }

  return zoraResult.data || null;
};

export const normalizeReferralCode = (value?: null | string) => {
  const normalized = (value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return normalized || null;
};

export const buildReferralLink = (referralCode?: null | string) => {
  const normalized = normalizeReferralCode(referralCode);

  if (!normalized) {
    return "";
  }

  if (typeof window === "undefined") {
    return `/?ref=${normalized}`;
  }

  const url = new URL("/", window.location.origin);
  url.searchParams.set("ref", normalized);

  return url.toString();
};

export const upsertEvery1Profile = async (input: {
  avatarUrl?: null | string;
  bannerUrl?: null | string;
  bio?: null | string;
  displayName?: null | string;
  lensAccountAddress?: null | string;
  username?: null | string;
  walletAddress?: null | string;
  zoraHandle?: null | string;
}) =>
  callRpc<Every1Profile>("upsert_external_profile", {
    input_avatar_url: asRemoteAsset(input.avatarUrl),
    input_banner_url: asRemoteAsset(input.bannerUrl),
    input_bio: input.bio || null,
    input_display_name: input.displayName || null,
    input_lens_account_address: input.lensAccountAddress || null,
    input_username: input.username || null,
    input_wallet_address: input.walletAddress || null,
    input_zora_handle: input.zoraHandle || null
  });

export const syncEvery1Profile = async (account: AccountFragment) => {
  const displayName = account.metadata?.name || getPreferredUsername(account);

  try {
    return await upsertEvery1Profile({
      avatarUrl: getAvatar(account),
      bannerUrl: getCoverPicture(account),
      bio: account.metadata?.bio || null,
      displayName,
      lensAccountAddress: account.address,
      username: getPreferredUsername(account),
      walletAddress: account.owner,
      zoraHandle: getPreferredUsername(account)
    });
  } catch {
    return upsertEvery1Profile({
      avatarUrl: getAvatar(account),
      bannerUrl: getCoverPicture(account),
      bio: account.metadata?.bio || null,
      displayName,
      lensAccountAddress: account.address,
      username: null,
      walletAddress: account.owner,
      zoraHandle: getPreferredUsername(account)
    });
  }
};

export const ensureEvery1ProfileForAccount = async (account: AccountFragment) =>
  syncEvery1Profile(account);

export const captureReferralJoin = async (
  profileId: string,
  referralCode: string
) =>
  callRpc<ReferralJoinResult>("capture_referral_join", {
    input_profile_id: profileId,
    input_referral_code: normalizeReferralCode(referralCode)
  });

export const recordReferralTradeReward = async (input: {
  chainId?: number;
  coinAddress: string;
  coinSymbol: string;
  profileId: string;
  tradeAmountIn: number;
  tradeAmountOut: number;
  tradeSide: "buy" | "sell";
  txHash: string;
}) =>
  callRpc<ReferralRewardResult>("record_referral_trade_reward", {
    input_chain_id: input.chainId ?? 8453,
    input_coin_address: input.coinAddress,
    input_coin_symbol: input.coinSymbol,
    input_profile_id: input.profileId,
    input_trade_amount_in: input.tradeAmountIn,
    input_trade_amount_out: input.tradeAmountOut,
    input_trade_side: input.tradeSide,
    input_tx_hash: input.txHash
  });

export const getReferralDashboard = async (profileId: string) =>
  callRpc<ReferralDashboard>("get_referral_dashboard", {
    input_profile_id: profileId
  });

export const getDailyStreakDashboard = async (profileId: string) =>
  callRpc<DailyStreakDashboard>("get_daily_streak_dashboard", {
    input_profile_id: profileId
  });

export const recordDailyLoginStreak = async (profileId: string) =>
  callRpc<DailyStreakClaimResult>("record_daily_login_streak", {
    input_profile_id: profileId
  });

export const getProfileMissions = async (
  profileId: string,
  taskType?: null | string
) =>
  callRpc<Every1Mission[]>("get_profile_missions", {
    input_profile_id: profileId,
    input_task_type: taskType || null
  });

export const getProfileFanDrops = async ({
  profileId,
  slug
}: {
  profileId?: null | string;
  slug?: null | string;
} = {}) =>
  callRpc<Every1FanDropCampaign[]>("get_profile_fandrops", {
    input_profile_id: profileId || null,
    input_slug: slug || null
  });

export const upsertProfileFanDropCampaign = async (
  profileId: string,
  input: Every1FanDropUpsertInput
) =>
  callRpc<Every1FanDropUpsertResult>("upsert_profile_fandrop_campaign", {
    input_about: input.about || null,
    input_banner_url: input.bannerUrl || null,
    input_buy_amount: input.buyAmount ?? null,
    input_cover_label: input.coverLabel || null,
    input_ends_at: input.endsAt || null,
    input_is_buy_optional: input.isBuyOptional ?? true,
    input_mission_id: input.missionId || null,
    input_profile_id: profileId,
    input_referral_target: input.referralTarget ?? 2,
    input_reward_e1xp: input.rewardE1xp ?? 0,
    input_reward_pool_amount: input.rewardPoolAmount ?? null,
    input_reward_pool_label: input.rewardPoolLabel || null,
    input_reward_token_address: input.rewardTokenAddress || null,
    input_reward_token_decimals: input.rewardTokenDecimals ?? 18,
    input_reward_token_symbol: input.rewardTokenSymbol || null,
    input_starts_at: input.startsAt || null,
    input_status: input.status || "draft",
    input_subtitle: input.subtitle || null,
    input_title: input.title,
    input_winner_limit: input.winnerLimit ?? null
  });

export const claimMissionReward = async (
  profileId: string,
  missionId: string
) =>
  callRpc<MissionClaimResult>("claim_mission_reward", {
    input_mission_id: missionId,
    input_profile_id: profileId
  });

export const syncFanDropNotifications = async (
  profileId: string,
  campaigns: Every1FanDropCampaignNotificationInput[]
) =>
  callRpc<Every1FanDropNotificationSyncResult>(
    "sync_profile_fandrop_notifications",
    {
      input_campaigns: campaigns,
      input_profile_id: profileId
    }
  );

export const joinFanDropCampaign = async (
  profileId: string,
  campaign: Every1FanDropCampaignNotificationInput
) =>
  callRpc<Every1FanDropJoinResult>("join_fandrop_campaign", {
    input_campaign_slug: campaign.slug,
    input_campaign_title: campaign.title,
    input_creator_name: campaign.creatorName,
    input_profile_id: profileId,
    input_reward_pool_label: campaign.rewardPoolLabel
  });

export const listProfileFanDropParticipation = async (profileId: string) => {
  const rows = await callRpc<
    Array<{
      campaign_slug: string;
      joined_at: string;
    }>
  >("list_profile_fandrop_participation", {
    input_profile_id: profileId
  });

  return rows.map((row) => ({
    campaignSlug: row.campaign_slug,
    joinedAt: row.joined_at
  })) satisfies Every1FanDropParticipation[];
};

export const getFanDropRuntimeConfig = async () =>
  fetchJson<Every1FanDropRuntimeConfig>("/api/fandrop/config");

export const getCollaborationRuntimeConfig = async () =>
  fetchJson<Every1CollaborationRuntimeConfig>("/api/collaboration/config");

export const verifyFanDropRewardFunding = async (
  missionId: string,
  txHash: string
) =>
  fetchJson<{
    alreadyFunded?: boolean;
    funded: boolean;
    fundedAt?: string;
  }>("/api/fandrop/fund/verify", {
    body: JSON.stringify({ missionId, txHash }),
    method: "POST"
  });

export const listProfileNotifications = async (
  profileId: string,
  {
    kind,
    limit = 50
  }: {
    kind?: null | string;
    limit?: number;
  } = {}
) => {
  const rows = await callRpc<NotificationRow[]>("list_profile_notifications", {
    input_kind: kind || null,
    input_limit: limit,
    input_profile_id: profileId
  });

  return rows.map((row) => ({
    actorAvatarUrl: row.actor_avatar_url,
    actorDisplayName: row.actor_display_name,
    actorId: row.actor_id,
    actorUsername: row.actor_username,
    body: row.body,
    createdAt: row.created_at,
    data: row.data || {},
    id: row.id,
    isRead: row.is_read,
    kind: row.kind,
    targetKey: row.target_key,
    title: row.title
  })) satisfies Every1Notification[];
};

export const getUnreadNotificationCount = async (profileId: string) =>
  callRpc<number>("get_profile_unread_notification_count", {
    input_profile_id: profileId
  });

export const markNotificationsRead = async (
  profileId: string,
  notificationIds?: string[]
) =>
  callRpc<number>("mark_profile_notifications_read", {
    input_notification_ids:
      notificationIds && notificationIds.length > 0 ? notificationIds : null,
    input_profile_id: profileId
  });

export const getMobileNavBadgeCounts = async (profileId: string) =>
  callRpc<Every1MobileNavBadgeCounts>("get_mobile_nav_badge_counts", {
    input_profile_id: profileId
  });

export const markMobileNavBadgeSeen = async (
  profileId: string,
  badgeKey: Every1MobileNavBadgeKey
) =>
  callRpc<Every1MobileNavBadgeSeenResult>("mark_mobile_nav_badge_seen", {
    input_badge_key: badgeKey,
    input_profile_id: profileId
  });

export const getPublicE1xpTotalsByWallets = async (
  walletAddresses: string[]
) => {
  const normalizedAddresses = Array.from(
    new Set(
      walletAddresses
        .map((address) => address?.trim().toLowerCase())
        .filter(Boolean)
    )
  );

  if (!normalizedAddresses.length) {
    return {} as Record<string, number>;
  }

  const rows = await callRpc<
    Array<{
      total_e1xp: number | string;
      wallet_address: string;
    }>
  >("get_public_profile_e1xp_by_wallets", {
    input_wallet_addresses: normalizedAddresses
  });

  return Object.fromEntries(
    rows.map((row) => [
      row.wallet_address.toLowerCase(),
      Number.parseInt(String(row.total_e1xp || 0), 10) || 0
    ])
  ) as Record<string, number>;
};

export const getPublicEvery1ProfilesByWallets = async (
  walletAddresses: string[]
) => {
  const normalizedAddresses = Array.from(
    new Set(walletAddresses.map(normalizeWalletAddress).filter(Boolean))
  ) as string[];

  if (!normalizedAddresses.length) {
    return {} as Record<string, Every1Profile>;
  }

  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select(PUBLIC_PROFILE_SELECT)
    .in("wallet_address", normalizedAddresses);

  if (error) {
    throw error;
  }

  const e1xpTotals = await getPublicE1xpTotalsByWallets(
    normalizedAddresses
  ).catch(() => ({}) as Record<string, number>);

  const rows = (data || []) as PublicProfileRow[];

  return Object.fromEntries(
    rows
      .filter((row) => Boolean(row.wallet_address))
      .map((row) => [
        row.wallet_address?.toLowerCase() as string,
        mapProfileRow(row, {
          e1xpTotal: row.wallet_address
            ? e1xpTotals[row.wallet_address.toLowerCase()] || 0
            : 0
        })
      ])
  ) as Record<string, Every1Profile>;
};

export const getPublicEvery1Profile = async ({
  address,
  username
}: {
  address?: null | string;
  username?: null | string;
}) => {
  const normalizedAddress = normalizeWalletAddress(address);
  const normalizedUsername = normalizeHandle(username);

  let row: null | PublicProfileRow = null;

  if (normalizedAddress) {
    row = await getProfileRowByAddress(normalizedAddress);
  }

  if (!row && normalizedUsername) {
    row = await getProfileRowByUsername(normalizedUsername);
  }

  if (!row) {
    return null;
  }

  const e1xpTotal = row.wallet_address
    ? (
        await getPublicE1xpTotalsByWallets([row.wallet_address]).catch(
          () => ({}) as Record<string, number>
        )
      )[row.wallet_address.toLowerCase()] || 0
    : 0;

  return mapProfileRow(row, { e1xpTotal });
};

export const getPublicProfileStats = async (input: {
  profileId?: null | string;
  walletAddress?: null | string;
  username?: null | string;
}) => {
  const rows = await callRpc<PublicProfileStatsRow[]>(
    "get_public_profile_stats",
    {
      input_profile_id: input.profileId || null,
      input_username: normalizeHandle(input.username),
      input_wallet_address: normalizeWalletAddress(input.walletAddress)
    }
  );

  const row = rows?.[0];

  if (!row) {
    return null;
  }

  return {
    creatorCoinAddress: row.creator_coin_address,
    creatorCoinTicker: row.creator_coin_ticker,
    profileId: row.profile_id,
    referralCoinRewards: toNumber(row.referral_coin_rewards)
  } satisfies Every1PublicProfileStats;
};

const mapPublicCoinCollaborationMemberRow = (
  row: PublicCoinCollaborationMemberRow
): Every1PublicCollaborationMember => ({
  acceptedAt: row.acceptedAt,
  avatarUrl: row.avatarUrl,
  displayName: row.displayName,
  inviteExpiresAt: row.inviteExpiresAt,
  joinedAt: row.joinedAt,
  note: row.note,
  profileId: row.profileId,
  role: row.role,
  splitPercent: toNumber(row.splitPercent),
  status: row.status,
  username: row.username,
  walletAddress: row.walletAddress
});

const mapPublicCoinCollaborationRow = (
  row: PublicCoinCollaborationRow
): Every1PublicCoinCollaboration => ({
  activeMemberCount: toNumber(row.active_member_count),
  coinAddress: row.coin_address,
  collaborationId: row.collaboration_id,
  coverImageUrl: row.cover_image_url,
  description: row.description,
  launchedAt: row.launched_at,
  launchId: row.launch_id,
  members: (row.members || []).map(mapPublicCoinCollaborationMemberRow),
  ownerAvatarUrl: row.owner_avatar_url,
  ownerDisplayName: row.owner_display_name,
  ownerId: row.owner_id,
  ownerUsername: row.owner_username,
  ticker: row.ticker,
  title: row.title
});

export const listPublicCoinCollaborations = async (coinAddresses: string[]) => {
  const normalizedCoinAddresses = [
    ...new Set(
      coinAddresses
        .map((coinAddress) => coinAddress?.trim().toLowerCase())
        .filter(Boolean)
    )
  ];

  if (!normalizedCoinAddresses.length) {
    return [] as Every1PublicCoinCollaboration[];
  }

  const rows = await callRpc<PublicCoinCollaborationRow[]>(
    "list_public_coin_collaborations",
    {
      input_coin_addresses: normalizedCoinAddresses
    }
  );

  return (rows || []).map(
    mapPublicCoinCollaborationRow
  ) satisfies Every1PublicCoinCollaboration[];
};

export const listPublicCollaborationCoins = async (input?: {
  limit?: number;
  offset?: number;
}) => {
  const rows = await callRpc<PublicCoinCollaborationRow[]>(
    "list_public_collaboration_coins",
    {
      input_limit: input?.limit || 24,
      input_offset: input?.offset || 0
    }
  );

  return (rows || []).map(
    mapPublicCoinCollaborationRow
  ) satisfies Every1PublicCoinCollaboration[];
};

export const listProfileCollaborations = async (
  profileId: string,
  options: { includePrivate?: boolean } = {}
) => {
  const rows = await callRpc<CollaborationRow[]>(
    "list_profile_collaborations",
    {
      input_include_private: options.includePrivate ?? false,
      input_profile_id: profileId
    }
  );

  return (rows || []).map((row) => ({
    acceptedAt: row.accepted_at,
    activeMemberCount: row.active_member_count,
    coinAddress: row.coin_address,
    collaborationId: row.collaboration_id,
    coverImageUrl: row.cover_image_url,
    createdAt: row.created_at,
    description: row.description,
    inviteExpiresAt: row.invite_expires_at,
    isExpired: row.is_expired,
    launchId: row.launch_id,
    launchStatus: row.launch_status,
    members: (row.members || []).map((member) => ({
      acceptedAt: member.acceptedAt,
      avatarUrl: member.avatarUrl,
      displayName: member.displayName,
      inviteExpiresAt: member.inviteExpiresAt,
      joinedAt: member.joinedAt,
      note: member.note,
      profileId: member.profileId,
      role: member.role,
      splitPercent: toNumber(member.splitPercent),
      status: member.status,
      username: member.username
    })),
    metadataUri: row.metadata_uri,
    ownerAvatarUrl: row.owner_avatar_url,
    ownerDisplayName: row.owner_display_name,
    ownerId: row.owner_id,
    ownerUsername: row.owner_username,
    pendingMemberCount: row.pending_member_count,
    splitLockedAt: row.split_locked_at,
    status: row.status,
    ticker: row.ticker,
    title: row.title,
    viewerCanCancel: row.viewer_can_cancel,
    viewerCanLaunch: row.viewer_can_launch,
    viewerCanRespond: row.viewer_can_respond,
    viewerRole: row.viewer_role,
    viewerStatus: row.viewer_status
  })) satisfies Every1Collaboration[];
};

export const getProfileCollaborationEarningsSummary = async (
  profileId: string
) => {
  const rows = await callRpc<CollaborationEarningsSummaryRow[]>(
    "get_profile_collaboration_earnings_summary",
    {
      input_profile_id: profileId
    }
  );

  const row = rows?.[0];

  if (!row) {
    return {
      allocationCount: 0,
      collaborationCount: 0,
      lastEarnedAt: null,
      latestAmount: 0,
      latestCoinSymbol: null
    } satisfies Every1CollaborationEarningsSummary;
  }

  return {
    allocationCount: toNumber(row.allocation_count),
    collaborationCount: toNumber(row.collaboration_count),
    lastEarnedAt: row.last_earned_at,
    latestAmount: toNumber(row.latest_amount),
    latestCoinSymbol: row.latest_coin_symbol
  } satisfies Every1CollaborationEarningsSummary;
};

export const listProfileCollaborationEarnings = async (profileId: string) => {
  const rows = await callRpc<CollaborationEarningsRow[]>(
    "list_profile_collaboration_earnings",
    {
      input_profile_id: profileId
    }
  );

  return (rows || []).map((row) => ({
    allocationCount: toNumber(row.allocation_count),
    coinAddress: row.coin_address,
    coinSymbol: row.coin_symbol || "COIN",
    collaborationId: row.collaboration_id,
    lastEarnedAt: row.last_earned_at,
    ticker: row.ticker,
    title: row.title,
    totalAmount: toNumber(row.total_amount)
  })) satisfies Every1CollaborationEarningsItem[];
};

export const listProfileCollaborationPayouts = async (profileId: string) => {
  const rows = await callRpc<CollaborationPayoutRow[]>(
    "list_profile_collaboration_payouts",
    {
      input_profile_id: profileId
    }
  );

  return (rows || []).map((row) => ({
    allocationId: row.allocation_id,
    amount: toNumber(row.amount),
    coinAddress: row.coin_address,
    coinSymbol: row.coin_symbol,
    collaborationId: row.collaboration_id,
    createdAt: row.created_at,
    errorMessage: row.error_message,
    payoutAttemptedAt: row.payout_attempted_at,
    recipientWalletAddress: row.recipient_wallet_address,
    sentAt: row.sent_at,
    splitPercent: toNumber(row.split_percent),
    status: row.status,
    ticker: row.ticker,
    title: row.title,
    txHash: row.tx_hash
  })) satisfies Every1CollaborationPayoutItem[];
};

export const listProfileCollaborationSettlements = async (
  profileId: string
) => {
  const rows = await callRpc<CollaborationSettlementRow[]>(
    "list_profile_collaboration_settlements",
    {
      input_profile_id: profileId
    }
  );

  return (rows || []).map((row) => ({
    coinAddress: row.coin_address,
    coinSymbol: row.coin_symbol,
    collaborationId: row.collaboration_id,
    collaborationStatus: row.collaboration_status,
    failedAmount: toNumber(row.failed_amount),
    failedCount: toNumber(row.failed_count),
    grossAmount: toNumber(row.gross_amount),
    lastActivityAt: row.last_activity_at,
    launchStatus: row.launch_status,
    paidAmount: toNumber(row.paid_amount),
    paidCount: toNumber(row.paid_count),
    payoutsPaused: row.payouts_paused,
    payoutsPausedAt: row.payouts_paused_at,
    payoutsPausedReason: row.payouts_paused_reason,
    queuedAmount: toNumber(row.queued_amount),
    queuedCount: toNumber(row.queued_count),
    rewardTokenDecimals: toNumber(row.reward_token_decimals || 18),
    sourceTypes: row.source_types || [],
    ticker: row.ticker,
    title: row.title,
    totalCount: toNumber(row.total_count),
    viewerSplitPercent: toNumber(row.viewer_split_percent)
  })) satisfies Every1CollaborationSettlementItem[];
};

export const listProfileCollaborationPayoutAudit = async (
  profileId: string,
  collaborationId?: null | string
) => {
  const rows = await callRpc<CollaborationPayoutAuditRow[]>(
    "list_profile_collaboration_payout_audit",
    {
      input_collaboration_id: collaborationId || null,
      input_profile_id: profileId
    }
  );

  return (rows || []).map((row) => ({
    allocationId: row.allocation_id,
    amount: toNumber(row.amount),
    coinAddress: row.coin_address,
    coinSymbol: row.coin_symbol,
    collaborationId: row.collaboration_id,
    createdAt: row.created_at,
    errorMessage: row.error_message,
    payoutAttemptedAt: row.payout_attempted_at,
    recipientName: row.recipient_name,
    recipientProfileId: row.recipient_profile_id,
    recipientUsername: row.recipient_username,
    recipientWalletAddress: row.recipient_wallet_address,
    sentAt: row.sent_at,
    sourceType: row.source_type,
    splitPercent: toNumber(row.split_percent),
    status: row.status,
    ticker: row.ticker,
    title: row.title,
    txHash: row.tx_hash
  })) satisfies Every1CollaborationPayoutAuditItem[];
};

export const listProfileRewardTokens = async (profileId: string) => {
  const rows = await callRpc<WalletRewardTokenRow[]>(
    "list_profile_reward_tokens",
    {
      input_profile_id: profileId
    }
  );

  return (rows || []).map((row) => ({
    lastReceivedAt: row.last_received_at,
    rewardCount: toNumber(row.reward_count),
    tokenAddress: row.token_address,
    tokenDecimals: toNumber(row.token_decimals),
    tokenSymbol: row.token_symbol
  })) satisfies Every1WalletRewardToken[];
};

export const listProfileWalletActivity = async (profileId: string) => {
  const rows = await callRpc<WalletActivityRow[]>(
    "list_profile_wallet_activity",
    {
      input_profile_id: profileId
    }
  );

  return (rows || []).map((row) => ({
    activityId: row.activity_id,
    activityKind: row.activity_kind,
    amount: toNumber(row.amount),
    createdAt: row.created_at,
    sourceName: row.source_name,
    status: row.status,
    targetKey: row.target_key,
    tokenAddress: row.token_address,
    tokenSymbol: row.token_symbol,
    txHash: row.tx_hash
  })) satisfies Every1WalletActivityItem[];
};

export const createCollaborationCoinInvite = async (
  ownerProfileId: string,
  input: Every1CollaborationInviteInput
) =>
  callRpc<Every1CollaborationInviteResult>("create_collaboration_coin_invite", {
    input_category: input.category || null,
    input_chain_id: 8453,
    input_collaborator_profile_id: input.collaboratorProfileId,
    input_collaborator_split: toNumber(100 - input.creatorSplit),
    input_cover_image_url: input.coverImageUrl || null,
    input_creator_split: toNumber(input.creatorSplit),
    input_description: input.description || null,
    input_invite_note: input.inviteNote || null,
    input_metadata_uri: input.metadataUri || null,
    input_name: input.name,
    input_owner_profile_id: ownerProfileId,
    input_supply: Math.max(Number(input.supply || 10000000), 1),
    input_ticker: input.ticker
  });

export const respondToCollaborationCoinInvite = async (
  profileId: string,
  collaborationId: string,
  decision: "accept" | "decline"
) =>
  callRpc<Every1CollaborationResponseResult>(
    "respond_to_collaboration_coin_invite",
    {
      input_collaboration_id: collaborationId,
      input_decision: decision,
      input_profile_id: profileId
    }
  );

export const cancelCollaborationCoinInvite = async (
  profileId: string,
  collaborationId: string
) =>
  callRpc<Every1CollaborationCancelResult>("cancel_collaboration_coin_invite", {
    input_collaboration_id: collaborationId,
    input_profile_id: profileId
  });

export const completeCollaborationCoinLaunch = async (
  profileId: string,
  collaborationId: string,
  coinAddress: string
) =>
  callRpc<Every1CollaborationLaunchResult>(
    "complete_collaboration_coin_launch",
    {
      input_coin_address: coinAddress,
      input_collaboration_id: collaborationId,
      input_profile_id: profileId
    }
  );

const scoreProfileSearchResult = (
  row: PublicProfileRow,
  normalizedQuery: string
) => {
  const username = normalizeHandle(row.username);
  const zoraHandle = normalizeHandle(row.zora_handle);
  const displayName = (row.display_name || "").trim().toLowerCase();
  const walletAddress = normalizeWalletAddress(row.wallet_address);
  const lensAddress = normalizeWalletAddress(row.lens_account_address);
  let score = 0;

  if (row.verification_status === "verified") {
    score += 30;
  }

  if (username === normalizedQuery || zoraHandle === normalizedQuery) {
    score += 300;
  }

  if (walletAddress === normalizedQuery || lensAddress === normalizedQuery) {
    score += 280;
  }

  if (
    username?.startsWith(normalizedQuery) ||
    zoraHandle?.startsWith(normalizedQuery)
  ) {
    score += 150;
  }

  if (displayName.startsWith(normalizedQuery)) {
    score += 120;
  }

  if (
    username?.includes(normalizedQuery) ||
    zoraHandle?.includes(normalizedQuery)
  ) {
    score += 70;
  }

  if (displayName.includes(normalizedQuery)) {
    score += 45;
  }

  if (row.avatar_url) {
    score += 4;
  }

  return score;
};

export const searchPublicEvery1Profiles = async (query: string, limit = 20) => {
  const normalizedQuery = normalizeHandle(query) || query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [] as Every1Profile[];
  }

  const safeSearch = normalizedQuery.replace(/[%_]/g, "");
  const safeDisplaySearch = query.trim().replace(/[%_]/g, "");
  const client = getSupabaseClient();
  const queries = [
    client
      .from("profiles")
      .select(PUBLIC_PROFILE_SELECT)
      .ilike("username", `%${safeSearch}%`)
      .limit(limit),
    client
      .from("profiles")
      .select(PUBLIC_PROFILE_SELECT)
      .ilike("zora_handle", `%${safeSearch}%`)
      .limit(limit),
    client
      .from("profiles")
      .select(PUBLIC_PROFILE_SELECT)
      .ilike("display_name", `%${safeDisplaySearch}%`)
      .limit(limit),
    client
      .from("profiles")
      .select(PUBLIC_PROFILE_SELECT)
      .ilike("wallet_address", `%${safeSearch}%`)
      .limit(limit)
  ];

  const results = await Promise.all(queries);
  const rowsById = new Map<string, PublicProfileRow>();

  for (const result of results) {
    if (result.error) {
      throw result.error;
    }

    for (const row of (result.data || []) as PublicProfileRow[]) {
      rowsById.set(row.id, row);
    }
  }

  return [...rowsById.values()]
    .sort(
      (left, right) =>
        scoreProfileSearchResult(right, normalizedQuery) -
        scoreProfileSearchResult(left, normalizedQuery)
    )
    .slice(0, limit)
    .map((row) => mapProfileRow(row));
};

export const syncProfileSocialAccount = async (input: {
  avatarUrl?: null | string;
  displayName?: null | string;
  handle: string;
  profileId: string;
  profileUrl?: null | string;
  provider: Every1ProfileSocialAccount["provider"];
  providerUserId?: null | string;
}) =>
  callRpc<Every1ProfileSocialAccount>("sync_profile_social_account", {
    input_avatar_url: input.avatarUrl || null,
    input_display_name: input.displayName || null,
    input_handle: input.handle,
    input_profile_id: input.profileId,
    input_profile_url: input.profileUrl || null,
    input_provider: input.provider,
    input_provider_user_id: input.providerUserId || null
  });

export const listProfileSocialAccounts = async (profileId: string) => {
  const rows = await callRpc<SocialAccountRow[]>(
    "list_profile_social_accounts",
    {
      input_profile_id: profileId
    }
  );

  return rows.map(mapSocialAccountRow) satisfies Every1ProfileSocialAccount[];
};

export const submitProfileVerificationRequest = async (input: {
  category?: null | string;
  claimedHandle: string;
  note?: null | string;
  profileId: string;
  provider: Every1ProfileVerificationRequest["provider"];
}) =>
  callRpc<Every1ProfileVerificationRequest>(
    "submit_profile_verification_request",
    {
      input_category: input.category || null,
      input_claimed_handle: input.claimedHandle,
      input_note: input.note || null,
      input_profile_id: input.profileId,
      input_provider: input.provider
    }
  );

export const listProfileVerificationRequests = async (profileId: string) => {
  const rows = await callRpc<VerificationRequestRow[]>(
    "list_profile_verification_requests",
    {
      input_profile_id: profileId
    }
  );

  return rows.map(
    mapVerificationRequestRow
  ) satisfies Every1ProfileVerificationRequest[];
};

export const submitProfileVerificationProofEvidence = async (input: {
  avatarUrl?: null | string;
  displayName?: null | string;
  postText?: null | string;
  postUrl?: null | string;
  profileUrl?: null | string;
  proofHandle?: null | string;
  providerUserId?: null | string;
  requestId: string;
}) =>
  callRpc<Every1VerificationProofResult>(
    "submit_profile_verification_proof_evidence",
    {
      input_avatar_url: input.avatarUrl || null,
      input_display_name: input.displayName || null,
      input_post_text: input.postText || null,
      input_post_url: input.postUrl || null,
      input_profile_url: input.profileUrl || null,
      input_proof_handle: input.proofHandle || null,
      input_provider_user_id: input.providerUserId || null,
      input_request_id: input.requestId
    }
  );

export const getVerificationRuntimeConfig = async () =>
  fetchJson<{
    enabled: boolean;
    xVerificationEnabled: boolean;
  }>("/api/verification/config");

export const verifyXProfileVerificationProof = async (input: {
  linkedDisplayName?: null | string;
  linkedHandle: string;
  linkedProfileImageUrl?: null | string;
  linkedSubject?: null | string;
  postUrl: string;
  profileId: string;
  requestId: string;
}) =>
  fetchJson<Every1VerificationProofResult>("/api/verification/x/verify", {
    body: JSON.stringify({
      linkedDisplayName: input.linkedDisplayName || null,
      linkedHandle: input.linkedHandle,
      linkedProfileImageUrl: input.linkedProfileImageUrl || null,
      linkedSubject: input.linkedSubject || null,
      postUrl: input.postUrl,
      profileId: input.profileId,
      requestId: input.requestId
    }),
    method: "POST"
  });

export const getProfileFollowStats = async (profileId?: null | string) =>
  callRpc<Every1FollowStats>("get_profile_follow_stats", {
    input_profile_id: profileId || null
  });

export const getFollowRelationship = async (
  viewerProfileId?: null | string,
  targetProfileId?: null | string
) =>
  callRpc<Every1FollowRelationship>("get_follow_relationship", {
    input_target_profile_id: targetProfileId || null,
    input_viewer_profile_id: viewerProfileId || null
  });

export const followProfile = async (
  followerProfileId: string,
  followedProfileId: string
) =>
  callRpc<Every1FollowMutationResult>("follow_profile", {
    input_followed_profile_id: followedProfileId,
    input_follower_profile_id: followerProfileId
  });

export const unfollowProfile = async (
  followerProfileId: string,
  followedProfileId: string
) =>
  callRpc<Every1FollowMutationResult>("unfollow_profile", {
    input_followed_profile_id: followedProfileId,
    input_follower_profile_id: followerProfileId
  });

export const listProfileFollowers = async (profileId: string, limit = 100) => {
  const rows = await callRpc<FollowListRow[]>("list_profile_followers", {
    input_limit: limit,
    input_profile_id: profileId
  });

  return rows.map(mapFollowListProfile) satisfies Every1FollowListProfile[];
};

export const listProfileFollowing = async (profileId: string, limit = 100) => {
  const rows = await callRpc<FollowListRow[]>("list_profile_following", {
    input_limit: limit,
    input_profile_id: profileId
  });

  return rows.map(mapFollowListProfile) satisfies Every1FollowListProfile[];
};

export const createCommunity = async (input: {
  avatarUrl?: null | string;
  bannerUrl?: null | string;
  description?: null | string;
  name: string;
  ownerProfileId: string;
  slug?: null | string;
  visibility?: Every1CommunitySummary["visibility"];
}) =>
  callRpc<Every1CommunityMutationResult>("create_community", {
    input_avatar_url: input.avatarUrl || null,
    input_banner_url: input.bannerUrl || null,
    input_description: input.description || null,
    input_name: input.name,
    input_owner_profile_id: input.ownerProfileId,
    input_slug: input.slug || null,
    input_visibility: input.visibility || "public"
  });

export const listProfileCommunities = async (input?: {
  feedType?: "discover" | "managed" | "member";
  limit?: number;
  profileId?: null | string;
  search?: null | string;
}) => {
  const rows = await callRpc<CommunityRow[]>("list_profile_communities", {
    input_feed_type: input?.feedType || "discover",
    input_limit: input?.limit || 50,
    input_profile_id: input?.profileId || null,
    input_search: input?.search || null
  });

  return rows.map(mapCommunityRow) satisfies Every1CommunitySummary[];
};

export const getCommunityBySlug = async (input: {
  profileId?: null | string;
  slug: string;
}) => {
  const rows = await callRpc<CommunityRow[]>("get_community_by_slug", {
    input_profile_id: input.profileId || null,
    input_slug: input.slug
  });

  const communityRow = rows?.[0];

  if (!communityRow) {
    return null;
  }

  const memberRows = await callRpc<CommunityMemberRow[]>(
    "list_community_members",
    {
      input_community_id: communityRow.id,
      input_limit: 6
    }
  ).catch(() => []);

  return {
    ...mapCommunityRow(communityRow),
    membersPreview: (memberRows || []).map(mapCommunityMemberRow)
  } satisfies Every1CommunityDetails;
};

export const listCommunityPosts = async (input: {
  communityId: string;
  limit?: number;
  profileId?: null | string;
}) => {
  const rows = await callRpc<CommunityPostRow[]>("list_community_posts", {
    input_community_id: input.communityId,
    input_limit: input.limit || 50,
    input_profile_id: input.profileId || null
  });

  return rows.map(mapCommunityPostRow) satisfies Every1CommunityPost[];
};

export const joinCommunity = async (communityId: string, profileId: string) =>
  callRpc<Every1CommunityMutationResult>("join_community", {
    input_community_id: communityId,
    input_profile_id: profileId
  });

export const leaveCommunity = async (communityId: string, profileId: string) =>
  callRpc<Every1CommunityMutationResult>("leave_community", {
    input_community_id: communityId,
    input_profile_id: profileId
  });

export const getCommunityVerificationContext = async (input: {
  communityId: string;
  viewerProfileId?: null | string;
}) => {
  const rows = await callRpc<
    Array<{
      admin_note: null | string;
      category: null | string;
      community_id: string;
      confirmed_admin_count: number;
      created_at: string;
      group_platform: null | "other" | "telegram" | "whatsapp";
      group_url: null | string;
      note: null | string;
      pending_admin_count: number;
      request_id: string;
      requested_by_display_name: null | string;
      requested_by_profile_id: string;
      requested_by_username: null | string;
      required_admin_count: number;
      reviewed_at: null | string;
      status: Every1CommunityDetails["verificationStatus"];
      verification_code: string;
      verification_kind: "community_led" | "official";
      viewer_can_confirm: boolean;
      viewer_confirmed: boolean;
      viewer_is_requester: boolean;
    }>
  >("get_community_verification_context", {
    input_community_id: input.communityId,
    input_viewer_profile_id: input.viewerProfileId || null
  });

  const row = rows?.[0];

  if (!row) {
    return null;
  }

  return {
    adminNote: row.admin_note,
    category: row.category,
    communityId: row.community_id,
    confirmedAdminCount: toNumber(row.confirmed_admin_count),
    createdAt: row.created_at,
    groupPlatform: row.group_platform,
    groupUrl: row.group_url,
    note: row.note,
    pendingAdminCount: toNumber(row.pending_admin_count),
    requestedByDisplayName: row.requested_by_display_name,
    requestedByProfileId: row.requested_by_profile_id,
    requestedByUsername: row.requested_by_username,
    requestId: row.request_id,
    requiredAdminCount: toNumber(row.required_admin_count),
    reviewedAt: row.reviewed_at,
    status: row.status,
    verificationCode: row.verification_code,
    verificationKind: row.verification_kind,
    viewerCanConfirm: Boolean(row.viewer_can_confirm),
    viewerConfirmed: Boolean(row.viewer_confirmed),
    viewerIsRequester: Boolean(row.viewer_is_requester)
  } satisfies Every1CommunityVerificationContext;
};

export const listCommunityVerificationConfirmations = async (
  requestId: string
) => {
  const rows = await callRpc<
    Array<{
      avatar_url: null | string;
      confirmed_at: null | string;
      created_at: string;
      display_name: null | string;
      id: string;
      invited_identifier: null | string;
      profile_id: string;
      role_label: null | string;
      status: "confirmed" | "pending";
      username: null | string;
      wallet_address: null | string;
    }>
  >("list_community_verification_confirmations", {
    input_request_id: requestId
  });

  return rows.map((row) => ({
    avatarUrl: row.avatar_url,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    displayName: row.display_name,
    id: row.id,
    invitedIdentifier: row.invited_identifier,
    profileId: row.profile_id,
    roleLabel: row.role_label,
    status: row.status,
    username: row.username,
    walletAddress: row.wallet_address
  })) satisfies Every1CommunityVerificationConfirmation[];
};

export const submitCommunityVerificationRequest = async (input: {
  adminIdentifiers?: string[];
  category?: null | string;
  communityId: string;
  groupPlatform?: null | "other" | "telegram" | "whatsapp";
  groupUrl?: null | string;
  note?: null | string;
  requesterProfileId: string;
  verificationKind: "community_led" | "official";
}) =>
  callRpc<Every1CommunityVerificationRequestResult>(
    "submit_community_verification_request",
    {
      input_admin_identifiers: input.adminIdentifiers?.length
        ? input.adminIdentifiers
        : null,
      input_category: input.category || null,
      input_community_id: input.communityId,
      input_group_platform: input.groupPlatform || null,
      input_group_url: input.groupUrl || null,
      input_note: input.note || null,
      input_requester_profile_id: input.requesterProfileId,
      input_verification_kind: input.verificationKind
    }
  );

export const confirmCommunityVerificationAdmin = async (input: {
  profileId: string;
  requestId: string;
}) =>
  callRpc<Every1CommunityVerificationConfirmationResult>(
    "confirm_community_verification_admin",
    {
      input_profile_id: input.profileId,
      input_request_id: input.requestId
    }
  );

export const getProfileEngagementNudgeSignals = async (profileId: string) =>
  callRpc<Every1EngagementNudgeSignals>(
    "get_profile_engagement_nudge_signals",
    {
      input_profile_id: profileId
    }
  );

export const createProfileEngagementNudge = async (input: {
  body?: null | string;
  cooldownMinutes?: number;
  data?: Record<string, unknown>;
  kind: string;
  profileId: string;
  sourceKey: string;
  targetKey?: null | string;
  title: string;
}) =>
  callRpc<Every1EngagementNudgeResult>("create_profile_engagement_nudge", {
    input_body: input.body || null,
    input_cooldown_minutes: input.cooldownMinutes || 45,
    input_data: input.data || {},
    input_nudge_kind: input.kind,
    input_profile_id: input.profileId,
    input_source_key: input.sourceKey,
    input_target_key: input.targetKey || null,
    input_title: input.title
  });

export const getActiveSpecialEventPopup = async (profileId: string) => {
  const rows = await callRpc<PopupCampaignRow[]>(
    "get_active_special_event_popup",
    {
      input_profile_id: profileId
    }
  );

  const row = rows?.[0];
  return row ? mapPopupCampaignRow(row) : null;
};

export const dismissSpecialEventPopup = async (
  profileId: string,
  campaignId: string
) =>
  callRpc<boolean>("dismiss_special_event_popup", {
    input_campaign_id: campaignId,
    input_profile_id: profileId
  });

export const syncExploreListingEvents = async (
  items: Array<Record<string, unknown>>
) =>
  callRpc<number>("sync_explore_listing_events", {
    input_items: items
  });

export const listCoinChatMessages = async (input: {
  coinAddress: string;
  limit?: number;
}) => {
  const rows = await callRpc<CoinChatMessageRow[]>("list_coin_chat_messages", {
    input_coin_address: input.coinAddress,
    input_limit: input.limit || 100
  });

  return rows.map(mapCoinChatMessageRow) satisfies Every1CoinChatMessage[];
};

export const createCoinChatMessage = async (input: {
  body: string;
  coinAddress: string;
  profileId: string;
}) =>
  callRpc<Every1CoinChatMutationResult>("create_coin_chat_message", {
    input_author_profile_id: input.profileId,
    input_body: input.body,
    input_coin_address: input.coinAddress
  });
