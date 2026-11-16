import type { MetricKind } from "@/engine";

const TITLES: Record<MetricKind, string> = {
  calculated: "Calculated from the model",
  estimate: "Estimate: see the Assumptions panel",
};

/**
 * Every number the user sees goes through here, so calculated values and estimates
 * always look different (MODEL.md §5). Estimates get a "≈" and a dotted underline.
 */
export function MetricValue({ kind, children, className = "" }: { kind: MetricKind; children: React.ReactNode; className?: string }) {
  return (
    <span
      title={TITLES[kind]}
      className={`tabular-nums ${kind === "estimate" ? "underline decoration-dotted decoration-zinc-400 underline-offset-4" : ""} ${className}`}
    >
      {kind === "estimate" && <span aria-label="about">≈</span>}
      {children}
    </span>
  );
}

export function KindLegend() {
  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      Plain numbers are calculated from the model.{" "}
      <span className="underline decoration-dotted decoration-zinc-400 underline-offset-4">≈ Underlined</span> numbers are estimates.
    </p>
  );
}
