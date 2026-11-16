import { describe, expect, it } from "vitest";
import { estimateLoad } from "../check";
import { diagnose } from "../diagnose";
import { simulateJobQueue } from "../model/fluid";
import { DEFAULT_SLO } from "../model/types";
import { cpuTimePerRequest, simulate } from "../simulate";
import { arch, assume, EXACT, expectRel, ms, NETWORK } from "./helpers";

describe("Scenario 3: job queue fluid model (MODEL.md §13.4)", () => {
  it("under-provisioned workers: backlog grows 1 job/s, then drains in 100 s", () => {
    const r = simulateJobQueue({
      slots: 2,
      jobTime: 0.5,
      segments: [
        { jobRate: 5, durationS: 300 },
        { jobRate: 1, durationS: 200 },
      ],
      backlogThreshold: 100,
    });
    expect(r.capacity).toBe(4);
    expect(r.series[300].backlog).toBeCloseTo(300, 9);
    expect(r.series[300].delay).toBeCloseTo(75.5, 9);
    expect(r.peakBacklog).toBeCloseTo(300, 9);
    expect(r.timeToThreshold).toBe(101);
    expect(r.drainTime).toBe(100);
  });

  it("two worker instances keep up", () => {
    const r = simulateJobQueue({ slots: 4, jobTime: 0.5, segments: [{ jobRate: 5, durationS: 300 }] });
    expect(r.peakBacklog).toBe(0);
    expect(r.drainTime).toBeNull();
    expect(r.peakDelay).toBeGreaterThan(0.5); // M/M/4 wait on top of the job itself
  });
});

describe("Scenario 3: inline vs queued request path (MODEL.md §13.4)", () => {
  const a = assume({ slowFraction: 0.05 });

  it("inline slow work overloads the CPU", () => {
    const inline = arch({ jobs: { mode: "inline" } });
    expectRel(cpuTimePerRequest(inline, a), ms(34.5), EXACT);
    const r = simulate(inline, a, 100);
    expectRel(r.stations.find((s) => s.id === "cpu")!.demand, 1.725, EXACT);
    expect(diagnose(r, DEFAULT_SLO).code).toBe("INLINE_SLOW_WORK");
  });

  it("queuing the work frees the CPU but one worker instance falls behind", () => {
    const queued = arch({ jobs: { mode: "queued", workerInstances: 1 } });
    expectRel(cpuTimePerRequest(queued, a), ms(10.1), EXACT);
    const r = simulate(queued, a, 100);
    expectRel(r.stations.find((s) => s.id === "cpu")!.demand, 0.505, EXACT);
    expect(r.jobs).toEqual({ arrivalRate: 5, capacity: 4, growthRate: 1 });
    expect(diagnose(r, DEFAULT_SLO).code).toBe("JOB_BACKLOG_GROWING");
  });
});

describe("Check My App (MODEL.md §13.5)", () => {
  it("500 daily users is about 3 rps at peak", () => {
    const e = estimateLoad({ dailyActiveUsers: 500 });
    expectRel(e.averageRps, 0.2894, EXACT);
    expectRel(e.peakRps, 2.894, EXACT);
    expectRel(185 / e.peakRps, 64, NETWORK * 2);
  });

  it("uses the user's own numbers when given", () => {
    expect(estimateLoad({ dailyActiveUsers: 86_400, requestsPerUserPerDay: 1, peakFactor: 3 }).peakRps).toBe(3);
  });
});
