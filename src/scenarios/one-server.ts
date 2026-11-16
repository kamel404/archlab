import type { Scenario } from "./schema";

/** Scenario 1. Expected numbers: MODEL.md §13.2. */
export const oneServer: Scenario = {
  slug: "one-server",
  number: 1,
  title: "One Server Is Enough (Until It Isn't)",
  tagline: "Find the load at which one small server actually breaks, then decide how to fix it.",
  teaches: "Vertical vs horizontal scaling, and how far a single server really goes.",
  intro: [
    "Your app runs on one small server (2 cores) and one small database. Each request uses about 10 ms of CPU and a few milliseconds of database time.",
    "Drag the load up until something turns red. Then pick a fix and see whether it was worth it. Try a fix before anything breaks, too.",
  ],
  load: { min: 10, max: 400, step: 5, initial: 50 },
  slo: { p95: 0.3, errorRate: 0.01 },
  assumptions: {},
  baseline: {
    label: "1 small server",
    architecture: { app: { size: "small", count: 1 }, db: { size: "small", replicas: 0 }, cache: false },
  },
  stages: [
    {
      id: "scale-app",
      prompt: "Pick a fix",
      hint: "Each option is compared with the current setup at the load you picked.",
      options: [
        {
          id: "medium-server",
          label: "Bigger server",
          summary: "Upgrade to a medium server: 4 cores. Same code, same setup.",
          architecture: { app: { size: "medium", count: 1 }, db: { size: "small", replicas: 0 }, cache: false },
        },
        {
          id: "two-servers",
          label: "Second server + load balancer",
          summary:
            "Add a second small server and a load balancer that splits traffic. Your app must be stateless: no sessions or files kept on one server.",
          architecture: { app: { size: "small", count: 2 }, db: { size: "small", replicas: 0 }, cache: false },
        },
        {
          id: "large-server",
          label: "Much bigger server",
          summary: "Jump straight to a large server: 8 cores.",
          architecture: { app: { size: "large", count: 1 }, db: { size: "small", replicas: 0 }, cache: false },
        },
      ],
    },
  ],
};
