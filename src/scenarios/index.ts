import { DEFAULT_ASSUMPTIONS, type Assumptions, type Candidate } from "@/engine";
import { oneServer } from "./one-server";
import { ScenarioSchema, type FixOption, type Scenario, type Stage } from "./schema";

export type { FixOption, Scenario, Stage } from "./schema";

/** Every published scenario, validated once at module load. */
export const SCENARIOS: readonly Scenario[] = [oneServer].map((s) => ScenarioSchema.parse(s));

export function getScenario(slug: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.slug === slug);
}

export function scenarioAssumptions(scenario: Scenario, option?: FixOption): Assumptions {
  return { ...DEFAULT_ASSUMPTIONS, ...scenario.assumptions, ...option?.assumptions };
}

export function baselineCandidate(scenario: Scenario): Candidate {
  return { id: "baseline", architecture: scenario.baseline.architecture, assumptions: scenarioAssumptions(scenario) };
}

export function optionCandidates(scenario: Scenario, stage: Stage): Candidate[] {
  return stage.options.map((o) => ({
    id: o.id,
    architecture: o.architecture,
    assumptions: scenarioAssumptions(scenario, o),
  }));
}
