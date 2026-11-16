/**
 * Plain-language text for each diagnosis code. The engine returns codes and data
 * (MODEL.md §7); every sentence the user reads about a bottleneck comes from here.
 */
import type { Diagnosis, DiagnosisCode, SimResult, SLO, StationId } from "@/engine";
import { formatMs, formatPercent } from "./format";
import { SINK_NAMES, STATION_NAMES } from "./labels";

export type Tone = "good" | "warn" | "bad";

export interface Explanation {
  headline: string;
  body: string;
  tone: Tone;
}

interface Context {
  slo: SLO;
  /** Top of the scenario's load range, used when the saturation point is beyond it. */
  maxRps: number;
}

function utilization(r: SimResult, id: StationId): number {
  return r.stations.find((s) => s.id === id)?.utilization ?? 0;
}

function headroomSentence(d: Diagnosis, ctx: Context): string {
  if (d.saturationPoint === undefined) return "";
  if (d.saturationPoint === null) return ` It still meets the target at ${ctx.maxRps} rps, the top of this scenario.`;
  const times = d.headroom !== undefined && d.headroom >= 1.05 ? `, ${d.headroom.toFixed(1)}× the current load` : "";
  return ` It keeps meeting the target until about ${d.saturationPoint} rps${times}.`;
}

const TEXT: Record<DiagnosisCode, (d: Diagnosis, r: SimResult, ctx: Context) => Explanation> = {
  HEALTHY: (d, _r, ctx) => ({
    tone: "good",
    headline: "Healthy, with room to grow",
    body: `The busiest part is the ${STATION_NAMES[d.busiest.id]}, at ${formatPercent(d.busiest.utilization)} busy.${headroomSentence(d, ctx)}`,
  }),
  APPROACHING_LIMIT: (d, _r, ctx) => ({
    tone: "warn",
    headline: "Still fine, but getting close",
    body: `The ${STATION_NAMES[d.busiest.id]} is ${formatPercent(d.busiest.utilization)} busy. Past 70 to 85% busy, queues build quickly and latency climbs steeply.${headroomSentence(d, ctx)}`,
  }),
  WORKER_POOL_EXHAUSTED: (d, r) => ({
    tone: "bad",
    headline: "The app server is full",
    body:
      `Every request slot on the app server is taken, so new requests are turned away: ${formatPercent(r.errorRate)} of requests fail. ` +
      `Requests spend ${formatPercent(d.dominant.share)} of their time on the ${SINK_NAMES[d.dominant.sink]}` +
      (d.dominant.sink === "cpu"
        ? ` (${formatPercent(d.cpuUtilization)} busy), so the server needs more CPU.`
        : `, so that is the part to fix. The app CPU is only ${formatPercent(d.cpuUtilization)} busy.`),
  }),
  CPU_BOUND: (d, r, ctx) => ({
    tone: "bad",
    headline: "The app CPU is the bottleneck",
    body: `The app CPU is ${formatPercent(d.cpuUtilization)} busy and requests spend ${formatPercent(d.dominant.share)} of their time waiting for it. P95 latency is about ${formatMs(r.p95Latency)}, against a target of ${formatMs(ctx.slo.p95)}.`,
  }),
  DB_BOUND: (d, r) => ({
    tone: "bad",
    headline: "The database is the bottleneck",
    body: `Your app CPU is ${formatPercent(1 - d.cpuUtilization)} idle. Requests spend ${formatPercent(d.dominant.share)} of their time waiting on the database, which is ${formatPercent(utilization(r, "db-primary"))} busy.`,
  }),
  CACHE_BOUND: (d, r) => ({
    tone: "bad",
    headline: "The cache is the bottleneck",
    body: `The cache is ${formatPercent(utilization(r, "cache"))} busy and requests spend ${formatPercent(d.dominant.share)} of their time on it.`,
  }),
  INLINE_SLOW_WORK: (d) => ({
    tone: "bad",
    headline: "Slow work is eating the CPU",
    body: `Slow jobs take ${formatPercent(d.inlineJobCpuShare ?? 0)} of the app CPU's time, and every ordinary request waits behind them.`,
  }),
  JOB_BACKLOG_GROWING: (d) => ({
    tone: "bad",
    headline: "The job queue is growing",
    body: `Jobs arrive faster than the workers finish them. The backlog grows by ${(d.jobGrowthRate ?? 0).toFixed(1)} jobs every second, and keeps growing until load drops or you add workers.`,
  }),
};

export function explainDiagnosis(d: Diagnosis, r: SimResult, ctx: Context): Explanation {
  return TEXT[d.code](d, r, ctx);
}

export const DIAGNOSIS_CODES = Object.keys(TEXT) as DiagnosisCode[];
