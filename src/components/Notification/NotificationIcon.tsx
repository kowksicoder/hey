import {
  BellIcon,
  BanknotesIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  CheckBadgeIcon,
  FireIcon,
  GiftIcon,
  HeartIcon,
  SparklesIcon,
  UserGroupIcon,
  UserPlusIcon
} from "@heroicons/react/24/solid";
import type { ComponentType } from "react";
import cn from "@/helpers/cn";
import type { Every1Notification } from "@/types/every1";

type NotificationIconKind = Every1Notification["kind"] | "browser";
type NotificationIconSize = "lg" | "md" | "sm";

const SIZE_CLASSES: Record<
  NotificationIconSize,
  { icon: string; wrapper: string }
> = {
  lg: {
    icon: "size-4.5 md:size-5",
    wrapper: "size-9 md:size-10"
  },
  md: {
    icon: "size-3.5",
    wrapper: "size-7"
  },
  sm: {
    icon: "size-3",
    wrapper: "size-5"
  }
};

const VISUALS: Record<
  NotificationIconKind,
  {
    Icon: ComponentType<{ className?: string }>;
    animationClassName: string;
    iconClassName: string;
    wrapperClassName: string;
  }
> = {
  browser: {
    animationClassName: "every1-icon-float",
    Icon: BellIcon,
    iconClassName: "text-sky-600 dark:text-sky-300",
    wrapperClassName:
      "bg-sky-500/12 ring-1 ring-sky-500/18 dark:bg-sky-500/14 dark:ring-sky-400/20"
  },
  comment: {
    animationClassName: "every1-icon-float",
    Icon: ChatBubbleOvalLeftEllipsisIcon,
    iconClassName: "text-sky-600 dark:text-sky-300",
    wrapperClassName:
      "bg-sky-500/12 ring-1 ring-sky-500/18 dark:bg-sky-500/14 dark:ring-sky-400/20"
  },
  community: {
    animationClassName: "every1-icon-float",
    Icon: UserGroupIcon,
    iconClassName: "text-violet-600 dark:text-violet-300",
    wrapperClassName:
      "bg-violet-500/12 ring-1 ring-violet-500/18 dark:bg-violet-500/14 dark:ring-violet-400/20"
  },
  follow: {
    animationClassName: "every1-icon-float",
    Icon: UserPlusIcon,
    iconClassName: "text-emerald-600 dark:text-emerald-300",
    wrapperClassName:
      "bg-emerald-500/12 ring-1 ring-emerald-500/18 dark:bg-emerald-500/14 dark:ring-emerald-400/20"
  },
  like: {
    animationClassName: "every1-icon-pulse",
    Icon: HeartIcon,
    iconClassName: "text-rose-600 dark:text-rose-300",
    wrapperClassName:
      "bg-rose-500/12 ring-1 ring-rose-500/18 dark:bg-rose-500/14 dark:ring-rose-400/20"
  },
  mission: {
    animationClassName: "every1-icon-pulse",
    Icon: SparklesIcon,
    iconClassName: "text-amber-600 dark:text-amber-300",
    wrapperClassName:
      "bg-amber-500/12 ring-1 ring-amber-500/18 dark:bg-amber-500/14 dark:ring-amber-400/20"
  },
  nudge: {
    animationClassName: "every1-icon-pulse",
    Icon: FireIcon,
    iconClassName: "text-orange-600 dark:text-orange-300",
    wrapperClassName:
      "bg-orange-500/12 ring-1 ring-orange-500/18 dark:bg-orange-500/14 dark:ring-orange-400/20"
  },
  payment: {
    animationClassName: "every1-icon-float",
    Icon: BanknotesIcon,
    iconClassName: "text-lime-600 dark:text-lime-300",
    wrapperClassName:
      "bg-lime-500/12 ring-1 ring-lime-500/18 dark:bg-lime-500/14 dark:ring-lime-400/20"
  },
  referral: {
    animationClassName: "every1-icon-float",
    Icon: UserPlusIcon,
    iconClassName: "text-cyan-600 dark:text-cyan-300",
    wrapperClassName:
      "bg-cyan-500/12 ring-1 ring-cyan-500/18 dark:bg-cyan-500/14 dark:ring-cyan-400/20"
  },
  reward: {
    animationClassName: "every1-icon-pulse",
    Icon: GiftIcon,
    iconClassName: "text-yellow-600 dark:text-yellow-300",
    wrapperClassName:
      "bg-yellow-500/12 ring-1 ring-yellow-500/18 dark:bg-yellow-500/14 dark:ring-yellow-400/20"
  },
  share: {
    animationClassName: "every1-icon-float",
    Icon: SparklesIcon,
    iconClassName: "text-indigo-600 dark:text-indigo-300",
    wrapperClassName:
      "bg-indigo-500/12 ring-1 ring-indigo-500/18 dark:bg-indigo-500/14 dark:ring-indigo-400/20"
  },
  streak: {
    animationClassName: "every1-icon-pulse",
    Icon: SparklesIcon,
    iconClassName: "text-fuchsia-600 dark:text-fuchsia-300",
    wrapperClassName:
      "bg-fuchsia-500/12 ring-1 ring-fuchsia-500/18 dark:bg-fuchsia-500/14 dark:ring-fuchsia-400/20"
  },
  system: {
    animationClassName: "every1-icon-float",
    Icon: BellIcon,
    iconClassName: "text-blue-600 dark:text-blue-300",
    wrapperClassName:
      "bg-blue-500/12 ring-1 ring-blue-500/18 dark:bg-blue-500/14 dark:ring-blue-400/20"
  },
  toast: {
    animationClassName: "every1-icon-float",
    Icon: BellIcon,
    iconClassName: "text-sky-600 dark:text-sky-300",
    wrapperClassName:
      "bg-sky-500/12 ring-1 ring-sky-500/18 dark:bg-sky-500/14 dark:ring-sky-400/20"
  },
  verification: {
    animationClassName: "every1-icon-pulse",
    Icon: CheckBadgeIcon,
    iconClassName: "text-emerald-600 dark:text-emerald-300",
    wrapperClassName:
      "bg-emerald-500/12 ring-1 ring-emerald-500/18 dark:bg-emerald-500/14 dark:ring-emerald-400/20"
  },
  welcome: {
    animationClassName: "every1-icon-pulse",
    Icon: SparklesIcon,
    iconClassName: "text-pink-600 dark:text-pink-300",
    wrapperClassName:
      "bg-pink-500/12 ring-1 ring-pink-500/18 dark:bg-pink-500/14 dark:ring-pink-400/20"
  }
};

interface NotificationIconProps {
  className?: string;
  kind: NotificationIconKind;
  size?: NotificationIconSize;
}

const NotificationIcon = ({
  className,
  kind,
  size = "md"
}: NotificationIconProps) => {
  const visual = VISUALS[kind];
  const Icon = visual.Icon;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        SIZE_CLASSES[size].wrapper,
        visual.wrapperClassName,
        className
      )}
    >
      <Icon
        className={cn(
          SIZE_CLASSES[size].icon,
          visual.iconClassName,
          visual.animationClassName
        )}
      />
    </span>
  );
};

export default NotificationIcon;
