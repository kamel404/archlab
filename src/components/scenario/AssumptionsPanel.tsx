import { PRICES, type Assumptions, type SLO } from "@/engine";
import { formatMs, formatPercent } from "@/content/format";
import { ASSUMPTION_LABELS, STATED_LIMITS } from "@/content/labels";

export function AssumptionsPanel({ assumptions, slo }: { assumptions: Assumptions; slo: SLO }) {
  return (
    <details className="group rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900 marker:text-zinc-400 dark:text-zinc-100">
        Assumptions and limits
      </summary>
      <div className="mt-4 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <h3 className="font-medium text-zinc-800 dark:text-zinc-200">Model inputs</h3>
          <dl className="mt-2 space-y-1">
            {ASSUMPTION_LABELS.map(({ key, label, format }) => (
              <div key={key} className="flex justify-between gap-4">
                <dt className="text-zinc-600 dark:text-zinc-400">{label}</dt>
                <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">{format(assumptions[key])}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-600 dark:text-zinc-400">Target</dt>
              <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">
                P95 &lt; {formatMs(slo.p95)}, errors &lt; {formatPercent(slo.errorRate)}
              </dd>
            </div>
          </dl>
          <h3 className="mt-4 font-medium text-zinc-800 dark:text-zinc-200">Fictional monthly prices</h3>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            App server ${PRICES.app.small} / ${PRICES.app.medium} / ${PRICES.app.large} (small / medium / large, 2 / 4 / 8 cores).
            Database ${PRICES.db.small} / ${PRICES.db.medium} / ${PRICES.db.large}. Load balancer ${PRICES.loadBalancer}.
          </p>
        </div>
        <div>
          <h3 className="font-medium text-zinc-800 dark:text-zinc-200">What is calculated and what is estimated</h3>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Throughput, errors, mean latency, utilization and the breaking point are calculated from a queueing model. P95 latency
            is an upper-bound estimate, and cost uses fictional prices.
          </p>
          <h3 className="mt-4 font-medium text-zinc-800 dark:text-zinc-200">Not modelled</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-400">
            {STATED_LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
