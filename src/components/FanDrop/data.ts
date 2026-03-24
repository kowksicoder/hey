export type FanDropTask = {
  id: string;
  label: string;
  completed: boolean;
  optional?: boolean;
};

export type FanDropCampaign = {
  id: string;
  slug: string;
  creator: string;
  title: string;
  status: "live" | "completed" | "ended";
  endsAt: string;
  tokenPool: number;
  completedTasks: number;
  totalTasks: number;
  rank: number;
  reward?: number;
  tasks: FanDropTask[];
  cta: string;
};

export const seededFanDrops: FanDropCampaign[] = [
  {
    id: "1",
    slug: "asake-fandrop",
    creator: "Asake",
    title: "Asake FanDrop",
    status: "live",
    endsAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    tokenPool: 5000,
    completedTasks: 1,
    totalTasks: 3,
    rank: 23,
    tasks: [
      { id: "join", label: "Join", completed: true },
      { id: "invite", label: "Invite 2 friends", completed: false },
      { id: "buy", label: "Buy ₦500 (optional)", completed: false, optional: true }
    ],
    cta: "Join FanDrop"
  },
  {
    id: "2",
    slug: "asake-fandrop-active",
    creator: "Asake",
    title: "Asake FanDrop",
    status: "live",
    endsAt: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
    tokenPool: 5000,
    completedTasks: 2,
    totalTasks: 3,
    rank: 15,
    tasks: [
      { id: "join", label: "Join", completed: true },
      { id: "invite", label: "Invite 1/2 friends", completed: true },
      { id: "buy", label: "Buy ₦500 (optional)", completed: false, optional: true }
    ],
    cta: "Invite Friends"
  },
  {
    id: "3",
    slug: "asake-fandrop-complete",
    creator: "Asake",
    title: "Asake FanDrop",
    status: "completed",
    endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    tokenPool: 5000,
    completedTasks: 3,
    totalTasks: 3,
    rank: 8,
    tasks: [
      { id: "join", label: "Join", completed: true },
      { id: "invite", label: "Invite 2 friends", completed: true },
      { id: "buy", label: "Buy ₦500", completed: true }
    ],
    cta: "Completed"
  },
  {
    id: "4",
    slug: "asake-fandrop-ended",
    creator: "Asake",
    title: "Asake FanDrop",
    status: "ended",
    endsAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    tokenPool: 5000,
    completedTasks: 3,
    totalTasks: 3,
    rank: 12,
    reward: 120,
    tasks: [
      { id: "join", label: "Join", completed: true },
      { id: "invite", label: "Invite 2 friends", completed: true },
      { id: "buy", label: "Buy ₦500", completed: true }
    ],
    cta: "View Results"
  }
];
