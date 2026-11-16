/**
 * Engine data types. Units: seconds, requests per second, USD per month.
 */

export type Size = "small" | "medium" | "large";

export const CORES: Record<Size, number> = { small: 2, medium: 4, large: 8 };

export interface Architecture {
  /** App servers. More than one implies a load balancer. */
  app: { size: Size; count: number };
  /** Primary database plus read replicas of the same size. */
  db: { size: Size; replicas: number };
  cache: boolean;
  /**
   * How slow work (Assumptions.slowFraction of requests) is handled.
   * Omitted: there is no slow work, or it runs inline.
   */
  jobs?: { mode: "inline" } | { mode: "queued"; workerInstances: number };
}

/** Every value here is shown in the scenario's Assumptions panel. MODEL.md §11. */
export interface Assumptions {
  /** App CPU time per request (s). */
  cpuTime: number;
  workersPerCore: number;
  dbReadTime: number;
  dbWriteTime: number;
  /** Fraction of requests that are reads, 0..1. */
  readFraction: number;
  cacheHitRate: number;
  cacheServiceTime: number;
  cacheCores: number;
  lbServiceTime: number;
  lbCores: number;
  /** Queue timeout T used to size every station's K (s). */
  queueTimeout: number;
  /** Time to put a job on the queue (s). */
  enqueueTime: number;
  /** Fraction of requests that trigger slow work, 0..1. */
  slowFraction: number;
  /** Duration of one slow job (s). */
  jobTime: number;
  jobSlotsPerWorker: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  cpuTime: 0.01,
  workersPerCore: 8,
  dbReadTime: 0.004,
  dbWriteTime: 0.008,
  readFraction: 0.9,
  cacheHitRate: 0.8,
  cacheServiceTime: 0.0005,
  cacheCores: 2,
  lbServiceTime: 0.00025,
  lbCores: 4,
  queueTimeout: 1,
  enqueueTime: 0.002,
  slowFraction: 0,
  jobTime: 0.5,
  jobSlotsPerWorker: 2,
};

export interface SLO {
  /** P95 latency must be below this (s). */
  p95: number;
  /** Error rate must be below this, 0..1. */
  errorRate: number;
}

export const DEFAULT_SLO: SLO = { p95: 0.3, errorRate: 0.01 };

/** Whether a number is computed from the model or estimated. MODEL.md §5. */
export type MetricKind = "calculated" | "estimate";

export type StationId = "lb" | "cpu" | "workers" | "db-primary" | "db-replica" | "cache";

export interface StationMetrics {
  id: StationId;
  /** How many identical copies exist (app servers, replicas). */
  copies: number;
  arrivalRate: number;
  throughput: number;
  /** Offered load per server if nothing upstream rejected requests. Can exceed 1. */
  demand: number;
  /** Busy fraction, always ≤ 1. */
  utilization: number;
  blocking: number;
  meanResponse: number;
  p95Response: number;
}

export interface JobMetrics {
  arrivalRate: number;
  /** Jobs per second the workers can finish. */
  capacity: number;
  /** Backlog growth in jobs per second; 0 when the workers keep up. */
  growthRate: number;
}

/** Where a request spends its time inside an app server. MODEL.md §7. */
export interface TimeShares {
  cpu: number;
  db: number;
  cache: number;
}

export interface SimResult {
  rps: number;
  throughput: number;
  errorRate: number;
  meanLatency: number;
  p95Latency: number;
  /** Worker hold time H (s). */
  holdTime: number;
  shares: TimeShares;
  stations: StationMetrics[];
  jobs?: JobMetrics;
  /** Share of app CPU time spent on slow jobs (inline mode only). */
  inlineJobCpuShare?: number;
  cost: number;
  complexity: number;
}

export const METRIC_KINDS = {
  throughput: "calculated",
  errorRate: "calculated",
  meanLatency: "calculated",
  p95Latency: "estimate",
  utilization: "calculated",
  saturationPoint: "calculated",
  cost: "estimate",
} as const satisfies Record<string, MetricKind>;
