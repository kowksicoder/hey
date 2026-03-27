import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  UserPlusIcon
} from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createCoin, setApiKey } from "@zoralabs/coins-sdk";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import type { Address } from "viem";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { base } from "viem/chains";
import { useAccount, useConfig, useWalletClient } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import Loader from "@/components/Shared/Loader";
import { BASE_RPC_URL, ZORA_API_KEY } from "@/data/constants";
import formatRelativeOrAbsolute from "@/helpers/datetime/formatRelativeOrAbsolute";
import {
  cancelCollaborationCoinInvite,
  completeCollaborationCoinLaunch,
  EVERY1_COLLABORATION_EARNINGS_QUERY_KEY,
  EVERY1_COLLABORATION_EARNINGS_SUMMARY_QUERY_KEY,
  EVERY1_COLLABORATION_PAYOUT_AUDIT_QUERY_KEY,
  EVERY1_COLLABORATION_PAYOUTS_QUERY_KEY,
  EVERY1_COLLABORATION_SETTLEMENTS_QUERY_KEY,
  EVERY1_COLLABORATIONS_QUERY_KEY,
  EVERY1_NOTIFICATION_COUNT_QUERY_KEY,
  EVERY1_NOTIFICATIONS_QUERY_KEY,
  getCollaborationRuntimeConfig,
  getProfileCollaborationEarningsSummary,
  listProfileCollaborationEarnings,
  listProfileCollaborationPayoutAudit,
  listProfileCollaborationPayouts,
  listProfileCollaborationSettlements,
  listProfileCollaborations,
  respondToCollaborationCoinInvite
} from "@/helpers/every1";
import { toViemWalletClient } from "@/helpers/executionWallet";
import formatAddress from "@/helpers/formatAddress";
import sanitizeDStorageUrl from "@/helpers/sanitizeDStorageUrl";
import { announceTelegramCoinLaunch } from "@/helpers/telegramAnnouncements";
import useCopyToClipboard from "@/hooks/useCopyToClipboard";
import useEvery1ExecutionWallet from "@/hooks/useEvery1ExecutionWallet";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";
import type {
  Every1Collaboration,
  Every1CollaborationEarningsItem,
  Every1CollaborationPayoutItem,
  Every1CollaborationSettlementItem
} from "@/types/every1";
import {
  ActionStatusModal,
  Button,
  Card,
  ErrorMessage,
  Image
} from "../Shared/UI";

setApiKey(ZORA_API_KEY);

type CollaborationStatusModalState = null | {
  description?: string;
  title: string;
  tone: "pending" | "success";
};

const statusMeta: Record<
  Every1Collaboration["status"],
  { className: string; label: string }
> = {
  active: {
    className:
      "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300",
    label: "Active"
  },
  archived: {
    className: "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    label: "Archived"
  },
  closed: {
    className:
      "bg-rose-500/12 text-rose-700 dark:bg-rose-500/12 dark:text-rose-300",
    label: "Closed"
  },
  draft: {
    className:
      "bg-amber-500/12 text-amber-700 dark:bg-amber-500/12 dark:text-amber-300",
    label: "Pending"
  },
  open: {
    className:
      "bg-sky-500/12 text-sky-700 dark:bg-sky-500/12 dark:text-sky-300",
    label: "Ready"
  },
  paused: {
    className:
      "bg-orange-500/12 text-orange-700 dark:bg-orange-500/12 dark:text-orange-300",
    label: "Paused"
  }
};

const formatSplitPercent = (value: number) =>
  Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, "");

const formatTokenAmount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 100 ? 0 : value >= 1 ? 2 : 4,
    minimumFractionDigits: 0
  }).format(value);
};

const payoutStatusMeta: Record<
  Every1CollaborationPayoutItem["status"],
  { className: string; label: string }
> = {
  failed: {
    className:
      "bg-rose-500/12 text-rose-700 dark:bg-rose-500/12 dark:text-rose-300",
    label: "Failed"
  },
  paid: {
    className:
      "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300",
    label: "Paid"
  },
  recorded: {
    className:
      "bg-sky-500/12 text-sky-700 dark:bg-sky-500/12 dark:text-sky-300",
    label: "Queued"
  }
};

const settlementStatusMeta = (
  settlement: Every1CollaborationSettlementItem,
  availableBalance: number
) => {
  if (settlement.payoutsPaused) {
    return {
      className:
        "bg-amber-500/12 text-amber-700 dark:bg-amber-500/12 dark:text-amber-300",
      label: "Paused"
    };
  }

  const outstanding = settlement.queuedAmount + settlement.failedAmount;

  if (outstanding <= 0) {
    return {
      className:
        "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300",
      label: "Settled"
    };
  }

  if (availableBalance >= outstanding) {
    return {
      className:
        "bg-sky-500/12 text-sky-700 dark:bg-sky-500/12 dark:text-sky-300",
      label: "Funded"
    };
  }

  return {
    className:
      "bg-rose-500/12 text-rose-700 dark:bg-rose-500/12 dark:text-rose-300",
    label: "Shortfall"
  };
};

const formatSourceType = (value: string) =>
  value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

const CollaborationCard = ({
  collaboration,
  earnings,
  isActing,
  isCurrentProfile,
  onCancel,
  onLaunch,
  onRespond
}: {
  collaboration: Every1Collaboration;
  earnings?: Every1CollaborationEarningsItem;
  isActing: boolean;
  isCurrentProfile: boolean;
  onCancel: (collaborationId: string) => Promise<void>;
  onLaunch: (collaboration: Every1Collaboration) => Promise<void>;
  onRespond: (
    collaborationId: string,
    decision: "accept" | "decline"
  ) => Promise<void>;
}) => {
  const splitLabel = useMemo(
    () =>
      collaboration.members
        .map((member) => {
          const label = member.displayName || member.username || "Creator";
          return `${label} ${formatSplitPercent(member.splitPercent)}%`;
        })
        .join(" | "),
    [collaboration.members]
  );
  const displayStatus = collaboration.isExpired
    ? {
        className:
          "bg-rose-500/12 text-rose-700 dark:bg-rose-500/12 dark:text-rose-300",
        label: "Expired"
      }
    : statusMeta[collaboration.status];
  const confirmationLabel = `${collaboration.activeMemberCount}/${collaboration.members.length} confirmed`;

  return (
    <Card className="overflow-hidden border border-gray-200/70 bg-white p-0 shadow-none dark:border-gray-800 dark:bg-black">
      <div className="flex items-start gap-3 p-4">
        <div className="shrink-0">
          {collaboration.coverImageUrl ? (
            <Image
              alt={collaboration.title}
              className="size-14 rounded-2xl object-cover"
              src={collaboration.coverImageUrl}
            />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-900 dark:text-gray-500">
              <UserPlusIcon className="size-6" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-base text-gray-950 dark:text-white">
              {collaboration.title}
            </p>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold text-[11px] ${displayStatus.className}`}
            >
              {displayStatus.label}
            </span>
          </div>

          <p className="mt-1 text-gray-500 text-xs uppercase tracking-[0.18em] dark:text-gray-400">
            {"\u20A6"}
            {collaboration.ticker}
          </p>

          {collaboration.description ? (
            <p className="mt-2 text-gray-600 text-sm leading-5 dark:text-gray-300">
              {collaboration.description}
            </p>
          ) : null}

          <div className="mt-3 grid gap-2 text-[12px] text-gray-500 dark:text-gray-400">
            <p>Split: {splitLabel}</p>
            <p>
              Terms:{" "}
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {confirmationLabel}
              </span>
            </p>
            <p>
              Created {formatRelativeOrAbsolute(collaboration.createdAt)}
              {collaboration.inviteExpiresAt &&
              (collaboration.viewerCanRespond ||
                collaboration.viewerCanCancel ||
                collaboration.isExpired)
                ? ` | expires ${formatRelativeOrAbsolute(collaboration.inviteExpiresAt)}`
                : ""}
            </p>
            <p>
              Coin status:{" "}
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {collaboration.launchStatus === "ready"
                  ? "Ready to launch"
                  : collaboration.launchStatus}
              </span>
            </p>
          </div>

          {collaboration.isExpired ? (
            <p className="mt-3 text-rose-600 text-xs dark:text-rose-300">
              {collaboration.viewerCanCancel
                ? "This invite expired. Cancel it and send a fresh collaboration request."
                : "This collaboration invite expired before it was accepted."}
            </p>
          ) : null}

          {collaboration.viewerCanRespond && isCurrentProfile ? (
            <div className="mt-4 space-y-3">
              <p className="text-gray-500 text-xs dark:text-gray-400">
                By accepting, you agree to this revenue split.
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={isActing}
                  onClick={() =>
                    void onRespond(collaboration.collaborationId, "accept")
                  }
                  outline
                >
                  Accept
                </Button>
                <Button
                  className="flex-1"
                  disabled={isActing}
                  onClick={() =>
                    void onRespond(collaboration.collaborationId, "decline")
                  }
                >
                  Decline
                </Button>
              </div>
            </div>
          ) : null}

          {collaboration.viewerCanCancel && isCurrentProfile ? (
            <div className="mt-4 flex justify-end">
              <Button
                disabled={isActing}
                onClick={() => void onCancel(collaboration.collaborationId)}
                outline
              >
                {collaboration.isExpired
                  ? "Close expired invite"
                  : "Cancel invite"}
              </Button>
            </div>
          ) : null}

          {collaboration.viewerCanLaunch && isCurrentProfile ? (
            <div className="mt-4 space-y-2">
              <p className="text-gray-500 text-xs dark:text-gray-400">
                Everyone accepted the split. You can launch the shared coin now.
              </p>
              <Button
                className="w-full"
                disabled={isActing}
                onClick={() => void onLaunch(collaboration)}
              >
                Launch coin
              </Button>
            </div>
          ) : null}

          {collaboration.coinAddress ? (
            <div className="mt-4">
              <Link to={`/coins/${collaboration.coinAddress}`}>
                <Button className="w-full" outline>
                  View live coin
                </Button>
              </Link>
            </div>
          ) : null}

          {isCurrentProfile && earnings ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-emerald-700/80 uppercase tracking-[0.16em] dark:text-emerald-300/80">
                    Your earnings
                  </p>
                  <p className="mt-1 font-semibold text-emerald-900 text-sm dark:text-emerald-100">
                    {formatTokenAmount(earnings.totalAmount)}{" "}
                    {earnings.coinSymbol}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-emerald-700/80 uppercase tracking-[0.16em] dark:text-emerald-300/80">
                    Reward records
                  </p>
                  <p className="mt-1 font-semibold text-emerald-900 text-sm dark:text-emerald-100">
                    {earnings.allocationCount}
                  </p>
                </div>
              </div>
              {earnings.lastEarnedAt ? (
                <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                  Last recorded{" "}
                  {formatRelativeOrAbsolute(earnings.lastEarnedAt)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
};

const CollaborationSettlementCard = ({
  availableBalance,
  settlement
}: {
  availableBalance: number;
  settlement: Every1CollaborationSettlementItem;
}) => {
  const outstandingAmount = settlement.queuedAmount + settlement.failedAmount;
  const shortfallAmount = Math.max(outstandingAmount - availableBalance, 0);
  const fundingState = settlementStatusMeta(settlement, availableBalance);

  return (
    <Card className="border border-gray-200/70 bg-white px-4 py-4 shadow-none dark:border-gray-800 dark:bg-black">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-base text-gray-950 dark:text-white">
              {settlement.title}
            </p>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold text-[11px] ${fundingState.className}`}
            >
              {fundingState.label}
            </span>
          </div>
          <p className="mt-1 text-gray-500 text-xs uppercase tracking-[0.16em] dark:text-gray-400">
            {"\u20A6"}
            {settlement.ticker} | your share{" "}
            {formatSplitPercent(settlement.viewerSplitPercent)}%
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {settlement.sourceTypes.length ? (
            settlement.sourceTypes.map((sourceType) => (
              <span
                className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600 dark:bg-gray-900 dark:text-gray-300"
                key={`${settlement.collaborationId}-${sourceType}`}
              >
                {formatSourceType(sourceType)}
              </span>
            ))
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              No revenue sources yet
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
            Gross
          </p>
          <p className="mt-1 font-semibold text-gray-950 text-sm dark:text-white">
            {formatTokenAmount(settlement.grossAmount)} {settlement.coinSymbol}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
            Paid
          </p>
          <p className="mt-1 font-semibold text-gray-950 text-sm dark:text-white">
            {formatTokenAmount(settlement.paidAmount)} {settlement.coinSymbol}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
            Queued
          </p>
          <p className="mt-1 font-semibold text-gray-950 text-sm dark:text-white">
            {formatTokenAmount(settlement.queuedAmount)} {settlement.coinSymbol}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
            Failed
          </p>
          <p className="mt-1 font-semibold text-gray-950 text-sm dark:text-white">
            {formatTokenAmount(settlement.failedAmount)} {settlement.coinSymbol}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-1 text-[12px] text-gray-500 dark:text-gray-400">
        <p>
          Payout wallet cover:{" "}
          <span className="font-semibold text-gray-700 dark:text-gray-200">
            {formatTokenAmount(availableBalance)} {settlement.coinSymbol}
          </span>
          {outstandingAmount > 0
            ? ` | outstanding ${formatTokenAmount(outstandingAmount)} ${settlement.coinSymbol}`
            : ""}
        </p>
        {shortfallAmount > 0 ? (
          <p className="text-rose-600 dark:text-rose-300">
            Shortfall: {formatTokenAmount(shortfallAmount)}{" "}
            {settlement.coinSymbol}
          </p>
        ) : null}
        {settlement.payoutsPausedReason ? (
          <p className="text-amber-700 dark:text-amber-300">
            Pause reason: {settlement.payoutsPausedReason}
          </p>
        ) : null}
        <p>
          Latest activity{" "}
          <span className="font-semibold text-gray-700 dark:text-gray-200">
            {settlement.lastActivityAt
              ? formatRelativeOrAbsolute(settlement.lastActivityAt)
              : "No payout activity yet"}
          </span>
        </p>
      </div>
    </Card>
  );
};

const Collaborations = ({
  creatorName,
  creatorProfileId,
  isCurrentProfile
}: {
  creatorName: string;
  creatorProfileId?: null | string;
  isCurrentProfile: boolean;
}) => {
  const navigate = useNavigate();
  const { address } = useAccount();
  const config = useConfig();
  const { data: walletClient } = useWalletClient({ chainId: base.id });
  const queryClient = useQueryClient();
  const { profile } = useEvery1Store();
  const {
    executionWalletAddress,
    executionWalletClient,
    identityWalletAddress,
    identityWalletClient
  } = useEvery1ExecutionWallet();
  const [actingCollaborationId, setActingCollaborationId] = useState<
    null | string
  >(null);
  const [statusModal, setStatusModal] =
    useState<CollaborationStatusModalState>(null);
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: base,
        transport: http(BASE_RPC_URL, { batch: { batchSize: 30 } })
      }),
    []
  );
  const runtimeConfigQuery = useQuery({
    enabled: isCurrentProfile,
    queryFn: getCollaborationRuntimeConfig,
    queryKey: ["collaboration-runtime-config"],
    staleTime: 60000
  });
  const collaborationsQuery = useQuery({
    enabled: Boolean(creatorProfileId),
    queryFn: () =>
      listProfileCollaborations(creatorProfileId || "", {
        includePrivate: isCurrentProfile
      }),
    queryKey: [
      EVERY1_COLLABORATIONS_QUERY_KEY,
      creatorProfileId,
      isCurrentProfile ? "private" : "public"
    ]
  });
  const collaborationEarningsSummaryQuery = useQuery({
    enabled: Boolean(creatorProfileId && isCurrentProfile),
    queryFn: () =>
      getProfileCollaborationEarningsSummary(creatorProfileId || ""),
    queryKey: [
      EVERY1_COLLABORATION_EARNINGS_SUMMARY_QUERY_KEY,
      creatorProfileId
    ]
  });
  const collaborationEarningsQuery = useQuery({
    enabled: Boolean(creatorProfileId && isCurrentProfile),
    queryFn: () => listProfileCollaborationEarnings(creatorProfileId || ""),
    queryKey: [EVERY1_COLLABORATION_EARNINGS_QUERY_KEY, creatorProfileId]
  });
  const collaborationPayoutsQuery = useQuery({
    enabled: Boolean(creatorProfileId && isCurrentProfile),
    queryFn: () => listProfileCollaborationPayouts(creatorProfileId || ""),
    queryKey: [EVERY1_COLLABORATION_PAYOUTS_QUERY_KEY, creatorProfileId]
  });
  const collaborationSettlementsQuery = useQuery({
    enabled: Boolean(creatorProfileId && isCurrentProfile),
    queryFn: () => listProfileCollaborationSettlements(creatorProfileId || ""),
    queryKey: [EVERY1_COLLABORATION_SETTLEMENTS_QUERY_KEY, creatorProfileId]
  });
  const collaborationPayoutAuditQuery = useQuery({
    enabled: Boolean(creatorProfileId && isCurrentProfile),
    queryFn: () => listProfileCollaborationPayoutAudit(creatorProfileId || ""),
    queryKey: [EVERY1_COLLABORATION_PAYOUT_AUDIT_QUERY_KEY, creatorProfileId]
  });
  const copyPayoutWallet = useCopyToClipboard(
    runtimeConfigQuery.data?.payoutWalletAddress || "",
    "Payout wallet copied"
  );

  const collaborations = collaborationsQuery.data || [];
  const collaborationEarnings = collaborationEarningsQuery.data || [];
  const collaborationPayouts = collaborationPayoutsQuery.data || [];
  const collaborationSettlements = collaborationSettlementsQuery.data || [];
  const collaborationPayoutAudit = collaborationPayoutAuditQuery.data || [];
  const earningsSummary = collaborationEarningsSummaryQuery.data;
  const pendingCount = collaborations.filter(
    (collaboration) => collaboration.viewerCanRespond
  ).length;
  const outgoingCount = collaborations.filter(
    (collaboration) => collaboration.viewerCanCancel
  ).length;
  const expiredCount = collaborations.filter(
    (collaboration) => collaboration.viewerCanCancel && collaboration.isExpired
  ).length;
  const earningsByCollaboration = useMemo(
    () =>
      new Map(
        collaborationEarnings.map((earning) => [
          earning.collaborationId,
          earning
        ])
      ),
    [collaborationEarnings]
  );
  const payoutSummary = useMemo(
    () => ({
      failed: collaborationPayouts.filter((item) => item.status === "failed")
        .length,
      paid: collaborationPayouts.filter((item) => item.status === "paid")
        .length,
      recorded: collaborationPayouts.filter(
        (item) => item.status === "recorded"
      ).length
    }),
    [collaborationPayouts]
  );
  const settlementSummary = useMemo(
    () => ({
      failedAmount: collaborationSettlements.reduce(
        (sum, item) => sum + item.failedAmount,
        0
      ),
      grossAmount: collaborationSettlements.reduce(
        (sum, item) => sum + item.grossAmount,
        0
      ),
      paidAmount: collaborationSettlements.reduce(
        (sum, item) => sum + item.paidAmount,
        0
      ),
      pausedCount: collaborationSettlements.filter((item) => item.payoutsPaused)
        .length,
      queuedAmount: collaborationSettlements.reduce(
        (sum, item) => sum + item.queuedAmount,
        0
      )
    }),
    [collaborationSettlements]
  );
  const fundingBalancesQuery = useQuery({
    enabled: Boolean(
      isCurrentProfile &&
        runtimeConfigQuery.data?.payoutWalletAddress &&
        collaborationSettlements.length
    ),
    queryFn: async () => {
      const uniqueSettlements = Array.from(
        new Map(
          collaborationSettlements.map((settlement) => [
            settlement.coinAddress,
            settlement
          ])
        ).values()
      );
      const contracts = uniqueSettlements.map((settlement) => ({
        abi: erc20Abi,
        address: settlement.coinAddress as Address,
        args: [runtimeConfigQuery.data?.payoutWalletAddress as Address],
        functionName: "balanceOf" as const
      }));

      if (!contracts.length) {
        return {} as Record<string, number>;
      }

      const balances = await publicClient.multicall({
        allowFailure: true,
        contracts
      });

      return Object.fromEntries(
        balances.map((result, index) => {
          const settlement = contracts[index];
          const token = uniqueSettlements[index];
          const value =
            result.status === "success"
              ? Number(
                  formatUnits(result.result, token?.rewardTokenDecimals || 18)
                )
              : 0;

          return [settlement.address.toLowerCase(), value];
        })
      ) satisfies Record<string, number>;
    },
    queryKey: [
      "collaboration-payout-wallet-balances",
      runtimeConfigQuery.data?.payoutWalletAddress,
      collaborationSettlements
        .map(
          (settlement) =>
            `${settlement.coinAddress}:${settlement.rewardTokenDecimals}`
        )
        .join("|")
    ],
    staleTime: 60000
  });
  const fundingBalances = fundingBalancesQuery.data || {};

  const invalidateCollaborationData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [EVERY1_COLLABORATIONS_QUERY_KEY]
      }),
      queryClient.invalidateQueries({
        queryKey: [EVERY1_COLLABORATION_EARNINGS_SUMMARY_QUERY_KEY]
      }),
      queryClient.invalidateQueries({
        queryKey: [EVERY1_COLLABORATION_EARNINGS_QUERY_KEY]
      }),
      queryClient.invalidateQueries({
        queryKey: [EVERY1_COLLABORATION_PAYOUTS_QUERY_KEY]
      }),
      queryClient.invalidateQueries({
        queryKey: [EVERY1_COLLABORATION_SETTLEMENTS_QUERY_KEY]
      }),
      queryClient.invalidateQueries({
        queryKey: [EVERY1_COLLABORATION_PAYOUT_AUDIT_QUERY_KEY]
      })
    ]);
  };

  const handleRespond = async (
    collaborationId: string,
    decision: "accept" | "decline"
  ) => {
    if (!creatorProfileId) {
      return;
    }

    try {
      setActingCollaborationId(collaborationId);
      await respondToCollaborationCoinInvite(
        creatorProfileId,
        collaborationId,
        decision
      );

      await invalidateCollaborationData();

      if (profile?.id) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [EVERY1_NOTIFICATIONS_QUERY_KEY, profile.id]
          }),
          queryClient.invalidateQueries({
            queryKey: [EVERY1_NOTIFICATION_COUNT_QUERY_KEY, profile.id]
          })
        ]);
      }

      toast.success(
        decision === "accept"
          ? "Collaboration accepted"
          : "Collaboration declined"
      );
    } catch (error) {
      console.error("Failed to respond to collaboration invite", error);
      toast.error("Couldn't update this collaboration invite.");
    } finally {
      setActingCollaborationId(null);
    }
  };

  const handleCancel = async (collaborationId: string) => {
    if (!creatorProfileId) {
      return;
    }

    try {
      setActingCollaborationId(collaborationId);
      await cancelCollaborationCoinInvite(creatorProfileId, collaborationId);
      await invalidateCollaborationData();
      toast.success("Collaboration invite cancelled");
    } catch (error) {
      console.error("Failed to cancel collaboration invite", error);
      toast.error("Couldn't cancel this collaboration invite.");
    } finally {
      setActingCollaborationId(null);
    }
  };

  const handleLaunch = async (collaboration: Every1Collaboration) => {
    if (!creatorProfileId) {
      return;
    }

    if (!address && !profile?.walletAddress) {
      toast.error("Your Every1 wallet is not ready on Base yet.");
      return;
    }

    if (!collaboration.metadataUri) {
      toast.error("This collaboration is missing its saved metadata.");
      return;
    }

    try {
      setActingCollaborationId(collaboration.collaborationId);
      setStatusModal({
        description:
          "Everyone accepted the split. You're taking the collaboration live now.",
        title: "Launching your collaboration coin, please wait",
        tone: "pending"
      });

      const client =
        toViemWalletClient(executionWalletClient) ||
        (await getWalletClient(config, { chainId: base.id })) ||
        walletClient;
      const creatorAddress = (profile?.walletAddress ||
        address ||
        executionWalletAddress) as Address | undefined;

      if (!client || !creatorAddress) {
        throw new Error("Your Every1 wallet is not ready on Base yet.");
      }

      const metadataResponse = await fetch(
        sanitizeDStorageUrl(collaboration.metadataUri)
      );

      if (!metadataResponse.ok) {
        throw new Error("Couldn't load the saved collaboration metadata.");
      }

      const metadata = await metadataResponse.json();
      const createdCoin = await createCoin({
        call: {
          chainId: base.id,
          creator: creatorAddress,
          currency: "ETH",
          metadata,
          name: collaboration.title,
          symbol: collaboration.ticker.toUpperCase()
        },
        options: {
          account: client.account,
          skipValidateTransaction: true
        },
        publicClient,
        walletClient: client
      });

      const deployedCoinAddress =
        createdCoin.address || createdCoin.deployment?.coin || null;

      if (!deployedCoinAddress) {
        throw new Error(
          "Coin deployed, but the address could not be resolved."
        );
      }

      await completeCollaborationCoinLaunch(
        creatorProfileId,
        collaboration.collaborationId,
        deployedCoinAddress
      );
      if (
        creatorProfileId &&
        identityWalletAddress &&
        identityWalletClient?.account
      ) {
        await announceTelegramCoinLaunch({
          category: "Collaboration",
          coinAddress: deployedCoinAddress,
          coinName: collaboration.title,
          coinSymbol: collaboration.ticker.toUpperCase(),
          launchType: "collaboration",
          profileId: creatorProfileId,
          walletAddress: identityWalletAddress,
          walletClient: identityWalletClient
        }).catch((error) => {
          console.error("Failed to announce collaboration coin launch", error);
        });
      }

      await invalidateCollaborationData();

      setStatusModal({
        description: "Nice work! Your collaboration coin is live now.",
        title: "Collaboration live",
        tone: "success"
      });
      await new Promise((resolve) => setTimeout(resolve, 1600));
      navigate(`/coins/${deployedCoinAddress}?created=1`);
    } catch (error) {
      console.error("Failed to launch collaboration coin", error);
      setStatusModal(null);
      toast.error("Failed to launch collaboration coin", {
        description:
          error instanceof Error ? error.message : "Please try again."
      });
    } finally {
      setActingCollaborationId(null);
    }
  };

  if (collaborationsQuery.isLoading) {
    return <Loader className="my-10" />;
  }

  if (collaborationsQuery.error) {
    return (
      <ErrorMessage
        error={collaborationsQuery.error as { message?: string }}
        title="Failed to load collaborations"
      />
    );
  }

  return (
    <div className="space-y-4">
      {isCurrentProfile ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-gray-200/70 bg-white px-4 py-4 dark:border-gray-800 dark:bg-black">
            <div>
              <p className="font-semibold text-base text-gray-950 dark:text-white">
                Collaboration invites
              </p>
              <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
                {pendingCount > 0 || outgoingCount > 0
                  ? [
                      pendingCount > 0
                        ? `${pendingCount} invite${pendingCount > 1 ? "s" : ""} waiting for your response`
                        : null,
                      outgoingCount > 0
                        ? `${outgoingCount} outgoing request${outgoingCount > 1 ? "s" : ""} pending`
                        : null,
                      expiredCount > 0 ? `${expiredCount} expired` : null
                    ]
                      .filter(Boolean)
                      .join(" | ")
                  : "Create a shared coin invite or review collaboration terms."}
              </p>
            </div>

            <Link to="/create?tab=collaboration">
              <Button icon={<UserPlusIcon className="size-4" />} outline>
                New collaboration
              </Button>
            </Link>
          </div>

          <Card className="border border-gray-200/70 bg-white px-4 py-4 shadow-none dark:border-gray-800 dark:bg-black">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-base text-gray-950 dark:text-white">
                  Collaboration earnings
                </p>
                <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
                  Split earnings are recorded automatically when a live
                  collaboration coin earns rewards.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
                  Projects earning
                </p>
                <p className="mt-1 font-semibold text-gray-950 text-lg dark:text-white">
                  {collaborationEarningsSummaryQuery.isLoading
                    ? "--"
                    : earningsSummary?.collaborationCount || 0}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
                  Reward records
                </p>
                <p className="mt-1 font-semibold text-gray-950 text-lg dark:text-white">
                  {collaborationEarningsSummaryQuery.isLoading
                    ? "--"
                    : earningsSummary?.allocationCount || 0}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
                  Latest reward
                </p>
                <p className="mt-1 font-semibold text-gray-950 text-sm dark:text-white">
                  {earningsSummary?.latestCoinSymbol &&
                  earningsSummary.latestAmount > 0
                    ? `${formatTokenAmount(earningsSummary.latestAmount)} ${earningsSummary.latestCoinSymbol}`
                    : "--"}
                </p>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  {earningsSummary?.lastEarnedAt
                    ? formatRelativeOrAbsolute(earningsSummary.lastEarnedAt)
                    : "No earnings yet"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="border border-gray-200/70 bg-white px-4 py-4 shadow-none dark:border-gray-800 dark:bg-black">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-base text-gray-950 dark:text-white">
                  Settlement management
                </p>
                <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
                  Track what is queued, what is paid, and whether the payout
                  wallet can cover the outstanding collaboration sends.
                </p>
              </div>

              {runtimeConfigQuery.data?.payoutWalletAddress ? (
                <Button
                  className="shrink-0"
                  icon={<ClipboardDocumentIcon className="size-4" />}
                  onClick={() => void copyPayoutWallet()}
                  outline
                  size="sm"
                >
                  Copy payout wallet
                </Button>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
                  Projects
                </p>
                <p className="mt-1 font-semibold text-gray-950 text-lg dark:text-white">
                  {collaborationSettlementsQuery.isLoading
                    ? "--"
                    : collaborationSettlements.length}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
                  Gross
                </p>
                <p className="mt-1 font-semibold text-gray-950 text-sm dark:text-white">
                  {formatTokenAmount(settlementSummary.grossAmount)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
                  Queued
                </p>
                <p className="mt-1 font-semibold text-gray-950 text-sm dark:text-white">
                  {formatTokenAmount(settlementSummary.queuedAmount)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
                  Failed
                </p>
                <p className="mt-1 font-semibold text-gray-950 text-sm dark:text-white">
                  {formatTokenAmount(settlementSummary.failedAmount)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
                  Paused
                </p>
                <p className="mt-1 font-semibold text-gray-950 text-sm dark:text-white">
                  {settlementSummary.pausedCount}
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-1 text-[12px] text-gray-500 dark:text-gray-400">
              <p>
                Runtime:{" "}
                <span className="font-semibold text-gray-700 dark:text-gray-200">
                  {runtimeConfigQuery.data?.payoutEnabled
                    ? "Automatic payouts active"
                    : "Payout runtime unavailable"}
                </span>
              </p>
              <p>
                Wallet:{" "}
                <span className="font-semibold text-gray-700 dark:text-gray-200">
                  {runtimeConfigQuery.data?.payoutWalletAddress
                    ? formatAddress(
                        runtimeConfigQuery.data.payoutWalletAddress,
                        6
                      )
                    : "--"}
                </span>
              </p>
              {fundingBalancesQuery.isError ? (
                <p className="text-rose-600 dark:text-rose-300">
                  Funding balances could not be checked right now.
                </p>
              ) : null}
            </div>
          </Card>

          {collaborationSettlementsQuery.isLoading ? (
            <Loader className="py-8" />
          ) : collaborationSettlementsQuery.error ? (
            <ErrorMessage
              error={
                collaborationSettlementsQuery.error as { message?: string }
              }
              title="Failed to load collaboration settlements"
            />
          ) : collaborationSettlements.length ? (
            <div className="space-y-3">
              {collaborationSettlements.map((settlement) => (
                <CollaborationSettlementCard
                  availableBalance={
                    fundingBalances[settlement.coinAddress.toLowerCase()] || 0
                  }
                  key={settlement.collaborationId}
                  settlement={settlement}
                />
              ))}
            </div>
          ) : null}

          <Card className="border border-gray-200/70 bg-white px-4 py-4 shadow-none dark:border-gray-800 dark:bg-black">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-base text-gray-950 dark:text-white">
                  Project payout activity
                </p>
                <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
                  This shows every recipient-level payout row across the
                  collaborations you own or participate in.
                </p>
              </div>
            </div>

            {collaborationPayoutAuditQuery.isLoading ? (
              <Loader className="py-8" />
            ) : collaborationPayoutAuditQuery.error ? (
              <ErrorMessage
                error={
                  collaborationPayoutAuditQuery.error as { message?: string }
                }
                title="Failed to load project payout activity"
              />
            ) : collaborationPayoutAudit.length ? (
              <div className="mt-4 space-y-2">
                {collaborationPayoutAudit.slice(0, 10).map((payout) => {
                  const payoutMeta = payoutStatusMeta[payout.status];

                  return (
                    <div
                      className="rounded-[1rem] border border-gray-200/70 px-3 py-3 dark:border-gray-800/75"
                      key={`audit-${payout.allocationId}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-950 text-sm dark:text-gray-50">
                            {payout.title}
                          </p>
                          <p className="truncate text-gray-500 text-xs dark:text-gray-400">
                            {payout.recipientName ||
                              payout.recipientUsername ||
                              "Unknown recipient"}{" "}
                            | {formatTokenAmount(payout.amount)}{" "}
                            {payout.coinSymbol}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                            {formatSourceType(payout.sourceType)}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold text-[11px] ${payoutMeta.className}`}
                          >
                            {payoutMeta.label}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 grid gap-1 text-[12px] text-gray-500 dark:text-gray-400">
                        <p>
                          Split:{" "}
                          <span className="font-semibold text-gray-700 dark:text-gray-200">
                            {formatSplitPercent(payout.splitPercent)}%
                          </span>
                          {" | "}
                          Wallet:{" "}
                          <span className="font-semibold text-gray-700 dark:text-gray-200">
                            {payout.recipientWalletAddress
                              ? formatAddress(payout.recipientWalletAddress, 6)
                              : "Missing"}
                          </span>
                        </p>
                        <p>
                          Recorded {formatRelativeOrAbsolute(payout.createdAt)}
                          {payout.sentAt
                            ? ` | paid ${formatRelativeOrAbsolute(payout.sentAt)}`
                            : payout.payoutAttemptedAt
                              ? ` | attempted ${formatRelativeOrAbsolute(payout.payoutAttemptedAt)}`
                              : ""}
                        </p>
                        {payout.txHash ? (
                          <p>
                            Tx:{" "}
                            <span className="font-semibold text-gray-700 dark:text-gray-200">
                              {formatAddress(payout.txHash, 8)}
                            </span>
                          </p>
                        ) : null}
                        {payout.errorMessage ? (
                          <p className="text-rose-600 dark:text-rose-300">
                            {payout.errorMessage}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-gray-500 text-sm dark:text-gray-400">
                Project payout rows will appear here once collaboration rewards
                start settling.
              </p>
            )}
          </Card>

          <Card className="border border-gray-200/70 bg-white px-4 py-4 shadow-none dark:border-gray-800 dark:bg-black">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-base text-gray-950 dark:text-white">
                  Your payout ledger
                </p>
                <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
                  This is your personal collaboration payout history, separate
                  from the project-wide payout stream above.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
                  Queued
                </p>
                <p className="mt-1 font-semibold text-gray-950 text-lg dark:text-white">
                  {collaborationPayoutsQuery.isLoading
                    ? "--"
                    : payoutSummary.recorded}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
                  Paid
                </p>
                <p className="mt-1 font-semibold text-gray-950 text-lg dark:text-white">
                  {collaborationPayoutsQuery.isLoading
                    ? "--"
                    : payoutSummary.paid}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.16em] dark:text-gray-400">
                  Failed
                </p>
                <p className="mt-1 font-semibold text-gray-950 text-lg dark:text-white">
                  {collaborationPayoutsQuery.isLoading
                    ? "--"
                    : payoutSummary.failed}
                </p>
              </div>
            </div>

            {collaborationPayoutsQuery.isLoading ? (
              <Loader className="py-8" />
            ) : collaborationPayoutsQuery.error ? (
              <ErrorMessage
                error={collaborationPayoutsQuery.error as { message?: string }}
                title="Failed to load collaboration payouts"
              />
            ) : collaborationPayouts.length ? (
              <div className="mt-4 space-y-2">
                {collaborationPayouts.slice(0, 8).map((payout) => {
                  const payoutMeta = payoutStatusMeta[payout.status];

                  return (
                    <div
                      className="rounded-[1rem] border border-gray-200/70 px-3 py-3 dark:border-gray-800/75"
                      key={payout.allocationId}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-950 text-sm dark:text-gray-50">
                            {payout.title}
                          </p>
                          <p className="truncate text-gray-500 text-xs dark:text-gray-400">
                            {"\u20A6"}
                            {payout.ticker} | {formatTokenAmount(payout.amount)}{" "}
                            {payout.coinSymbol}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold text-[11px] ${payoutMeta.className}`}
                        >
                          {payoutMeta.label}
                        </span>
                      </div>

                      <div className="mt-2 grid gap-1 text-[12px] text-gray-500 dark:text-gray-400">
                        <p>
                          Split:{" "}
                          <span className="font-semibold text-gray-700 dark:text-gray-200">
                            {formatSplitPercent(payout.splitPercent)}%
                          </span>
                        </p>
                        <p>
                          Wallet:{" "}
                          <span className="font-semibold text-gray-700 dark:text-gray-200">
                            {payout.recipientWalletAddress
                              ? formatAddress(payout.recipientWalletAddress, 6)
                              : "Missing"}
                          </span>
                        </p>
                        <p>
                          Recorded {formatRelativeOrAbsolute(payout.createdAt)}
                          {payout.sentAt
                            ? ` | paid ${formatRelativeOrAbsolute(payout.sentAt)}`
                            : payout.payoutAttemptedAt
                              ? ` | attempted ${formatRelativeOrAbsolute(payout.payoutAttemptedAt)}`
                              : ""}
                        </p>
                        {payout.txHash ? (
                          <p>
                            Tx:{" "}
                            <span className="font-semibold text-gray-700 dark:text-gray-200">
                              {formatAddress(payout.txHash, 8)}
                            </span>
                          </p>
                        ) : null}
                        {payout.errorMessage ? (
                          <p className="text-rose-600 dark:text-rose-300">
                            {payout.errorMessage}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-gray-500 text-sm dark:text-gray-400">
                Collaboration payouts will show up here once rewards are queued
                or sent.
              </p>
            )}
          </Card>
        </div>
      ) : null}

      {collaborations.length ? (
        <div className="space-y-3">
          {collaborations.map((collaboration) => (
            <CollaborationCard
              collaboration={collaboration}
              earnings={earningsByCollaboration.get(
                collaboration.collaborationId
              )}
              isActing={actingCollaborationId === collaboration.collaborationId}
              isCurrentProfile={isCurrentProfile}
              key={collaboration.collaborationId}
              onCancel={handleCancel}
              onLaunch={handleLaunch}
              onRespond={handleRespond}
            />
          ))}
        </div>
      ) : (
        <Card className="border border-gray-200 border-dashed bg-white px-5 py-10 text-center shadow-none dark:border-gray-800 dark:bg-black">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-900 dark:text-gray-500">
            {isCurrentProfile ? (
              <UserPlusIcon className="size-6" />
            ) : (
              <CheckCircleIcon className="size-6" />
            )}
          </div>
          <p className="mt-4 font-semibold text-gray-950 dark:text-white">
            {isCurrentProfile
              ? "No collaboration invites yet"
              : `${creatorName} has no public collaborations yet`}
          </p>
          <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
            {isCurrentProfile
              ? "Start a joint project and invite another creator to review the split."
              : "Accepted joint projects will show up here once they are ready."}
          </p>
          {isCurrentProfile ? (
            <div className="mt-4">
              <Link to="/create?tab=collaboration">
                <Button icon={<UserPlusIcon className="size-4" />} outline>
                  Create collaboration
                </Button>
              </Link>
            </div>
          ) : null}
        </Card>
      )}
      <ActionStatusModal
        description={statusModal?.description}
        label="Collaboration coin"
        show={Boolean(statusModal)}
        title={statusModal?.title || ""}
        tone={statusModal?.tone || "pending"}
      />
    </div>
  );
};

export default Collaborations;
