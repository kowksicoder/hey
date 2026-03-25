export type Every1VerificationStatus =
  | "flagged"
  | "pending"
  | "rejected"
  | "unverified"
  | "verified";

export type Every1VerificationProofStatus =
  | "failed"
  | "not_started"
  | "submitted"
  | "verified";

export interface Every1Profile {
  id: string;
  username: null | string;
  displayName: null | string;
  bio: null | string;
  avatarUrl: null | string;
  bannerUrl: null | string;
  walletAddress: null | string;
  lensAccountAddress: null | string;
  zoraHandle: null | string;
  referralCode: null | string;
  e1xpTotal: number;
  verificationStatus: Every1VerificationStatus;
  verificationCategory: null | string;
  verifiedAt: null | string;
}

export interface Every1ProfileVerificationRequest {
  id: string;
  provider: "instagram" | "other" | "tiktok" | "x" | "youtube";
  claimedHandle: string;
  verificationCode: string;
  category: null | string;
  note: null | string;
  adminNote: null | string;
  status: Every1VerificationStatus;
  proofStatus: Every1VerificationProofStatus;
  proofPostUrl: null | string;
  proofPostId: null | string;
  proofPostedText: null | string;
  proofHandle: null | string;
  proofError: null | string;
  proofCheckedAt: null | string;
  proofVerifiedAt: null | string;
  createdAt: string;
  reviewedAt: null | string;
}

export interface Every1VerificationRequestResult
  extends Every1ProfileVerificationRequest {}

export interface Every1ProfileSocialAccount {
  id: string;
  provider: "instagram" | "other" | "tiktok" | "x" | "youtube";
  providerUserId: null | string;
  handle: string;
  displayName: null | string;
  profileUrl: null | string;
  avatarUrl: null | string;
  isPrimary: boolean;
  isVerified: boolean;
  linkedAt: string;
  lastVerifiedAt: null | string;
  createdAt: string;
}

export interface Every1VerificationProofResult {
  id: string;
  status: Every1VerificationStatus;
  proofStatus: Every1VerificationProofStatus;
  proofPostUrl: null | string;
  proofPostId: null | string;
  proofPostedText: null | string;
  proofHandle: null | string;
  proofError: null | string;
  proofCheckedAt: null | string;
  proofVerifiedAt: null | string;
  notificationId: null | string;
}

export interface Every1FollowStats {
  profileId: null | string;
  followers: number;
  following: number;
}

export interface Every1PublicProfileStats {
  creatorCoinAddress: null | string;
  creatorCoinTicker: null | string;
  profileId: null | string;
  referralCoinRewards: number;
}

export interface Every1PublicCollaborationMember {
  acceptedAt: null | string;
  avatarUrl: null | string;
  displayName: null | string;
  inviteExpiresAt: null | string;
  joinedAt: null | string;
  note: null | string;
  profileId: string;
  role: Every1CollaborationMemberRole;
  splitPercent: number;
  status: Every1CollaborationMemberStatus;
  username: null | string;
  walletAddress: null | string;
}

export interface Every1PublicCoinCollaboration {
  activeMemberCount: number;
  coinAddress: string;
  collaborationId: string;
  coverImageUrl: null | string;
  description: null | string;
  launchId: string;
  launchedAt: null | string;
  members: Every1PublicCollaborationMember[];
  ownerAvatarUrl: null | string;
  ownerDisplayName: null | string;
  ownerId: string;
  ownerUsername: null | string;
  ticker: string;
  title: string;
}

export interface Every1CollaborationEarningsSummary {
  allocationCount: number;
  collaborationCount: number;
  lastEarnedAt: null | string;
  latestAmount: number;
  latestCoinSymbol: null | string;
}

export interface Every1CollaborationEarningsItem {
  allocationCount: number;
  coinAddress: null | string;
  coinSymbol: string;
  collaborationId: string;
  lastEarnedAt: null | string;
  ticker: string;
  title: string;
  totalAmount: number;
}

export interface Every1CollaborationRuntimeConfig {
  enabled: boolean;
  payoutEnabled: boolean;
  payoutWalletAddress: null | string;
}

export type Every1CollaborationPayoutStatus = "failed" | "paid" | "recorded";

export interface Every1CollaborationPayoutItem {
  allocationId: string;
  amount: number;
  coinAddress: string;
  coinSymbol: string;
  collaborationId: string;
  createdAt: string;
  errorMessage: null | string;
  payoutAttemptedAt: null | string;
  recipientWalletAddress: null | string;
  sentAt: null | string;
  splitPercent: number;
  status: Every1CollaborationPayoutStatus;
  ticker: string;
  title: string;
  txHash: null | string;
}

export interface Every1CollaborationSettlementItem {
  coinAddress: string;
  coinSymbol: string;
  collaborationId: string;
  collaborationStatus: string;
  failedAmount: number;
  failedCount: number;
  grossAmount: number;
  lastActivityAt: null | string;
  launchStatus: string;
  paidAmount: number;
  paidCount: number;
  payoutsPaused: boolean;
  payoutsPausedAt: null | string;
  payoutsPausedReason: null | string;
  queuedAmount: number;
  queuedCount: number;
  rewardTokenDecimals: number;
  sourceTypes: string[];
  ticker: string;
  title: string;
  totalCount: number;
  viewerSplitPercent: number;
}

export interface Every1CollaborationPayoutAuditItem {
  allocationId: string;
  amount: number;
  coinAddress: string;
  coinSymbol: string;
  collaborationId: string;
  createdAt: string;
  errorMessage: null | string;
  payoutAttemptedAt: null | string;
  recipientName: null | string;
  recipientProfileId: string;
  recipientUsername: null | string;
  recipientWalletAddress: null | string;
  sentAt: null | string;
  sourceType: string;
  splitPercent: number;
  status: Every1CollaborationPayoutStatus;
  ticker: string;
  title: string;
  txHash: null | string;
}

export interface Every1WalletRewardToken {
  lastReceivedAt: null | string;
  rewardCount: number;
  tokenAddress: string;
  tokenDecimals: number;
  tokenSymbol: string;
}

export interface Every1WalletActivityItem {
  activityId: string;
  activityKind: "collaboration_payout" | "fandrop_reward";
  amount: number;
  createdAt: string;
  sourceName: string;
  status: string;
  targetKey: null | string;
  tokenAddress: string;
  tokenSymbol: string;
  txHash: null | string;
}

export type Every1CollaborationStatus =
  | "active"
  | "archived"
  | "closed"
  | "draft"
  | "open"
  | "paused";

export type Every1CollaborationMemberRole =
  | "contributor"
  | "editor"
  | "owner"
  | "viewer";

export type Every1CollaborationMemberStatus =
  | "active"
  | "declined"
  | "invited"
  | "left"
  | "removed"
  | "requested";

export interface Every1CollaborationMember {
  acceptedAt: null | string;
  avatarUrl: null | string;
  displayName: null | string;
  inviteExpiresAt: null | string;
  joinedAt: null | string;
  note: null | string;
  profileId: string;
  role: Every1CollaborationMemberRole;
  splitPercent: number;
  status: Every1CollaborationMemberStatus;
  username: null | string;
}

export interface Every1Collaboration {
  acceptedAt: null | string;
  activeMemberCount: number;
  collaborationId: string;
  coinAddress: null | string;
  coverImageUrl: null | string;
  createdAt: string;
  description: null | string;
  inviteExpiresAt: null | string;
  isExpired: boolean;
  launchId: null | string;
  metadataUri: null | string;
  launchStatus:
    | "archived"
    | "draft"
    | "failed"
    | "launched"
    | "launching"
    | "queued"
    | "ready";
  members: Every1CollaborationMember[];
  ownerAvatarUrl: null | string;
  ownerDisplayName: null | string;
  ownerId: string;
  ownerUsername: null | string;
  pendingMemberCount: number;
  splitLockedAt: null | string;
  status: Every1CollaborationStatus;
  ticker: string;
  title: string;
  viewerCanCancel: boolean;
  viewerCanLaunch: boolean;
  viewerCanRespond: boolean;
  viewerRole: Every1CollaborationMemberRole | null;
  viewerStatus: Every1CollaborationMemberStatus | null;
}

export interface Every1CollaborationInviteInput {
  collaboratorProfileId: string;
  collaboratorUsername: string;
  coverImageUrl?: null | string;
  creatorSplit: number;
  description?: null | string;
  inviteNote?: null | string;
  metadataUri?: null | string;
  name: string;
  supply?: number;
  ticker: string;
}

export interface Every1CollaborationInviteResult {
  collaborationId: string;
  collaboratorDisplayName: null | string;
  launchId: string;
  notificationId: null | string;
  status: Every1CollaborationStatus;
  ticker: string;
  title: string;
}

export interface Every1CollaborationResponseResult {
  collaborationId: string;
  decision: "accept" | "decline";
  notificationId: null | string;
  status: Every1CollaborationStatus;
}

export interface Every1CollaborationCancelResult {
  collaborationId: string;
  notificationId: null | string;
  status: Every1CollaborationStatus;
}

export interface Every1CollaborationLaunchResult {
  coinAddress: string;
  collaborationId: string;
  launchId: string;
  notificationId: null | string;
  status: Every1CollaborationStatus;
}

export interface Every1FollowRelationship {
  isFollowedByMe: boolean;
  isFollowingMe: boolean;
}

export interface Every1FollowListProfile {
  id: string;
  username: null | string;
  displayName: null | string;
  bio: null | string;
  avatarUrl: null | string;
  bannerUrl: null | string;
  walletAddress: null | string;
  lensAccountAddress: null | string;
  zoraHandle: null | string;
  followedAt: string;
}

export interface Every1FollowMutationResult {
  created?: boolean;
  deleted?: boolean;
  following: boolean;
  notificationId?: null | string;
  reason?: null | string;
  targetProfileId?: null | string;
}

export interface Every1CommunitySummary {
  id: string;
  slug: string;
  name: string;
  description: null | string;
  avatarUrl: null | string;
  bannerUrl: null | string;
  visibility: "private" | "public";
  status: "active" | "archived" | "draft";
  ownerId: string;
  ownerDisplayName: null | string;
  ownerUsername: null | string;
  ownerAvatarUrl: null | string;
  memberCount: number;
  postCount: number;
  membershipRole: null | "member" | "moderator" | "owner";
  membershipStatus:
    | null
    | "active"
    | "blocked"
    | "invited"
    | "left"
    | "rejected"
    | "removed"
    | "requested";
  isMember: boolean;
  isOwner: boolean;
  joinedAt: null | string;
  verificationStatus: Every1VerificationStatus;
  verificationKind: null | "community_led" | "official";
  verifiedAt: null | string;
}

export interface Every1CommunityMember {
  id: string;
  username: null | string;
  displayName: null | string;
  avatarUrl: null | string;
  walletAddress: null | string;
  role: "member" | "moderator" | "owner";
  joinedAt: null | string;
}

export interface Every1CommunityDetails extends Every1CommunitySummary {
  membersPreview: Every1CommunityMember[];
}

export interface Every1CommunityVerificationContext {
  requestId: string;
  communityId: string;
  requestedByProfileId: string;
  requestedByDisplayName: null | string;
  requestedByUsername: null | string;
  verificationKind: "community_led" | "official";
  verificationCode: string;
  category: null | string;
  groupPlatform: null | "other" | "telegram" | "whatsapp";
  groupUrl: null | string;
  note: null | string;
  adminNote: null | string;
  status: Every1VerificationStatus;
  requiredAdminCount: number;
  confirmedAdminCount: number;
  pendingAdminCount: number;
  createdAt: string;
  reviewedAt: null | string;
  viewerIsRequester: boolean;
  viewerCanConfirm: boolean;
  viewerConfirmed: boolean;
}

export interface Every1CommunityVerificationConfirmation {
  id: string;
  profileId: string;
  username: null | string;
  displayName: null | string;
  avatarUrl: null | string;
  walletAddress: null | string;
  invitedIdentifier: null | string;
  roleLabel: null | string;
  status: "confirmed" | "pending";
  confirmedAt: null | string;
  createdAt: string;
}

export interface Every1CommunityVerificationRequestResult {
  id: string;
  communityId: string;
  verificationKind: "community_led" | "official";
  verificationCode: string;
  category: null | string;
  groupPlatform: null | "other" | "telegram" | "whatsapp";
  groupUrl: null | string;
  note: null | string;
  status: Every1VerificationStatus;
  requiredAdminCount: number;
  confirmedAdminCount: number;
  createdAt: string;
}

export interface Every1CommunityVerificationConfirmationResult {
  confirmed: boolean;
  requestId: string;
  communityId: string;
  confirmedAdminCount: number;
  requiredAdminCount: number;
  reason: null | string;
}

export interface Every1VerifiedCommunityLink {
  walletAddress: string;
  communityId: string;
  communitySlug: string;
  communityName: string;
  communityAvatarUrl: null | string;
  verifiedAt: null | string;
}

export interface Every1CommunityMutationResult {
  communityId: null | string;
  created?: boolean;
  isMember?: boolean;
  left?: boolean;
  name?: null | string;
  notificationId?: null | string;
  postId?: null | string;
  reason?: null | string;
  slug?: null | string;
  status?: null | string;
  visibility?: null | string;
}

export interface Every1CommunityPost {
  id: string;
  communityId: string;
  authorProfileId: string;
  authorUsername: null | string;
  authorDisplayName: null | string;
  authorAvatarUrl: null | string;
  body: string;
  mediaUrl: null | string;
  createdAt: string;
  updatedAt: string;
}

export interface Every1CommunityChatMessage {
  id: string;
  communityId: string;
  authorProfileId: string;
  authorUsername: null | string;
  authorDisplayName: null | string;
  authorAvatarUrl: null | string;
  body: string;
  createdAt: string;
}

export interface Every1CommunityChatMutationResult {
  communityId?: null | string;
  created: boolean;
  messageId?: null | string;
  reason?: null | string;
}

export interface Every1CoinChatMessage {
  id: string;
  coinAddress: string;
  authorProfileId: string;
  authorUsername: null | string;
  authorDisplayName: null | string;
  authorAvatarUrl: null | string;
  body: string;
  createdAt: string;
}

export interface Every1CoinChatMutationResult {
  coinAddress?: null | string;
  created: boolean;
  messageId?: null | string;
  reason?: null | string;
}

export interface Every1EngagementNudgeSignals {
  activeCreatorOfWeek: null | {
    campaignId: string;
    category: null | string;
    creatorEarningsUsd: number;
    displayName: null | string;
    featuredPriceUsd: number;
    profileId: string;
    username: null | string;
    walletAddress: null | string;
  };
  activeMissionCount: number;
  cooldownUntil: null | string;
  latestLeaderboardUpdate: null | {
    body: null | string;
    id: string;
    targetKey: null | string;
    title: string;
  };
  latestMission: null | {
    id: string;
    rewardE1xp: number;
    slug: string;
    title: string;
  };
  missionWinners24h: number;
  newDropsCount: number;
  topPerkMission: null | {
    id: string;
    rewardE1xp: number;
    slug: string;
    title: string;
  };
}

export interface Every1EngagementNudgeResult {
  body: null | string;
  created: boolean;
  createdAt: null | string;
  data: Record<string, unknown>;
  id: null | string;
  kind: null | "nudge";
  reason: null | string;
  targetKey: null | string;
  title: null | string;
}

export interface Every1ActivePopupCampaign {
  id: string;
  title: string;
  body: string;
  bannerUrl: null | string;
  eventTag: null | string;
  ctaLabel: null | string;
  ctaUrl: null | string;
  priority: number;
  triggeredAt: null | string;
}

export interface ReferralDashboardProfile {
  id: string;
  username: null | string;
  displayName: null | string;
  avatarUrl: null | string;
  walletAddress: null | string;
  lensAccountAddress: null | string;
}

export interface ReferralDashboardStats {
  joinedCount: number;
  rewardedCount: number;
  totalE1xp: number;
  totalCoinRewards: number;
}

export interface ReferralRecentEntry {
  id: string;
  status: string;
  joinedAt: null | string;
  rewardedAt: null | string;
  rewardE1xp: number;
  referredProfileId: string;
  displayName: null | string;
  username: null | string;
  avatarUrl: null | string;
  walletAddress: null | string;
}

export interface ReferralTradeRewardEntry {
  id: string;
  coinAddress: string;
  coinSymbol: string;
  rewardAmount: number;
  rewardPercent: number;
  tradeSide: "buy" | "sell";
  tradeAmountIn: number;
  tradeAmountOut: number;
  txHash: string;
  createdAt: string;
  referredProfileId: string;
  displayName: null | string;
  username: null | string;
  avatarUrl: null | string;
}

export interface E1xpLedgerEntry {
  id: string;
  source: string;
  amount: number;
  description: null | string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface DailyStreakDay {
  date: string;
  label: string;
  dayOfMonth: number;
  completed: boolean;
  isToday: boolean;
}

export interface DailyStreakRewardEntry {
  id: string;
  amount: number;
  description: null | string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface DailyStreakDashboard {
  profileId: string;
  currentStreak: number;
  longestStreak: number;
  streakFreezes: number;
  lastActivityDate: null | string;
  claimedToday: boolean;
  todayRewardE1xp: number;
  totalStreakE1xp: number;
  nextMilestone: number;
  nextMilestoneRewardE1xp: number;
  last7Days: DailyStreakDay[];
  recentRewards: DailyStreakRewardEntry[];
}

export interface DailyStreakClaimResult {
  claimed: boolean;
  alreadyClaimed: boolean;
  activityDate: string;
  currentStreak: number;
  longestStreak: number;
  rewardE1xp: number;
  resetOccurred: boolean;
  milestoneReached: boolean;
  notificationId: null | string;
  dashboard: DailyStreakDashboard;
}

export interface Every1Mission {
  id: string;
  slug: string;
  title: string;
  description: null | string;
  status: "active" | "archived" | "completed" | "draft" | "paused";
  rewardE1xp: number;
  isRepeatable: boolean;
  taskType:
    | "comment"
    | "community_join"
    | "custom"
    | "launch_creator"
    | "like"
    | "payment"
    | "referral"
    | "share"
    | "streak_check_in";
  taskTitle: string;
  currentValue: number;
  targetValue: number;
  progressStatus:
    | "claimed"
    | "completed"
    | "expired"
    | "in_progress"
    | "not_started";
  completedAt: null | string;
  claimedAt: null | string;
  availableToClaim: boolean;
  percentComplete: number;
}

export interface MissionClaimResult {
  claimed: boolean;
  alreadyClaimed: boolean;
  missionId: string;
  missionTitle?: string;
  notificationId?: null | string;
  rewardE1xp?: number;
  reason?: string;
}

export interface Every1FanDropCampaignNotificationInput {
  creatorName: string;
  rewardPoolLabel: string;
  slug: string;
  state: "completed" | "joined" | "live";
  title: string;
}

export interface Every1FanDropNotificationSyncResult {
  createdCount: number;
  deliveredCampaignSlugs: string[];
}

export interface Every1FanDropJoinResult {
  alreadyJoined: boolean;
  campaignSlug: string;
  joined: boolean;
  joinedAt?: null | string;
  notificationId?: null | string;
  reason?: string;
}

export interface Every1FanDropParticipation {
  campaignSlug: string;
  joinedAt: string;
}

export type Every1FanDropSettlementStatus =
  | "failed"
  | "funded"
  | "pending_funding"
  | "settled"
  | "settling";

export interface Every1FanDropTask {
  currentValue: number;
  id: string;
  isOptional: boolean;
  label: string;
  progressLabel: null | string;
  state: "complete" | "optional" | "todo";
  targetValue: number;
}

export interface Every1FanDropCampaign {
  about: null | string;
  bannerUrl: null | string;
  coverLabel: null | string;
  creatorHandle: null | string;
  creatorName: null | string;
  creatorProfileId: null | string;
  ctaLabel: string;
  endsAt: null | string;
  fundedAt: null | string;
  fundingTxHash: null | string;
  id: string;
  isJoined: boolean;
  missionId: string;
  participantCount: number;
  progressComplete: number;
  progressTotal: number;
  rank: null | number;
  rankLabel: string;
  rewardE1xp: number;
  rewardFailedCount: number;
  rewardPoolAmount: null | number | string;
  rewardPoolLabel: null | string;
  rewardSentCount: number;
  rewardTokenAddress: null | string;
  rewardTokenDecimals: null | number;
  rewardTokenSymbol: null | string;
  settlementStatus: null | Every1FanDropSettlementStatus;
  slug: string;
  startsAt: null | string;
  status: "active" | "archived" | "completed" | "draft" | "paused";
  state: "completed" | "ended" | "joined" | "live";
  subtitle: null | string;
  tasks: Every1FanDropTask[];
  timeLabel: string;
  title: string;
  winnerLimit: null | number;
}

export interface Every1FanDropUpsertInput {
  about?: null | string;
  bannerUrl?: null | string;
  buyAmount?: null | number;
  coverLabel?: null | string;
  endsAt?: null | string;
  isBuyOptional?: boolean;
  missionId?: null | string;
  referralTarget?: number;
  rewardE1xp?: number;
  rewardPoolAmount?: null | number;
  rewardPoolLabel?: null | string;
  rewardTokenAddress?: null | string;
  rewardTokenDecimals?: number;
  rewardTokenSymbol?: null | string;
  startsAt?: null | string;
  status?: "active" | "archived" | "completed" | "draft" | "paused";
  subtitle?: null | string;
  title: string;
  winnerLimit?: null | number;
}

export interface Every1FanDropUpsertResult {
  created?: boolean;
  creatorProfileId?: null | string;
  id?: null | string;
  rewardPoolAmount?: null | number | string;
  rewardPoolConfigured?: boolean;
  rewardTokenAddress?: null | string;
  rewardTokenSymbol?: null | string;
  settlementStatus?: null | Every1FanDropSettlementStatus;
  slug?: null | string;
  status?: null | string;
  title?: null | string;
}

export interface Every1FanDropRuntimeConfig {
  enabled: boolean;
  payoutWalletAddress: null | string;
  settlementEnabled: boolean;
}

export interface ReferralDashboard {
  profile: null | ReferralDashboardProfile;
  referralCode: null | string;
  bonusPercent: number;
  stats: ReferralDashboardStats;
  recentReferrals: ReferralRecentEntry[];
  recentTradeRewards: ReferralTradeRewardEntry[];
  recentE1xp: E1xpLedgerEntry[];
}

export interface ReferralJoinResult {
  captured: boolean;
  e1xpAwarded?: number;
  reason?: string;
  eventId?: string;
  referrerId?: string;
  status?: string;
}

export interface ReferralRewardResult {
  rewardGranted: boolean;
  reason?: string;
  eventId?: string;
  tradeRewardId?: string;
  rewardAmount?: number;
  rewardPercent?: number;
  rewardSymbol?: string;
  e1xpAwarded?: number;
}

export type Every1MobileNavBadgeKey =
  | "creators_new_profiles"
  | "explore_new_coins"
  | "leaderboard_updates";

export interface Every1MobileNavBadgeCounts {
  creatorsCount: number;
  exploreCount: number;
  leaderboardCount: number;
}

export interface Every1MobileNavBadgeSeenResult {
  badgeKey: Every1MobileNavBadgeKey;
  lastSeenAt: string;
  profileId: string;
}

export interface Every1Notification {
  id: string;
  kind:
    | "comment"
    | "community"
    | "follow"
    | "like"
    | "mission"
    | "payment"
    | "referral"
    | "reward"
    | "share"
    | "streak"
    | "nudge"
    | "system"
    | "toast"
    | "verification"
    | "welcome";
  title: string;
  body: null | string;
  isRead: boolean;
  createdAt: string;
  targetKey: null | string;
  data: Record<string, unknown>;
  actorId: null | string;
  actorDisplayName: null | string;
  actorUsername: null | string;
  actorAvatarUrl: null | string;
}
