import { FireIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { mapEvery1FanDropToCard } from "@/components/Missions/data";
import { Spinner } from "@/components/Shared/UI";
import cn from "@/helpers/cn";
import type { Every1FanDropCampaign } from "@/types/every1";

interface CoinFanDropPanelProps {
  campaigns: Every1FanDropCampaign[];
  compact?: boolean;
  creatorName: string;
  loading?: boolean;
}

const CoinFanDropPanel = ({
  campaigns,
  compact = false,
  creatorName,
  loading = false
}: CoinFanDropPanelProps) => {
  if (loading && campaigns.length === 0) {
    return (
      <div className="flex min-h-[10rem] items-center justify-center rounded-[1.5rem] border border-gray-200 bg-white dark:border-gray-800 dark:bg-black">
        <Spinner size="sm" />
      </div>
    );
  }

  if (!campaigns.length) {
    return (
      <div className="rounded-[1.5rem] border border-gray-200 bg-white px-5 py-8 text-center text-gray-500 dark:border-gray-800 dark:bg-black dark:text-gray-400">
        No FanDrop campaign is live for {creatorName} yet.
      </div>
    );
  }

  const cards = campaigns.map(mapEvery1FanDropToCard);

  return (
    <div
      className={cn("grid gap-4", compact ? "grid-cols-1" : "md:grid-cols-2")}
    >
      {cards.map((campaign) => {
        const progressPercent =
          campaign.progressTotal > 0
            ? (campaign.progressComplete / campaign.progressTotal) * 100
            : 0;

        return (
          <div
            className="overflow-hidden rounded-[1.5rem] border border-gray-200 bg-white dark:border-gray-800 dark:bg-black"
            key={campaign.id}
          >
            <div className={cn("space-y-3", compact ? "p-3" : "p-5")}>
              <div
                className={cn(
                  "rounded-[1.2rem] px-3 py-3",
                  campaign.accentClassName
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 font-semibold text-[10px] text-gray-900 backdrop-blur dark:bg-black/25 dark:text-white">
                    <FireIcon className="size-3.5" />
                    {campaign.state === "live"
                      ? "Live"
                      : campaign.state === "joined"
                        ? "Joined"
                        : campaign.state === "completed"
                          ? "Completed"
                          : "Ended"}
                  </span>
                  <span className="rounded-full bg-white/75 px-2.5 py-1 font-medium text-[10px] text-gray-700 backdrop-blur dark:bg-black/20 dark:text-white/85">
                    {campaign.timeLabel}
                  </span>
                </div>

                <p className="mt-3 font-medium text-[10px] text-gray-700/80 uppercase tracking-[0.18em] dark:text-white/70">
                  {campaign.coverLabel}
                </p>
                <h3 className="mt-1 font-semibold text-gray-950 text-lg dark:text-white">
                  {campaign.title}
                </h3>
                <p className="mt-1 text-gray-800/85 text-sm dark:text-white/80">
                  {campaign.subtitle}
                </p>
              </div>

              <div className="rounded-[1rem] bg-gray-50 px-3 py-3 dark:bg-gray-950">
                <div className="flex items-center justify-between gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                  <span>Reward pool</span>
                  <span className="font-semibold text-gray-950 dark:text-white">
                    {campaign.rewardPoolLabel}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                  <span>
                    {campaign.progressComplete}/{campaign.progressTotal} tasks
                  </span>
                  <span className="font-semibold text-gray-950 dark:text-white">
                    {campaign.rankLabel}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white dark:bg-black">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.max(progressPercent, 8)}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                {campaign.tasks.map((task) => (
                  <div
                    className="flex items-center justify-between gap-2 text-sm"
                    key={`${campaign.id}-${task.label}`}
                  >
                    <span className="truncate text-gray-700 dark:text-gray-200">
                      {task.label}
                    </span>
                    {task.progressLabel ? (
                      <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
                        {task.progressLabel}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>

              <Link
                className="inline-flex w-full items-center justify-center rounded-full bg-gray-950 px-4 py-2.5 font-semibold text-sm text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
                to={`/fandrop/${campaign.slug}`}
              >
                {campaign.ctaLabel}
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CoinFanDropPanel;
