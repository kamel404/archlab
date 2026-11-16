/**
 * One M/M/c/K station. See MODEL.md §2.
 * Units: seconds and requests per second.
 */
import { erlangCdfs, quantile } from "./math";

export const MAX_QUEUE_SLOTS = 2000;

export interface StationInput {
  /** Arrival rate (rps). */
  arrivalRate: number;
  /** Mean service time (s). */
  serviceTime: number;
  /** Parallel servers. */
  servers: number;
  /** Max requests in the station, waiting + in service. */
  capacity: number;
}

export interface Station {
  readonly input: StationInput;
  /** Offered load per server, λS/c. Can exceed 1. */
  readonly demand: number;
  readonly blocking: number;
  readonly throughput: number;
  /** Busy fraction, λ_eff·S/c. Always ≤ 1. */
  readonly utilization: number;
  readonly meanInSystem: number;
  readonly meanResponse: number;
  readonly meanWait: number;
  /** P(an admitted request waits at all). */
  readonly waitProbability: number;
  /** P95 of response time. Computed on demand: it is the expensive part. */
  p95Response(): number;
  /** P95 of wait time (0 when fewer than 5% of requests wait). */
  p95Wait(): number;
}

/**
 * K from a queue timeout: K = c + clamp(T·c/S, 1, 2000). MODEL.md §2.1.
 * Deliberately not floored: a fractional K keeps results continuous in S (see solveStation).
 */
export function capacityFromTimeout(servers: number, serviceTime: number, timeout: number): number {
  const slots = (timeout * servers) / serviceTime;
  return servers + Math.min(MAX_QUEUE_SLOTS, Math.max(1, slots));
}

/**
 * Solve a station. A fractional capacity is solved at floor(K) and floor(K)+1 and every
 * output is interpolated linearly, so metrics move continuously as K moves. Without this,
 * the worker pool (whose K depends on its hold time) makes latency jitter in overload.
 */
export function solveStation(input: StationInput): Station {
  const K = input.capacity;
  const lowK = Math.floor(K + 1e-9);
  const frac = K - lowK;
  if (frac < 1e-9) return solveIntegerStation({ ...input, capacity: lowK });
  const lo = solveIntegerStation({ ...input, capacity: lowK });
  const hi = solveIntegerStation({ ...input, capacity: lowK + 1 });
  const mix = (x: number, y: number) => x + frac * (y - x);
  return {
    input,
    demand: lo.demand,
    blocking: mix(lo.blocking, hi.blocking),
    throughput: mix(lo.throughput, hi.throughput),
    utilization: mix(lo.utilization, hi.utilization),
    meanInSystem: mix(lo.meanInSystem, hi.meanInSystem),
    meanResponse: mix(lo.meanResponse, hi.meanResponse),
    meanWait: mix(lo.meanWait, hi.meanWait),
    waitProbability: mix(lo.waitProbability, hi.waitProbability),
    p95Response: () => mix(lo.p95Response(), hi.p95Response()),
    p95Wait: () => mix(lo.p95Wait(), hi.p95Wait()),
  };
}

function solveIntegerStation(input: StationInput): Station {
  const { arrivalRate: lambda, serviceTime: S, servers: c, capacity: K } = input;
  if (!(S > 0) || !(c >= 1) || !(K >= c) || !Number.isInteger(K) || !(lambda >= 0)) {
    throw new Error(`Invalid station input: ${JSON.stringify(input)}`);
  }
  const mu = 1 / S;
  const a = lambda * S;

  // State probabilities p_0..p_K, built iteratively (no factorials).
  const p = new Float64Array(K + 1);
  p[0] = 1;
  let total = 1;
  for (let n = 1; n <= K; n++) {
    p[n] = (p[n - 1] * a) / Math.min(n, c);
    total += p[n];
  }
  // Rescale if weights overflowed (very high load with many slots).
  if (!Number.isFinite(total)) {
    let maxLog = -Infinity;
    const logs = new Float64Array(K + 1);
    for (let n = 1; n <= K; n++) {
      logs[n] = logs[n - 1] + Math.log(a) - Math.log(Math.min(n, c));
      if (logs[n] > maxLog) maxLog = logs[n];
    }
    total = 0;
    for (let n = 0; n <= K; n++) {
      p[n] = Math.exp(logs[n] - Math.max(maxLog, 0));
      total += p[n];
    }
  }
  let meanInSystem = 0;
  for (let n = 0; n <= K; n++) {
    p[n] /= total;
    meanInSystem += n * p[n];
  }

  const blocking = p[K];
  const throughput = lambda * (1 - blocking);
  const meanResponse = throughput > 0 ? meanInSystem / throughput : S;
  const admitted = 1 - blocking;
  let waitProbability = 0;
  for (let n = c; n < K; n++) waitProbability += p[n] / admitted;

  // P95 machinery is built lazily: solves inside the network bisection never need it.
  let cachedP95Response: number | undefined;
  let cachedP95Wait: number | undefined;
  let cdfs: { waitCdf: (t: number) => number; responseCdf: (t: number) => number } | undefined;
  const getCdfs = () => (cdfs ??= buildCdfs(p, c, K, mu, admitted));

  return {
    input,
    demand: a / c,
    blocking,
    throughput,
    utilization: (throughput * S) / c,
    meanInSystem,
    meanResponse,
    meanWait: meanResponse - S,
    waitProbability,
    p95Response: () => (cachedP95Response ??= quantile(getCdfs().responseCdf, 0.95)),
    p95Wait: () => (cachedP95Wait ??= waitProbability < 0.05 ? 0 : quantile(getCdfs().waitCdf, 0.95)),
  };
}

/**
 * Wait and response-time CDFs for admitted arrivals. MODEL.md §2.4.
 * Queued arrivals (n >= c) wait Erlang(k = n−c+1, θ = cμ). Service Exp(μ) is written as
 * Erlang(N, θ) with N ~ Geometric(q = 1/c), so every term is positive (no cancellation).
 */
function buildCdfs(p: Float64Array, c: number, K: number, mu: number, admitted: number) {
  const theta = c * mu;
  const queuedWeight = new Float64Array(K - c + 2);
  let freeWeight = 0; // arrivals that start service immediately
  for (let n = 0; n < c; n++) freeWeight += p[n] / admitted;
  // Ignore queue lengths with negligible weight (< 1e-15 each); cost scales with lastK.
  let lastK = 0;
  for (let n = c; n < K; n++) {
    const weight = p[n] / admitted;
    if (weight >= 1e-15) {
      queuedWeight[n - c + 1] = weight;
      lastK = n - c + 1;
    }
  }
  const q = 1 / c;
  // Truncate the geometric sum where (1−q)^J < 1e−12.
  const maxJ = q >= 1 ? 1 : Math.ceil(Math.log(1e-12) / Math.log(1 - q));

  const waitCdf = (t: number) => {
    const G = erlangCdfs(lastK, theta, t);
    let F = freeWeight;
    for (let k = 1; k <= lastK; k++) F += queuedWeight[k] * G[k];
    return F;
  };
  const responseCdf = (t: number) => {
    let F = freeWeight * (1 - Math.exp(-mu * t));
    if (lastK === 0) return F;
    const G = erlangCdfs(lastK + maxJ, theta, t);
    // S_k = Σ_{j≥1} q(1−q)^{j−1} G[k+j]. Direct sum for the last k, then S_k = q·G[k+1] + (1−q)·S_{k+1}.
    let s = 0;
    for (let j = 1, w = q; j <= maxJ; j++, w *= 1 - q) s += w * G[lastK + j];
    F += queuedWeight[lastK] * s;
    for (let k = lastK - 1; k >= 1; k--) {
      s = q * G[k + 1] + (1 - q) * s;
      F += queuedWeight[k] * s;
    }
    return F;
  };
  return { waitCdf, responseCdf };
}
