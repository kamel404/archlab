/** Plain-language text for each verdict code. MODEL.md §9. */
import type { SLO, Verdict, VerdictCode } from "@/engine";
import { complexityPhrase, formatMs, formatPercent, formatSignedUsd, formatUsd } from "./format";
import type { Explanation } from "./diagnosis";

interface Context {
  slo: SLO;
  maxRps: number;
  /** Label of the option the user picked. */
  optionLabel: string;
  /** Label of the better option, for CHEAPER_FIX_EXISTS. */
  betterLabel?: string;
  /** Monthly cost of the better option, for CHEAPER_FIX_EXISTS. */
  betterCost?: number;
  /** Explanation of what is still wrong after the change, for DID_NOT_FIX. */
  afterExplanation?: Explanation;
}

function addedCost(v: Verdict): string {
  const cost = v.after.cost - v.before.cost;
  const complexity = v.after.complexity - v.before.complexity;
  return `${formatSignedUsd(cost)}/month and ${complexityPhrase(complexity)}`;
}

const TEXT: Record<VerdictCode, (v: Verdict, ctx: Context) => Explanation> = {
  NOT_NEEDED_YET: (v, ctx) => ({
    tone: "warn",
    headline: "You did not need this yet",
    body:
      `At ${v.before.rps} rps the current setup already meets the target: P95 about ${formatMs(v.before.p95Latency)} against ${formatMs(ctx.slo.p95)}, ` +
      `${formatPercent(v.before.errorRate)} errors. ` +
      (v.saturationPoint === null
        ? `It keeps up all the way to ${ctx.maxRps} rps. `
        : v.saturationPoint !== undefined
          ? `It keeps up until about ${v.saturationPoint} rps. `
          : "") +
      `This change costs ${addedCost(v)} for headroom you are not using yet.`,
  }),
  DID_NOT_FIX: (v, ctx) => ({
    tone: "bad",
    headline: "This did not fix it",
    body:
      `After the change, P95 is still about ${formatMs(v.after.p95Latency)} and ${formatPercent(v.after.errorRate)} of requests fail. ` +
      (ctx.afterExplanation ? ctx.afterExplanation.body : ""),
  }),
  WORTH_IT: (v) => ({
    tone: "good",
    headline: "Worth it at this load",
    body:
      `P95 drops from about ${formatMs(v.before.p95Latency)} to ${formatMs(v.after.p95Latency)}, and errors from ${formatPercent(v.before.errorRate)} to ${formatPercent(v.after.errorRate)}, ` +
      `for ${addedCost(v)}. It is the cheapest option here that meets the target.`,
  }),
  CHEAPER_FIX_EXISTS: (v, ctx) => ({
    tone: "warn",
    headline: "It works, but a cheaper fix exists",
    body:
      `This meets the target, for ${addedCost(v)}. ` +
      `But ${ctx.betterLabel ?? "another option"} meets it too, for ${ctx.betterCost !== undefined ? `${formatUsd(ctx.betterCost)}/month in total instead of ${formatUsd(v.after.cost)}` : "less"}. ` +
      `Pay for the difference only if you expect to need it.`,
  }),
};

export function explainVerdict(v: Verdict, ctx: Context): Explanation {
  return TEXT[v.code](v, ctx);
}

export const VERDICT_CODES = Object.keys(TEXT) as VerdictCode[];
