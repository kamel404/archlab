/**
 * Scenario 1 as data, run through the engine: the verdicts users see must match
 * MODEL.md §13.2.
 */
import { describe, expect, it } from "vitest";
import { saturationPoint, verdict } from "@/engine";
import { baselineCandidate, getScenario, optionCandidates, SCENARIOS } from "@/scenarios";
import { ScenarioSchema } from "@/scenarios/schema";

const scenario = getScenario("one-server")!;
const stage = scenario.stages[0];
const baseline = baselineCandidate(scenario);
const options = optionCandidates(scenario, stage);
const verdictAt = (id: string, rps: number) => verdict(baseline, id, options, rps, scenario.slo, scenario.load.max);

describe("scenario registry", () => {
  it("validates every scenario and has unique slugs", () => {
    for (const s of SCENARIOS) expect(() => ScenarioSchema.parse(s)).not.toThrow();
    expect(new Set(SCENARIOS.map((s) => s.slug)).size).toBe(SCENARIOS.length);
  });

  it("rejects malformed scenarios", () => {
    const bad = (patch: object) => ScenarioSchema.safeParse({ ...scenario, ...patch }).success;
    expect(bad({ load: { min: 10, max: 400, step: 5, initial: 500 } })).toBe(false);
    expect(bad({ assumptions: { cpuTim: 0.01 } })).toBe(false);
    expect(bad({ stages: [{ ...stage, options: [stage.options[0], stage.options[0]] }] })).toBe(false);
    expect(bad({ stages: [{ ...stage, options: [stage.options[0]] }] })).toBe(false);
  });
});

describe("Scenario 1: One Server Is Enough", () => {
  it("baseline breaks at about 185 rps, inside the slider range", () => {
    const sat = saturationPoint(baseline, scenario.slo, scenario.load.max)!;
    expect(Math.abs(sat - 185)).toBeLessThanOrEqual(1);
    expect(scenario.load.initial).toBeLessThan(sat);
  });

  it("at 250 rps the bigger server is worth it and the others are cheaper-fix-exists", () => {
    expect(verdictAt("medium-server", 250).code).toBe("WORTH_IT");
    const two = verdictAt("two-servers", 250);
    expect(two.code).toBe("CHEAPER_FIX_EXISTS");
    expect(two.betterOption).toBe("medium-server");
    expect(verdictAt("large-server", 250).code).toBe("CHEAPER_FIX_EXISTS");
  });

  it("at 150 rps every option is not needed yet", () => {
    for (const o of options) {
      const v = verdictAt(o.id, 150);
      expect(v.code).toBe("NOT_NEEDED_YET");
      expect(Math.abs(v.saturationPoint! - 185)).toBeLessThanOrEqual(1);
    }
  });

  it("near the top of the range some fixes stop being enough", () => {
    // 2 × small + LB saturates at about 367 rps, medium at about 383 (MODEL.md §13.2).
    expect(verdictAt("two-servers", 375).code).toBe("DID_NOT_FIX");
    expect(verdictAt("medium-server", 375).code).toBe("WORTH_IT");
  });
});
