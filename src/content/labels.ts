import type { Assumptions, StationId, TimeSink } from "@/engine";

export const STATION_NAMES: Record<StationId, string> = {
  lb: "load balancer",
  workers: "request slots",
  cpu: "app CPU",
  "db-primary": "database",
  "db-replica": "read replica",
  cache: "cache",
};

export const SINK_NAMES: Record<TimeSink, string> = {
  cpu: "app CPU",
  db: "database",
  cache: "cache",
};

/** Assumptions panel rows, in display order. `format` turns the engine value into display text. */
export const ASSUMPTION_LABELS: { key: keyof Assumptions; label: string; format: (v: number) => string }[] = [
  { key: "cpuTime", label: "App CPU time per request", format: (v) => `${(v * 1000).toFixed(1)} ms` },
  { key: "workersPerCore", label: "Request slots per CPU core", format: (v) => `${v}` },
  { key: "dbReadTime", label: "Database read time", format: (v) => `${(v * 1000).toFixed(1)} ms` },
  { key: "dbWriteTime", label: "Database write time", format: (v) => `${(v * 1000).toFixed(1)} ms` },
  { key: "readFraction", label: "Share of requests that are reads", format: (v) => `${(v * 100).toFixed(0)}%` },
  { key: "lbServiceTime", label: "Load balancer time per request", format: (v) => `${(v * 1000).toFixed(2)} ms` },
  { key: "queueTimeout", label: "Max time a request waits in a queue", format: (v) => `${v} s` },
];

/** MODEL.md §12. Shown in every scenario's Assumptions panel. */
export const STATED_LIMITS: string[] = [
  "Service times are random with an exponential spread. Real endpoints have heavier tails.",
  "Components are treated as independent. Correlated slowdowns are not modelled.",
  "Not modelled: database connection pools, cache invalidation and cold starts, replication lag, network latency, garbage-collection pauses, noisy neighbours, autoscaling.",
  "Prices are fictional: the right order of magnitude, not any real provider.",
  "ARCHLAB teaches direction and order of magnitude, not capacity planning.",
];
