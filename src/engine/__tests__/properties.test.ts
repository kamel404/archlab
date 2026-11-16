import { describe, expect, it } from "vitest";
import { DEFAULT_SLO, type Architecture } from "../model/types";
import { missesSlo, simulate } from "../simulate";
import { arch, assume, ms } from "./helpers";

// MODEL.md §13.6: properties over architectures and loads 1–1000 rps.
const architectures: [string, Architecture][] = [
  ["small", arch()],
  ["medium", arch({ app: { size: "medium", count: 1 } })],
  ["3 small + LB + cache", arch({ app: { size: "small", count: 3 }, cache: true })],
  ["2 small + 2 replicas", arch({ app: { size: "small", count: 2 }, db: { size: "small", replicas: 2 } })],
];
const assumptionSets = [
  ["defaults", assume()],
  ["slow db", assume({ dbReadTime: ms(40) })],
] as const;
const loads = Array.from({ length: 50 }, (_, i) => 1 + i * 20);

describe.each(architectures)("properties: %s", (_, architecture) => {
  it.each(assumptionSets)("with %s assumptions", (__, a) => {
    let prev: ReturnType<typeof simulate> | null = null;
    let missedBefore = false;
    for (const rps of loads) {
      const r = simulate(architecture, a, rps);
      expect(r.errorRate).toBeGreaterThanOrEqual(0);
      expect(r.errorRate).toBeLessThanOrEqual(1);
      expect(r.throughput).toBeLessThanOrEqual(rps * (1 + 1e-12));
      for (const s of r.stations) {
        expect(s.utilization).toBeLessThanOrEqual(1 + 1e-9);
        expect(s.blocking).toBeGreaterThanOrEqual(0);
      }
      if (prev) {
        expect(r.meanLatency, `mean latency at ${rps}`).toBeGreaterThanOrEqual(prev.meanLatency * (1 - 1e-6));
        expect(r.errorRate, `error rate at ${rps}`).toBeGreaterThanOrEqual(prev.errorRate - 1e-9);
      }
      const missed = missesSlo(r, DEFAULT_SLO);
      expect(missedBefore && !missed, `SLO recovers at ${rps} after failing`).toBe(false);
      missedBefore ||= missed;
      prev = r;
    }
  });
});

describe("determinism", () => {
  it("same input gives an identical result", () => {
    const a = assume({ slowFraction: 0.05 });
    const x = arch({ app: { size: "small", count: 2 }, cache: true, jobs: { mode: "queued", workerInstances: 1 } });
    expect(simulate(x, a, 220)).toEqual(simulate(x, a, 220));
  });
});

describe.skipIf(process.env.CI)("performance budget (MODEL.md §13.7)", () => {
  it("one solve takes under one frame (16 ms)", () => {
    const a = assume({ dbReadTime: ms(40) });
    const x = arch({ app: { size: "small", count: 2 }, cache: true, db: { size: "small", replicas: 1 } });
    simulate(x, a, 45); // warm up the JIT
    const start = performance.now();
    for (let i = 0; i < 10; i++) simulate(x, a, 45 + i);
    expect((performance.now() - start) / 10).toBeLessThan(16);
  });
});
