import { useParams } from "react-router";
import PageLayout from "@/components/Shared/PageLayout";
import { seededFanDrops } from "@/components/FanDrop/data";
import { Button, Card } from "@/components/Shared/UI";

const FanDropDetail = () => {
  const { slug } = useParams();
  const campaign = seededFanDrops.find((item) => item.slug === slug);

  if (!campaign) {
    return (
      <PageLayout title="FanDrop" hideDesktopSidebar sidebar={null}>
        <Card className="m-5 p-6 text-center" forceRounded>
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            FanDrop not found
          </p>
        </Card>
      </PageLayout>
    );
  }

  const progressPct = Math.round((campaign.completedTasks / campaign.totalTasks) * 100);

  return (
    <PageLayout
      title={`${campaign.title} • FanDrop`}
      hideDesktopSidebar
      sidebar={null}
      zeroTopMargin
    >
      <div className="mx-auto w-full max-w-[min(100%,92rem)] px-4 md:px-0">
        <Card className="rounded-[1.25rem] p-5" forceRounded>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">{campaign.title}</h1>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700">
              {campaign.status.toUpperCase()}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-500">{Math.max(0, Math.round((new Date(campaign.endsAt).getTime() - Date.now()) / (1000 * 60 * 60)))}h remaining</p>
          <div className="mt-4 rounded-xl bg-gray-100 p-4 dark:bg-gray-900">
            <p className="text-xs text-gray-500">🎁 Reward pool</p>
            <p className="text-lg font-semibold">{campaign.tokenPool} tokens</p>
          </div>
          <div className="mt-4 space-y-1">
            <p className="text-sm">Progress: {campaign.completedTasks}/{campaign.totalTasks}</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-pink-500 to-rose-400"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {campaign.tasks.map((task) => (
              <div
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                key={task.id}
              >
                <span className={task.completed ? "text-slate-700" : "text-gray-500"}>
                  {task.completed ? "✔" : "○"} {task.label}
                </span>
                {task.optional ? <span className="text-xs text-gray-400">optional</span> : null}
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <p className="text-sm text-gray-500">Your rank: #{campaign.rank}</p>
            <Button size="sm">{campaign.status === "ended" ? "View Results" : campaign.cta}</Button>
          </div>
        </Card>
      </div>
    </PageLayout>
  );
};

export default FanDropDetail;
