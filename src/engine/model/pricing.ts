/**
 * Fictional prices and complexity points. MODEL.md §8.
 * Right order of magnitude, deliberately not any real provider.
 */
import type { Architecture, Size } from "./types";

export const PRICES = {
  app: { small: 20, medium: 40, large: 80 } satisfies Record<Size, number>,
  db: { small: 30, medium: 60, large: 120 } satisfies Record<Size, number>,
  loadBalancer: 20,
  cache: 15,
  queue: 5,
  jobWorker: 20,
} as const;

export const COMPLEXITY = {
  loadBalancer: 1,
  readReplicas: 2,
  cache: 2,
  queue: 3,
} as const;

export function monthlyCost(arch: Architecture): number {
  let cost = arch.app.count * PRICES.app[arch.app.size];
  if (arch.app.count > 1) cost += PRICES.loadBalancer;
  cost += (1 + arch.db.replicas) * PRICES.db[arch.db.size];
  if (arch.cache) cost += PRICES.cache;
  if (arch.jobs?.mode === "queued") cost += PRICES.queue + arch.jobs.workerInstances * PRICES.jobWorker;
  return cost;
}

export function complexityPoints(arch: Architecture): number {
  let points = 0;
  if (arch.app.count > 1) points += COMPLEXITY.loadBalancer;
  if (arch.db.replicas > 0) points += COMPLEXITY.readReplicas;
  if (arch.cache) points += COMPLEXITY.cache;
  if (arch.jobs?.mode === "queued") points += COMPLEXITY.queue;
  return points;
}
