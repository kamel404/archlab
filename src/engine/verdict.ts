/**
 * Before/after -> worth-it verdict, and the saturation-point search. MODEL.md §9.
 */
import { missesSlo, simulate } from "./simulate";
import type { Architecture, Assumptions, SimResult, SLO } from "./model/types";

/** One concrete setup: an architecture plus the assumptions it runs under. */
export interface Candidate {
  id: string;
  architecture: Architecture;
  assumptions: Assumptions;
}

export type VerdictCode = "NOT_NEEDED_YET" | "DID_NOT_FIX" | "WORTH_IT" | "CHEAPER_FIX_EXISTS";

export interface Verdict {
  code: VerdictCode;
  before: SimResult;
  after: SimResult;
  /** NOT_NEEDED_YET: load at which `before` stops meeting the SLO (null: not within maxRps). */
  saturationPoint?: number | null;
  /** CHEAPER_FIX_EXISTS: the top-ranked option that meets the SLO. */
  betterOption?: string;
}

/**
 * Lowest load (to 1 rps) where the candidate misses the SLO, searched on [1, maxRps].
 * Returns null if it still meets the SLO at maxRps. Assumes missing the SLO is monotone in load.
 */
export function saturationPoint(c: Omit<Candidate, "id">, slo: SLO, maxRps: number): number | null {
  const fails = (rps: number) => missesSlo(simulate(c.architecture, c.assumptions, rps), slo);
  if (fails(1)) return 1;
  if (!fails(maxRps)) return null;
  let lo = 1; // meets
  let hi = maxRps; // misses
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fails(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Options that meet the SLO at this load, best first: cost, then complexity, then id. */
export function rankOptions(options: Candidate[], rps: number, slo: SLO): { id: string; result: SimResult }[] {
  return options
    .map((o) => ({ id: o.id, result: simulate(o.architecture, o.assumptions, rps) }))
    .filter((o) => !missesSlo(o.result, slo))
    .sort(
      (x, y) =>
        x.result.cost - y.result.cost ||
        x.result.complexity - y.result.complexity ||
        x.id.localeCompare(y.id),
    );
}

export function verdict(
  before: Omit<Candidate, "id">,
  chosenId: string,
  options: Candidate[],
  rps: number,
  slo: SLO,
  maxRps: number,
): Verdict {
  const chosen = options.find((o) => o.id === chosenId);
  if (!chosen) throw new Error(`Unknown option: ${chosenId}`);
  const beforeResult = simulate(before.architecture, before.assumptions, rps);
  const after = simulate(chosen.architecture, chosen.assumptions, rps);

  if (!missesSlo(beforeResult, slo)) {
    return {
      code: "NOT_NEEDED_YET",
      before: beforeResult,
      after,
      saturationPoint: saturationPoint(before, slo, maxRps),
    };
  }
  if (missesSlo(after, slo)) return { code: "DID_NOT_FIX", before: beforeResult, after };
  const best = rankOptions(options, rps, slo)[0];
  if (best.id === chosenId) return { code: "WORTH_IT", before: beforeResult, after };
  return { code: "CHEAPER_FIX_EXISTS", before: beforeResult, after, betterOption: best.id };
}
