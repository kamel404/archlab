import { METRIC_KINDS, type MetricKind, type SimResult, type StationId } from "@/engine";
import { formatMs, formatPercent, formatRps, formatUsd } from "@/content/format";
import { MetricValue } from "./MetricValue";

interface Row {
  label: string;
  kind: MetricKind | null;
  value: (r: SimResult) => number;
  format: (v: number) => string;
  /** Whether a lower value is better, to colour the change. null: neutral (busier can just mean more traffic served). */
  lowerIsBetter: boolean | null;
}

const util = (id: StationId) => (r: SimResult) => r.stations.find((s) => s.id === id)?.utilization ?? 0;

const ROWS: Row[] = [
  { label: "Throughput", kind: METRIC_KINDS.throughput, value: (r) => r.throughput, format: formatRps, lowerIsBetter: false },
  { label: "Errors", kind: METRIC_KINDS.errorRate, value: (r) => r.errorRate, format: formatPercent, lowerIsBetter: true },
  { label: "Mean latency", kind: METRIC_KINDS.meanLatency, value: (r) => r.meanLatency, format: formatMs, lowerIsBetter: true },
  { label: "P95 latency", kind: METRIC_KINDS.p95Latency, value: (r) => r.p95Latency, format: formatMs, lowerIsBetter: true },
  { label: "App CPU busy (each server)", kind: METRIC_KINDS.utilization, value: util("cpu"), format: formatPercent, lowerIsBetter: null },
  { label: "Request slots busy", kind: METRIC_KINDS.utilization, value: util("workers"), format: formatPercent, lowerIsBetter: null },
  { label: "Database busy", kind: METRIC_KINDS.utilization, value: util("db-primary"), format: formatPercent, lowerIsBetter: null },
  { label: "Cost per month", kind: METRIC_KINDS.cost, value: (r) => r.cost, format: formatUsd, lowerIsBetter: true },
  { label: "Complexity points", kind: null, value: (r) => r.complexity, format: (v) => `${v}`, lowerIsBetter: true },
];

export function Comparison({ before, after, afterLabel }: { before: SimResult; after: SimResult; afterLabel: string }) {
  return (
    <section aria-labelledby="compare-heading" className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 id="compare-heading" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Before and after at {before.rps} rps
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="py-2 pr-3 font-medium">Metric</th>
              <th className="py-2 pr-3 text-right font-medium">Current setup</th>
              <th className="py-2 pr-3 text-right font-medium">{afterLabel}</th>
              <th className="py-2 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const b = row.value(before);
              const a = row.value(after);
              const cell = (v: number) => (row.kind ? <MetricValue kind={row.kind}>{row.format(v)}</MetricValue> : row.format(v));
              return (
                <tr key={row.label} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-zinc-600 dark:text-zinc-400">
                    {row.label}
                  </th>
                  <td className="py-2 pr-3 text-right text-zinc-900 dark:text-zinc-100">{cell(b)}</td>
                  <td className="py-2 pr-3 text-right font-medium text-zinc-900 dark:text-zinc-100">{cell(a)}</td>
                  <td className="py-2 text-right">
                    <Change before={b} after={a} lowerIsBetter={row.lowerIsBetter} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Change({ before, after, lowerIsBetter }: { before: number; after: number; lowerIsBetter: boolean | null }) {
  const diff = after - before;
  const scale = Math.max(Math.abs(before), Math.abs(after), 1e-9);
  if (Math.abs(diff) / scale < 0.005) return <span className="text-zinc-400">same</span>;
  const arrow = diff < 0 ? "↓" : "↑";
  if (lowerIsBetter === null) {
    return (
      <span className="text-zinc-500 dark:text-zinc-400" title={diff < 0 ? "lower" : "higher"}>
        {arrow} <span className="hidden sm:inline">{diff < 0 ? "lower" : "higher"}</span>
      </span>
    );
  }
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  const word = better ? "better" : "worse";
  return (
    <span className={better ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"} title={word}>
      {arrow} <span className="hidden sm:inline">{word}</span>
      <span className="sr-only sm:hidden">{word}</span>
    </span>
  );
}
