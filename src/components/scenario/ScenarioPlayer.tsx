"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { diagnose, monthlyCost, saturationPoint, simulate, verdict } from "@/engine";
import { explainDiagnosis } from "@/content/diagnosis";
import { explainVerdict } from "@/content/verdict";
import { baselineCandidate, getScenario, optionCandidates } from "@/scenarios";
import { useScenarioStore } from "@/store/scenario-store";
import { ArchitectureDiagram } from "./ArchitectureDiagram";
import { AssumptionsPanel } from "./AssumptionsPanel";
import { Comparison } from "./Comparison";
import { ExplanationCard } from "./ExplanationCard";
import { FixOptions } from "./FixOptions";
import { LatencyChart } from "./LatencyChart";
import { LiveMetrics, LoadSlider } from "./LoadControls";
import { KindLegend } from "./MetricValue";

/** `value` once it has stopped changing for `delay` ms. For work too slow to run every frame. */
function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return settled;
}

export function ScenarioPlayer({ slug }: { slug: string }) {
  const scenario = getScenario(slug);
  if (!scenario) throw new Error(`Unknown scenario: ${slug}`);
  const stage = scenario.stages[0];
  const { slo, load } = scenario;

  const store = useScenarioStore();
  const { start } = store;
  useEffect(() => start(slug, load.initial), [start, slug, load.initial]);
  // Until the store is initialised (first render, server render), show the scenario defaults.
  const ready = store.slug === slug;
  const rps = ready ? store.rps : load.initial;
  const chosenId = ready ? store.chosen : null;
  const view = ready && chosenId ? store.view : "before";

  const baseline = useMemo(() => baselineCandidate(scenario), [scenario]);
  const options = useMemo(() => optionCandidates(scenario, stage), [scenario, stage]);
  const chosen = options.find((o) => o.id === chosenId) ?? null;
  const chosenOption = stage.options.find((o) => o.id === chosenId) ?? null;

  // Saturation points depend on the setup, not the load: compute once per setup.
  const baselineSat = useMemo(() => saturationPoint(baseline, slo, load.max), [baseline, slo, load.max]);
  const chosenSat = useMemo(() => (chosen ? saturationPoint(chosen, slo, load.max) : null), [chosen, slo, load.max]);

  const before = useMemo(() => simulate(baseline.architecture, baseline.assumptions, rps), [baseline, rps]);
  const after = useMemo(() => (chosen ? simulate(chosen.architecture, chosen.assumptions, rps) : null), [chosen, rps]);

  const shown = view === "after" && chosen && after ? { candidate: chosen, result: after, sat: chosenSat } : { candidate: baseline, result: before, sat: baselineSat };
  const diagnosis = diagnose(shown.result, slo, shown.sat);
  const diagnosisText = explainDiagnosis(diagnosis, shown.result, { slo, maxRps: load.max });

  // The verdict ranks every option and may search for a saturation point: wait for the slider to settle.
  const settledRps = useSettled(rps, 150);
  const verdictResult = useMemo(
    () => (chosen ? verdict(baseline, chosen.id, options, settledRps, slo, load.max) : null),
    [baseline, chosen, options, settledRps, slo, load.max],
  );
  const verdictText = useMemo(() => {
    if (!verdictResult || !chosenOption) return null;
    const better = stage.options.find((o) => o.id === verdictResult.betterOption);
    return explainVerdict(verdictResult, {
      slo,
      maxRps: load.max,
      optionLabel: chosenOption.label,
      betterLabel: better ? `"${better.label}"` : undefined,
      betterCost: better ? monthlyCost(better.architecture) : undefined,
      afterExplanation:
        verdictResult.code === "DID_NOT_FIX"
          ? explainDiagnosis(diagnose(verdictResult.after, slo), verdictResult.after, { slo, maxRps: load.max })
          : undefined,
    });
  }, [verdictResult, chosenOption, stage.options, slo, load.max]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="max-w-3xl">
        <Link href="/" className="text-sm text-sky-700 underline-offset-4 hover:underline dark:text-sky-400">
          ← All scenarios
        </Link>
        <p className="mt-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">Scenario {scenario.number}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{scenario.title}</h1>
        {scenario.intro.map((p) => (
          <p key={p} className="mt-3 leading-7 text-zinc-600 dark:text-zinc-400">
            {p}
          </p>
        ))}
      </header>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <section className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 lg:col-span-2 dark:border-zinc-800 dark:bg-zinc-900">
          {chosen && chosenOption ? (
            <div role="tablist" aria-label="Diagram view" className="mb-2 inline-flex rounded-lg bg-zinc-100 p-1 text-sm dark:bg-zinc-800">
              {(["before", "after"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => store.setView(v)}
                  className={`rounded-md px-3 py-1 ${view === v ? "bg-white font-medium shadow-sm dark:bg-zinc-700" : "text-zinc-600 dark:text-zinc-400"}`}
                >
                  {v === "before" ? "Current setup" : `After: ${chosenOption.label}`}
                </button>
              ))}
            </div>
          ) : (
            <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Current setup: {scenario.baseline.label}</p>
          )}
          <ArchitectureDiagram architecture={shown.candidate.architecture} result={shown.result} />
          <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <LoadSlider
              value={rps}
              min={load.min}
              max={load.max}
              step={load.step}
              saturationPoint={shown.sat}
              onChange={store.setRps}
            />
          </div>
          <div className="mt-6">
            <LiveMetrics result={shown.result} slo={slo} />
          </div>
          <div className="mt-3">
            <KindLegend />
          </div>
        </section>

        <div className="space-y-4">
          <ExplanationCard
            testId="diagnosis"
            eyebrow={view === "after" && chosenOption ? `Diagnosis after: ${chosenOption.label}` : "Diagnosis: current setup"}
            explanation={diagnosisText}
          />
          <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">This scenario teaches</p>
            <p className="mt-1 text-zinc-700 dark:text-zinc-300">{scenario.teaches}</p>
          </section>
        </div>
      </div>

      <div className="mt-8">
        <FixOptions stage={stage} baseline={baseline.architecture} chosen={chosenId} onChoose={store.choose} />
      </div>

      {verdictResult && verdictText && chosenOption && after && (
        <div className="mt-4 space-y-4">
          <ExplanationCard testId="verdict" eyebrow={`Verdict at ${verdictResult.before.rps} rps`} explanation={verdictText} stale={settledRps !== rps}>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              The verdict changes with load. Move the slider to see when this fix becomes worth it.
            </p>
          </ExplanationCard>
          <Comparison before={before} after={after} afterLabel={chosenOption.label} />
        </div>
      )}

      <div className="mt-4">
        <LatencyChart
          before={baseline}
          after={chosen}
          afterLabel={chosenOption?.label}
          load={rps}
          min={load.min}
          max={load.max}
          slo={slo}
        />
      </div>

      <div className="mt-4">
        <AssumptionsPanel assumptions={baseline.assumptions} slo={slo} />
      </div>
    </div>
  );
}
