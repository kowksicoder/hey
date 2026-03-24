import { Link } from "react-router";
import PageLayout from "@/components/Shared/PageLayout";
import { seededFanDrops } from "@/components/FanDrop/data";
import { Button, Card } from "@/components/Shared/UI";

const getStatusBadge = (status: string) => {
  if (status === "live") return "bg-rose-100 text-rose-700";
  if (status === "completed") return "bg-emerald-100 text-emerald-700";
  return "bg-gray-100 text-gray-700";
};

const FanDrop = () => {
  return (
    <PageLayout
      title="FanDrop"
      description="FanDrop campaigns for creator rewards and engagement."
      hideDesktopSidebar
      sidebar={null}
      zeroTopMargin
    >
      <div className="mx-auto w-full max-w-[min(100%,92rem)] px-4 md:px-0">
        <div className="grid gap-4 md:grid-cols-3">
          {seededFanDrops.map((campaign) => {
            const progressPct = 
              Math.round((campaign.completedTasks / campaign.totalTasks) * 100);
            return (
              <Card
                key={campaign.id}
                className="space-y-3 rounded-[1.25rem] p-4 md:p-5"
                forceRounded
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">🔥 FanDrop LIVE</p>
                  <p className="text-xs text-gray-500">{campaign.status === "ended" ? "Ended" : `${Math.max(0, Math.round((new Date(campaign.endsAt).getTime() - Date.now()) / (1000 * 60 * 60)))}h`}</p>
                </div>
                <h2 className="text-lg font-bold">{campaign.title}</h2>
                <div className="space-y-1">
                  {campaign.tasks.map((task) => (
                    <p
                      className={`text-sm ${task.completed ? "text-emerald-600" : "text-gray-500"}`}
                      key={task.id}
                    >
                      {task.completed ? "✔" : "○"} {task.label}
                    </p>
                  ))}
                </div>
                <div className="rounded-xl bg-gray-100 p-3 dark:bg-gray-900">
                  <p className="text-xs text-gray-500">🎁 Reward Pool</p>
                  <p className="font-semibold">{campaign.tokenPool.toLocaleString()} tokens</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm">Progress: {campaign.completedTasks}/{campaign.totalTasks}</p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-pink-500 to-rose-400"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
                <p className="text-sm">Rank: #{campaign.rank} 🔥</p>
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadge(campaign.status)}`}>
                    {campaign.status.toUpperCase()}
                  </span>
                  <Link to={`/fandrop/${campaign.slug}`}>
                    <Button size="sm" className="whitespace-nowrap">
                      {campaign.status === "completed" ? "Rewards pending" : campaign.status === "ended" ? "View Results" : campaign.cta}
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </PageLayout>
  );
};

export default FanDrop;
