"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMemo } from "react";
import { simulate, type Candidate, type SLO } from "@/engine";

const POINTS = 40;
const curveCache = new Map<string, number[]>();

/** P95 (ms) at evenly spaced loads. Depends only on the setup, so it is cached per setup. */
function p95Curve(c: Omit<Candidate, "id">, loads: number[]): number[] {
  const key = JSON.stringify([c.architecture, c.assumptions, loads[0], loads.at(-1)]);
  let curve = curveCache.get(key);
  if (!curve) {
    curve = loads.map((rps) => simulate(c.architecture, c.assumptions, rps).p95Latency * 1000);
    curveCache.set(key, curve);
  }
  return curve;
}

export function LatencyChart({
  before,
  after,
  afterLabel,
  load,
  min,
  max,
  slo,
}: {
  before: Omit<Candidate, "id">;
  after: Omit<Candidate, "id"> | null;
  afterLabel?: string;
  load: number;
  min: number;
  max: number;
  slo: SLO;
}) {
  const loads = useMemo(() => Array.from({ length: POINTS + 1 }, (_, i) => Math.round(min + ((max - min) * i) / POINTS)), [min, max]);
  const beforeCurve = useMemo(() => p95Curve(before, loads), [before, loads]);
  const afterCurve = useMemo(() => (after ? p95Curve(after, loads) : null), [after, loads]);
  const data = loads.map((rps, i) => ({ rps, before: beforeCurve[i], after: afterCurve?.[i] }));
  const sloMs = slo.p95 * 1000;
  const ceiling = sloMs * 2;

  return (
    <figure className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <figcaption className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        P95 latency in ms as load grows <span className="font-normal text-zinc-500">(estimate, capped at {ceiling} ms)</span>
      </figcaption>
      <div className="mt-2 h-56 text-xs">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis
              dataKey="rps"
              type="number"
              domain={[min, max]}
              stroke="var(--chart-axis)"
              tick={{ fill: "var(--chart-axis)" }}
              label={{ value: "requests / second", position: "insideBottom", offset: -8, fill: "var(--chart-axis)" }}
            />
            <YAxis
              domain={[0, ceiling]}
              allowDataOverflow
              stroke="var(--chart-axis)"
              tick={{ fill: "var(--chart-axis)" }}
              tickFormatter={(v: number) => `${v}`}
              width={40}
            />
            <Tooltip
              formatter={(v, name) => [`${Math.round(Number(v))} ms`, name === "before" ? "Current setup" : (afterLabel ?? "After")]}
              labelFormatter={(rps) => `${rps} rps`}
              contentStyle={{ background: "var(--background)", border: "1px solid var(--chart-grid)", borderRadius: 8 }}
            />
            <ReferenceLine y={sloMs} stroke="#dc2626" strokeDasharray="4 4" label={{ value: "target", position: "insideTopLeft", fill: "#dc2626" }} />
            <ReferenceLine x={load} stroke="var(--chart-axis)" />
            <Line dataKey="before" name="before" stroke="var(--chart-before)" strokeWidth={2} dot={false} isAnimationActive={false} />
            {afterCurve && <Line dataKey="after" name="after" stroke="var(--chart-after)" strokeWidth={2} dot={false} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        <Legend color="var(--chart-before)" label="Current setup" />
        {afterCurve && <Legend color="var(--chart-after)" label={afterLabel ?? "After"} />}
        <Legend color="#dc2626" label={`Target: P95 < ${sloMs} ms`} dashed />
      </div>
    </figure>
  );
}

function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="16" height="4" aria-hidden>
        <line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}
