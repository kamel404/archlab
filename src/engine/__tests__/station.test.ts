import { describe, expect, it } from "vitest";
import { capacityFromTimeout, solveStation } from "../model/station";
import { EXACT, expectRel, ms } from "./helpers";

describe("capacityFromTimeout (MODEL.md §2.1)", () => {
  it("adds T·c/S queue slots, unfloored", () => {
    expect(capacityFromTimeout(2, 0.01, 1)).toBeCloseTo(202, 9);
    expect(capacityFromTimeout(16, 0.03, 1)).toBeCloseTo(16 + 16 / 0.03, 9);
  });
  it("keeps at least one slot and caps at 2000", () => {
    expect(capacityFromTimeout(1, 10, 1)).toBe(2);
    expect(capacityFromTimeout(2, 0.0005, 1)).toBe(2002);
  });
  it("a fractional K interpolates between its neighbours", () => {
    const at = (capacity: number) => solveStation({ arrivalRate: 200, serviceTime: ms(10), servers: 1, capacity });
    expectRel(at(3.25).blocking, at(3).blocking + 0.25 * (at(4).blocking - at(3).blocking), 1e-12);
  });
});

describe("solveStation: hand-checkable cases (MODEL.md §13.1)", () => {
  it("T1: M/M/1/4 at λ = μ has uniform states", () => {
    const s = solveStation({ arrivalRate: 100, serviceTime: ms(10), servers: 1, capacity: 4 });
    expectRel(s.blocking, 0.2, EXACT);
    expectRel(s.throughput, 80, EXACT);
    expectRel(s.meanInSystem, 2, EXACT);
    expectRel(s.meanResponse, ms(25), EXACT);
    expectRel(s.utilization, 0.8, EXACT);
  });

  it("T2: M/M/1/3 at ρ = 2", () => {
    const s = solveStation({ arrivalRate: 200, serviceTime: ms(10), servers: 1, capacity: 3 });
    expectRel(s.blocking, 8 / 15, EXACT);
    expectRel(s.throughput, (200 * 7) / 15, EXACT);
    expectRel(s.meanInSystem, 34 / 15, EXACT);
    expectRel(s.meanResponse, ms(24.286), EXACT);
    expectRel(s.utilization, 14 / 15, EXACT);
  });

  it("T3: M/M/2 at ρ = 0.75 matches Erlang C and the analytic P95", () => {
    const s = solveStation({ arrivalRate: 150, serviceTime: ms(10), servers: 2, capacity: 202 });
    expectRel(s.waitProbability, 0.642857, EXACT);
    expectRel(s.meanWait, ms(12.857), EXACT);
    expectRel(s.meanResponse, ms(22.857), EXACT);
    // Solve 1.285714·e^{−50t} − 0.285714·e^{−100t} = 0.05 by bisection, independently of the engine.
    const tail = (t: number) => (9 / 7) * Math.exp(-50 * t) - (2 / 7) * Math.exp(-100 * t);
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (tail(mid) > 0.05) lo = mid;
      else hi = mid;
    }
    expectRel(s.p95Response(), hi, EXACT);
    expectRel(s.p95Response(), ms(64.77), EXACT);
  });

  it("T4: M/M/1 P95 is ln(20)/(μ − λ)", () => {
    const s = solveStation({ arrivalRate: 50, serviceTime: ms(10), servers: 1, capacity: capacityFromTimeout(1, ms(10), 1) });
    expectRel(s.meanResponse, ms(20), EXACT);
    expectRel(s.p95Response(), Math.log(20) / 50, EXACT);
  });

  it("T5: M/M/2 in overload rejects the excess instead of waiting forever", () => {
    const s = solveStation({ arrivalRate: 250, serviceTime: ms(10), servers: 2, capacity: 202 });
    expectRel(s.blocking, 0.2, EXACT);
    expectRel(s.throughput, 200, EXACT);
    expectRel(s.utilization, 1, EXACT);
    expectRel(s.meanResponse, ms(990), EXACT);
    expect(Number.isFinite(s.p95Response())).toBe(true);
  });

  it("does not lose precision where the closed-form P95 does", () => {
    // The difference formula gave 91.6 ms and 125.9 ms here (MODEL.md §2.4).
    const s = solveStation({ arrivalRate: 150, serviceTime: ms(10), servers: 2, capacity: 202 });
    expect(s.p95Response()).toBeLessThan(ms(70));
  });

  it("survives very high load without overflow", () => {
    const s = solveStation({ arrivalRate: 1e6, serviceTime: ms(10), servers: 16, capacity: 2016 });
    expect(Number.isFinite(s.blocking)).toBe(true);
    expectRel(s.throughput, 1600, EXACT);
  });

  it("handles zero load", () => {
    const s = solveStation({ arrivalRate: 0, serviceTime: ms(10), servers: 2, capacity: 202 });
    expect(s.blocking).toBe(0);
    expect(s.meanResponse).toBe(ms(10));
    expect(s.p95Wait()).toBe(0);
  });
});

describe("station invariants (MODEL.md §13.6)", () => {
  const cases = [
    { arrivalRate: 10, serviceTime: 0.01, servers: 1, capacity: 50 },
    { arrivalRate: 190, serviceTime: 0.01, servers: 2, capacity: 202 },
    { arrivalRate: 500, serviceTime: 0.05, servers: 16, capacity: 336 },
    { arrivalRate: 3000, serviceTime: 0.004, servers: 2, capacity: 502 },
  ];
  it.each(cases)("bounds and Little's law hold for %o", (input) => {
    const s = solveStation(input);
    expect(s.blocking).toBeGreaterThanOrEqual(0);
    expect(s.blocking).toBeLessThanOrEqual(1);
    expect(s.utilization).toBeLessThanOrEqual(1 + 1e-12);
    expect(s.throughput).toBeLessThanOrEqual(input.arrivalRate);
    expectRel(s.meanInSystem, s.throughput * s.meanResponse, 1e-9);
    expect(s.p95Response()).toBeGreaterThanOrEqual(s.p95Wait());
  });
});
