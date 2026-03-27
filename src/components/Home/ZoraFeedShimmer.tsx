import { memo } from "react";
import Skeleton from "@/components/Shared/Skeleton";
import { Card } from "@/components/Shared/UI";
import { HomeFeedView } from "@/data/enums";
import cn from "@/helpers/cn";

const ZoraPostShimmer = () => {
  return (
    <Card className="w-full min-w-0 overflow-hidden px-0 py-0">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-3.5 w-28 rounded-full" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-16 rounded-full" />
                <Skeleton className="size-1 rounded-full" />
                <Skeleton className="h-3 w-12 rounded-full" />
              </div>
            </div>
          </div>

          <Skeleton className="h-8 w-20 rounded-full" />
        </div>

        <div className="mt-4 space-y-2">
          <Skeleton className="h-5 w-40 rounded-full" />
          <Skeleton className="h-3.5 w-full rounded-full" />
          <Skeleton className="h-3.5 w-10/12 rounded-full" />
          <Skeleton className="h-3.5 w-7/12 rounded-full" />
        </div>
      </div>

      <div className="px-4 pb-3">
        <Skeleton className="aspect-square w-full rounded-[1.5rem] md:aspect-[4/3]" />
      </div>

      <div className="px-4 pb-3">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton className="h-8 w-24 rounded-full" key={index} />
          ))}
        </div>
      </div>

      <div className="border-gray-200 border-t px-4 py-3 dark:border-gray-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                className="inline-flex items-center gap-2 rounded-full px-2.5 py-2"
                key={index}
              >
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="h-3 w-7 rounded-full" />
              </div>
            ))}
          </div>

          <div className="inline-flex items-center gap-2 rounded-full px-3 py-2">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-3 w-9 rounded-full" />
          </div>
        </div>
      </div>
    </Card>
  );
};

const ZoraGridPostShimmer = () => {
  return (
    <Card
      className="h-full w-full min-w-0 overflow-hidden px-0 py-0"
      forceRounded
    >
      <div className="px-2.5 pt-2.5 pb-2 md:px-3 md:pt-3 md:pb-2.5">
        <div className="flex items-start gap-2">
          <Skeleton className="size-7 rounded-full md:size-8" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-16 rounded-full" />
            <Skeleton className="h-2.5 w-10 rounded-full" />
          </div>
        </div>
      </div>

      <div className="px-2.5 pb-2 md:px-3 md:pb-2.5">
        <Skeleton className="aspect-[6/5] w-full rounded-[0.9rem] md:aspect-square md:rounded-[1rem]" />
      </div>

      <div className="px-2.5 pb-2 md:px-3 md:pb-2.5">
        <div className="grid grid-cols-2 gap-1">
          <Skeleton className="h-5 rounded-full" />
          <Skeleton className="h-5 rounded-full" />
        </div>
      </div>

      <div className="border-gray-200 border-t px-1.5 py-1 md:px-2 md:py-1.5 dark:border-gray-800">
        <div className="grid grid-cols-3 gap-0.5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              className="inline-flex items-center justify-center gap-1.5 px-1.5 py-1.5"
              key={index}
            >
              <Skeleton className="size-3.5 rounded-full" />
              <Skeleton className="h-2.5 w-5 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

const ZoraFeedShimmer = ({
  isDesktopSidebarCollapsed = true,
  viewMode = HomeFeedView.LIST
}: {
  isDesktopSidebarCollapsed?: boolean;
  viewMode?: HomeFeedView;
}) => {
  const isGridView = viewMode === HomeFeedView.GRID;

  return (
    <section
      className={cn(
        "min-w-0 overflow-x-hidden pb-5",
        isGridView
          ? cn(
              "grid grid-cols-2 gap-3 px-4 md:px-0",
              isDesktopSidebarCollapsed
                ? "md:grid-cols-4 lg:grid-cols-6"
                : "md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            )
          : "space-y-3"
      )}
    >
      {Array.from({ length: isGridView ? 6 : 3 }).map((_, index) =>
        isGridView ? (
          <ZoraGridPostShimmer key={index} />
        ) : (
          <ZoraPostShimmer key={index} />
        )
      )}
    </section>
  );
};

export default memo(ZoraFeedShimmer);
