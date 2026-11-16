"use client";

import { METRIC_KINDS, missesSlo, type SimResult, type SLO } from "@/engine";
import { formatMs, formatPercent, formatUsd } from "@/content/format";
import { MetricValue } from "./MetricValue";

export function LoadSlider({
  value,
  min,
  max,
  step,
  saturationPoint,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  saturationPoint: number | null;
  onChange: (rps: number) => void;
}) {
  const marker = saturationPoint !== null && saturationPoint >= min && saturationPoint <= max ? saturationPoint : null;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor="load" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Load
        </label>
        <span className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {value} <span className="text-sm font-normal text-zinc-500">requests / second</span>
        </span>
      </div>
      <div className="relative mt-2">
        <input
          id="load"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-sky-600"
          aria-valuetext={`${value} requests per second`}
        />
        {marker !== null && (
          <div
            className="pointer-events-none absolute -bottom-4 -translate-x-1/2 text-[10px] text-zinc-400"
            style={{ left: `${((marker - min) / (max - min)) * 100}%` }}
            aria-hidden
          >
            ▲
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>{min}</span>
        {marker !== null && <span>▲ breaks at about {marker} rps</span>}
        <span>{max}</span>
      </div>
    </div>
  );
}

export function LiveMetrics({ result, slo }: { result: SimResult; slo: SLO }) {
  const p95Miss = result.p95Latency >= slo.p95;
  const errMiss = result.errorRate >= slo.errorRate;
  const ok = !missesSlo(result, slo);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <Stat label="P95 latency" hint={`target < ${formatMs(slo.p95)}`} bad={p95Miss}>
        <MetricValue kind={METRIC_KINDS.p95Latency}>{formatMs(result.p95Latency)}</MetricValue>
      </Stat>
      <Stat label="Errors" hint={`target < ${formatPercent(slo.errorRate)}`} bad={errMiss}>
        <MetricValue kind={METRIC_KINDS.errorRate}>{formatPercent(result.errorRate)}</MetricValue>
      </Stat>
      <Stat label="Mean latency">
        <MetricValue kind={METRIC_KINDS.meanLatency}>{formatMs(result.meanLatency)}</MetricValue>
      </Stat>
      <Stat label="Cost per month" hint="fictional prices">
        <MetricValue kind={METRIC_KINDS.cost}>{formatUsd(result.cost)}</MetricValue>
      </Stat>
      <p className="col-span-2 text-sm sm:col-span-4">
        {ok ? (
          <span className="text-emerald-700 dark:text-emerald-400">✓ Meets the target</span>
        ) : (
          <span className="font-medium text-red-700 dark:text-red-400">✗ Misses the target</span>
        )}
      </p>
    </dl>
  );
}

function Stat({ label, hint, bad, children }: { label: string; hint?: string; bad?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className={`text-lg font-semibold ${bad ? "text-red-700 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"}`}>{children}</dd>
      {hint && <dd className="text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</dd>}
    </div>
  );
}
