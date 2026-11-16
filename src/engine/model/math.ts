/**
 * Numeric helpers for the queueing model. See MODEL.md §2.4.
 */

/**
 * G[m] = P(Erlang(m, rate) <= t) for m = 0..maxPhases.
 * Computed as 1 − P(Poisson(rate·t) < m) with Poisson terms in log space,
 * so large rate·t does not underflow e^{−rate·t}.
 */
export function erlangCdfs(maxPhases: number, rate: number, t: number): Float64Array {
  const G = new Float64Array(maxPhases + 1);
  G[0] = 1;
  const z = rate * t;
  if (z <= 0) return G;
  const logZ = Math.log(z);
  let logTerm = -z; // log P(Poisson(z) = 0)
  let below = 0; // P(Poisson(z) < m)
  for (let m = 1; m <= maxPhases; m++) {
    below += Math.exp(logTerm);
    G[m] = Math.max(0, 1 - below);
    logTerm += logZ - Math.log(m);
  }
  return G;
}

/**
 * Smallest t >= 0 with cdf(t) >= target, for a non-decreasing cdf.
 * Deterministic: fixed doubling for the bracket, fixed iteration count.
 */
export function quantile(cdf: (t: number) => number, target: number): number {
  if (cdf(0) >= target) return 0;
  let lo = 0;
  let hi = 1e-3;
  while (cdf(hi) < target) {
    lo = hi;
    hi *= 2;
    if (hi > 1e7) return Infinity;
  }
  for (let i = 0; i < 100 && hi - lo > 1e-9 * hi; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * Root of an increasing function f on [lo, hi] by bisection, to a relative precision.
 * Returns hi if f(hi) <= 0 and lo if f(lo) >= 0.
 */
export function bisectIncreasing(f: (x: number) => number, lo: number, hi: number, relTol = 1e-10): number {
  if (f(hi) <= 0) return hi;
  if (f(lo) >= 0) return lo;
  for (let i = 0; i < 200 && hi - lo > relTol * hi; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return hi;
}
