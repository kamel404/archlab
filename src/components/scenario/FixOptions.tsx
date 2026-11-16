"use client";

import { complexityPoints, monthlyCost, type Architecture } from "@/engine";
import { complexityPhrase, formatSignedUsd } from "@/content/format";
import type { Stage } from "@/scenarios";

export function FixOptions({
  stage,
  baseline,
  chosen,
  onChoose,
}: {
  stage: Stage;
  baseline: Architecture;
  chosen: string | null;
  onChoose: (id: string | null) => void;
}) {
  const baseCost = monthlyCost(baseline);
  const baseComplexity = complexityPoints(baseline);
  return (
    <section aria-labelledby="fix-heading">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="fix-heading" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {stage.prompt}
        </h2>
        {chosen && (
          <button
            type="button"
            onClick={() => onChoose(null)}
            className="text-sm text-sky-700 underline-offset-4 hover:underline dark:text-sky-400"
          >
            Back to the current setup
          </button>
        )}
      </div>
      {stage.hint && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{stage.hint}</p>}
      <div role="radiogroup" aria-labelledby="fix-heading" className="mt-3 grid gap-3 sm:grid-cols-3">
        {stage.options.map((option) => {
          const selected = option.id === chosen;
          const cost = monthlyCost(option.architecture) - baseCost;
          const complexity = complexityPoints(option.architecture) - baseComplexity;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChoose(option.id)}
              className={`flex flex-col rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-sky-600 ${
                selected
                  ? "border-sky-600 bg-sky-50 ring-1 ring-sky-600 dark:bg-sky-950/40"
                  : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
              }`}
            >
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{option.label}</span>
              <span className="mt-1 flex-1 text-sm text-zinc-600 dark:text-zinc-400">{option.summary}</span>
              <span className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="underline decoration-dotted underline-offset-4" title="Estimate: fictional prices">
                  {formatSignedUsd(cost)}/month
                </span>{" "}
                · {complexityPhrase(complexity)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
