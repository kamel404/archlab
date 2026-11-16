/**
 * Metrics -> bottleneck code + data. MODEL.md §7.
 * Returns codes only; explanation text lives in src/content/, keyed by code.
 */
import { missesSlo } from "./simulate";
import type { SimResult, SLO, StationId } from "./model/types";

export type DiagnosisCode =
  | "INLINE_SLOW_WORK"
  | "JOB_BACKLOG_GROWING"
  | "WORKER_POOL_EXHAUSTED"
  | "CPU_BOUND"
  | "DB_BOUND"
  | "CACHE_BOUND"
  | "APPROACHING_LIMIT"
  | "HEALTHY";

export type Status = "green" | "amber" | "red";

export type TimeSink = "cpu" | "db" | "cache";

export interface Diagnosis {
  code: DiagnosisCode;
  /** Where requests spend most of their time inside an app server. */
  dominant: { sink: TimeSink; share: number };
  /** Busiest station by utilization. */
  busiest: { id: StationId; utilization: number };
  cpuUtilization: number;
  /** Saturation point (rps), when the caller computed one. */
  saturationPoint?: number | null;
  /** Saturation point / current load, when available. */
  headroom?: number;
  jobGrowthRate?: number;
  inlineJobCpuShare?: number;
  statuses: Partial<Record<StationId, Status>>;
}

export const STATUS_THRESHOLDS = { amber: 0.7, red: 0.85, blocking: 0.01 } as const;
const WORKER_EXHAUSTED = 0.95;

export function stationStatus(utilization: number, blocking: number): Status {
  if (utilization >= STATUS_THRESHOLDS.red || blocking >= STATUS_THRESHOLDS.blocking) return "red";
  if (utilization >= STATUS_THRESHOLDS.amber) return "amber";
  return "green";
}

export function diagnose(result: SimResult, slo: SLO, saturationPoint?: number | null): Diagnosis {
  const sinks: [TimeSink, number][] = [
    ["cpu", result.shares.cpu],
    ["db", result.shares.db],
    ["cache", result.shares.cache],
  ];
  sinks.sort((x, y) => y[1] - x[1]);
  const dominant = { sink: sinks[0][0], share: sinks[0][1] };

  let busiest = { id: result.stations[0].id, utilization: -1 };
  const statuses: Partial<Record<StationId, Status>> = {};
  for (const st of result.stations) {
    statuses[st.id] = stationStatus(st.utilization, st.blocking);
    if (st.utilization > busiest.utilization) busiest = { id: st.id, utilization: st.utilization };
  }
  const cpuUtilization = result.stations.find((s) => s.id === "cpu")!.utilization;
  const workerUtilization = result.stations.find((s) => s.id === "workers")!.utilization;
  const missed = missesSlo(result, slo);

  const base = {
    dominant,
    busiest,
    cpuUtilization,
    statuses,
    ...(saturationPoint !== undefined && {
      saturationPoint,
      headroom: saturationPoint === null || result.rps === 0 ? undefined : saturationPoint / result.rps,
    }),
  };

  if (result.jobs && result.jobs.growthRate > 0) {
    return { ...base, code: "JOB_BACKLOG_GROWING", jobGrowthRate: result.jobs.growthRate };
  }
  if (missed && result.inlineJobCpuShare !== undefined && result.inlineJobCpuShare > 0.5) {
    return { ...base, code: "INLINE_SLOW_WORK", inlineJobCpuShare: result.inlineJobCpuShare };
  }
  if (workerUtilization >= WORKER_EXHAUSTED) return { ...base, code: "WORKER_POOL_EXHAUSTED" };
  if (missed) {
    const code = dominant.sink === "cpu" ? "CPU_BOUND" : dominant.sink === "db" ? "DB_BOUND" : "CACHE_BOUND";
    return { ...base, code };
  }
  if (busiest.utilization >= STATUS_THRESHOLDS.amber) return { ...base, code: "APPROACHING_LIMIT" };
  return { ...base, code: "HEALTHY" };
}
