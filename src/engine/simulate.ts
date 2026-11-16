/**
 * Architecture + workload -> metrics. MODEL.md §3–§5.
 * Pure and deterministic: no React, no DOM, no clock, no randomness.
 */
import { bisectIncreasing } from "./model/math";
import { complexityPoints, monthlyCost } from "./model/pricing";
import { capacityFromTimeout, solveStation, type Station } from "./model/station";
import {
  CORES,
  type Architecture,
  type Assumptions,
  type JobMetrics,
  type SimResult,
  type StationId,
  type StationMetrics,
} from "./model/types";

interface AppServerState {
  cpu: Station;
  primary: Station;
  replica: Station | null;
  cache: Station | null;
  workers: Station;
  holdTime: number;
  cacheTime: number;
  dbTime: number;
  admittedNext: number;
}

/** App CPU time per request, including slow work when it runs inline. MODEL.md §6. */
export function cpuTimePerRequest(arch: Architecture, a: Assumptions): number {
  const f = a.slowFraction;
  if (f <= 0) return a.cpuTime;
  if (arch.jobs?.mode === "queued") return a.cpuTime + f * a.enqueueTime;
  return (1 - f) * a.cpuTime + f * a.jobTime;
}

export function simulate(arch: Architecture, a: Assumptions, rps: number): SimResult {
  if (!(rps >= 0)) throw new Error(`rps must be >= 0, got ${rps}`);
  const n = arch.app.count;
  const cores = CORES[arch.app.size];
  const workers = cores * a.workersPerCore;
  const dbCores = CORES[arch.db.size];
  const replicas = arch.db.replicas;
  const r = a.readFraction;
  const w = 1 - r;
  const h = arch.cache ? a.cacheHitRate : 0;
  const T = a.queueTimeout;
  const cpuTime = cpuTimePerRequest(arch, a);
  const perServer = rps / n;

  const station = (arrivalRate: number, serviceTime: number, servers: number) =>
    solveStation({
      arrivalRate,
      serviceTime,
      servers,
      capacity: capacityFromTimeout(servers, serviceTime, T),
    });

  const lb = n > 1 ? station(rps, a.lbServiceTime, a.lbCores) : null;

  // Everything downstream of the worker pool, given admitted rate x per server. MODEL.md §4.
  const evaluate = (x: number): AppServerState => {
    const cpu = station(x, cpuTime, cores);
    const reads = n * x * r;
    const writes = n * x * w;
    const readsPerDbNode = (reads * (1 - h)) / (1 + replicas);
    const primaryRate = readsPerDbNode + writes;
    const primaryService =
      primaryRate > 0 ? (readsPerDbNode * a.dbReadTime + writes * a.dbWriteTime) / primaryRate : a.dbReadTime;
    const primary = station(primaryRate, primaryService, dbCores);
    const replica = replicas > 0 ? station(readsPerDbNode, a.dbReadTime, dbCores) : null;
    const cache = arch.cache ? station(reads, a.cacheServiceTime, a.cacheCores) : null;

    const readTime = replica
      ? (primary.meanResponse + replicas * replica.meanResponse) / (1 + replicas)
      : primary.meanResponse;
    const dbTime = r * (1 - h) * readTime + w * primary.meanResponse;
    const cacheTime = cache ? r * cache.meanResponse : 0;
    const holdTime = cpu.meanResponse + cacheTime + dbTime;
    const workerPool = station(perServer, holdTime, workers);
    return {
      cpu,
      primary,
      replica,
      cache,
      workers: workerPool,
      holdTime,
      cacheTime,
      dbTime,
      admittedNext: perServer * (1 - workerPool.blocking),
    };
  };

  // x = g(x) with g decreasing: bisection on x − g(x). Never plain iteration (it oscillates).
  const admitted = bisectIncreasing((x) => x - evaluate(x).admittedNext, 0, perServer);
  const s = evaluate(admitted);

  const dbFraction = r * (1 - h) + w;
  const cacheFraction = arch.cache ? r : 0;
  const dbBlocking = s.replica ? Math.max(s.primary.blocking, s.replica.blocking) : s.primary.blocking;
  const success =
    (1 - (lb?.blocking ?? 0)) *
    (1 - s.workers.blocking) *
    (1 - s.cpu.blocking) *
    (1 - dbFraction * dbBlocking) *
    (1 - cacheFraction * (s.cache?.blocking ?? 0));
  const errorRate = 1 - success;

  const dbP95 = s.replica ? Math.max(s.primary.p95Response(), s.replica.p95Response()) : s.primary.p95Response();
  const p95Latency =
    (lb?.p95Response() ?? 0) +
    s.workers.p95Wait() +
    s.cpu.p95Response() +
    (dbFraction > 0 ? dbP95 : 0) +
    (s.cache?.p95Response() ?? 0);

  // Downstream stations only see admitted traffic. "Demand" reports what they would see if
  // nothing were rejected upstream, so overload stays visible (e.g. CPU demand 1.7 = 170%).
  const offeredScale = admitted > 0 ? perServer / admitted : 1;
  const metrics = (id: StationId, st: Station, copies: number): StationMetrics => ({
    id,
    copies,
    arrivalRate: st.input.arrivalRate,
    throughput: st.throughput,
    demand: id === "lb" || id === "workers" ? st.demand : st.demand * offeredScale,
    utilization: st.utilization,
    blocking: st.blocking,
    meanResponse: st.meanResponse,
    p95Response: st.p95Response(),
  });
  const stations: StationMetrics[] = [];
  if (lb) stations.push(metrics("lb", lb, 1));
  stations.push(metrics("workers", s.workers, n), metrics("cpu", s.cpu, n));
  if (s.cache) stations.push(metrics("cache", s.cache, 1));
  stations.push(metrics("db-primary", s.primary, 1));
  if (s.replica) stations.push(metrics("db-replica", s.replica, replicas));

  let jobs: JobMetrics | undefined;
  if (arch.jobs?.mode === "queued") {
    const arrivalRate = a.slowFraction * rps;
    const capacity = (arch.jobs.workerInstances * a.jobSlotsPerWorker) / a.jobTime;
    jobs = { arrivalRate, capacity, growthRate: Math.max(0, arrivalRate - capacity) };
  }
  const inline = arch.jobs?.mode !== "queued" && a.slowFraction > 0;

  return {
    rps,
    throughput: rps * success,
    errorRate,
    meanLatency: (lb?.meanResponse ?? 0) + s.workers.meanWait + s.holdTime,
    p95Latency,
    holdTime: s.holdTime,
    shares: {
      cpu: s.cpu.meanResponse / s.holdTime,
      db: s.dbTime / s.holdTime,
      cache: s.cacheTime / s.holdTime,
    },
    stations,
    jobs,
    inlineJobCpuShare: inline ? (a.slowFraction * a.jobTime) / cpuTime : undefined,
    cost: monthlyCost(arch),
    complexity: complexityPoints(arch),
  };
}

/** True when the result misses the SLO. */
export function missesSlo(result: SimResult, slo: { p95: number; errorRate: number }): boolean {
  return result.p95Latency >= slo.p95 || result.errorRate >= slo.errorRate;
}
