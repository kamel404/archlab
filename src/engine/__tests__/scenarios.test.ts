import { describe, expect, it } from "vitest";
import { diagnose } from "../diagnose";
import { DEFAULT_SLO, type Assumptions } from "../model/types";
import { missesSlo, simulate } from "../simulate";
import { saturationPoint, verdict, type Candidate } from "../verdict";
import { arch, assume, expectRel, ms, NETWORK } from "./helpers";

const util = (r: ReturnType<typeof simulate>, id: string) => r.stations.find((s) => s.id === id)!.utilization;

describe("Scenario 1: One Server Is Enough (MODEL.md §13.2)", () => {
  const a = assume();
  const small = { architecture: arch(), assumptions: a };
  const options: Candidate[] = [
    { id: "medium", architecture: arch({ app: { size: "medium", count: 1 } }), assumptions: a },
    { id: "two-small-lb", architecture: arch({ app: { size: "small", count: 2 } }), assumptions: a },
  ];

  it("small server at 150 rps is comfortable", () => {
    const r = simulate(small.architecture, a, 150);
    expectRel(util(r, "cpu"), 0.75, NETWORK);
    expectRel(util(r, "db-primary"), 0.33, NETWORK);
    expectRel(r.holdTime, ms(27.8), NETWORK);
    expectRel(r.meanLatency, ms(27.8), NETWORK);
    expectRel(r.p95Latency, ms(79.2), NETWORK);
    expect(r.errorRate).toBeLessThan(1e-9);
  });

  it("small server at 180 rps is close to the edge", () => {
    const r = simulate(small.architecture, a, 180);
    expectRel(util(r, "cpu"), 0.9, NETWORK);
    expectRel(r.meanLatency, ms(58.65), NETWORK);
    expectRel(r.p95Latency, ms(172.6), NETWORK);
  });

  it("small server at 250 rps saturates the worker pool and drops a quarter of requests", () => {
    const r = simulate(small.architecture, a, 250);
    expectRel(util(r, "workers"), 1, NETWORK);
    expectRel(util(r, "cpu"), 0.936, NETWORK);
    expectRel(r.throughput, 187.1, NETWORK);
    expectRel(r.errorRate, 0.2515, NETWORK);
    expectRel(r.meanLatency, ms(1069), NETWORK);
    const d = diagnose(r, DEFAULT_SLO);
    expect(d.code).toBe("WORKER_POOL_EXHAUSTED");
    expect(d.dominant.sink).toBe("cpu");
  });

  it("medium server at 250 rps", () => {
    const r = simulate(options[0].architecture, a, 250);
    expectRel(util(r, "cpu"), 0.625, NETWORK);
    expectRel(r.meanLatency, ms(18.44), NETWORK);
    expectRel(r.p95Latency, ms(52.1), NETWORK);
  });

  it("two small servers behind a load balancer at 250 rps share one database", () => {
    const r = simulate(options[1].architecture, a, 250);
    expectRel(util(r, "cpu"), 0.625, NETWORK);
    expectRel(util(r, "db-primary"), 0.55, NETWORK);
    expectRel(r.meanLatency, ms(22.97), NETWORK);
    expectRel(r.p95Latency, ms(65.2), NETWORK);
  });

  it("saturation points", () => {
    const near = (actual: number | null, expected: number) => expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(1);
    near(saturationPoint(small, DEFAULT_SLO, 1000), 185.23);
    near(saturationPoint(options[0], DEFAULT_SLO, 1000), 382.89);
    near(saturationPoint(options[1], DEFAULT_SLO, 1000), 367.03);
  });

  it("verdict at 250 rps: bigger server is worth it, horizontal works but costs more", () => {
    expect(verdict(small, "medium", options, 250, DEFAULT_SLO, 1000).code).toBe("WORTH_IT");
    const v = verdict(small, "two-small-lb", options, 250, DEFAULT_SLO, 1000);
    expect(v.code).toBe("CHEAPER_FIX_EXISTS");
    expect(v.betterOption).toBe("medium");
    expect(v.after.cost - v.before.cost).toBe(40);
    expect(v.after.complexity).toBe(1);
  });

  it("verdict at 150 rps: not needed yet, with the load at which it would be", () => {
    for (const o of options) {
      const v = verdict(small, o.id, options, 150, DEFAULT_SLO, 1000);
      expect(v.code).toBe("NOT_NEEDED_YET");
      expect(Math.abs(v.saturationPoint! - 185.23)).toBeLessThanOrEqual(1);
    }
  });
});

describe("Scenario 2: The Database Bottleneck (MODEL.md §13.3)", () => {
  const slow: Assumptions = assume({ dbReadTime: ms(40) });
  const before = { architecture: arch(), assumptions: slow };
  const options: Candidate[] = [
    { id: "cache", architecture: arch({ cache: true }), assumptions: slow },
    { id: "replica", architecture: arch({ db: { size: "small", replicas: 1 } }), assumptions: slow },
    { id: "query-optimization", architecture: arch(), assumptions: assume() },
    { id: "two-small-lb", architecture: arch({ app: { size: "small", count: 2 } }), assumptions: slow },
    { id: "medium-app", architecture: arch({ app: { size: "medium", count: 1 } }), assumptions: slow },
  ];
  const get = (id: string) => options.find((o) => o.id === id)!;

  it("baseline at 45 rps: CPU idle, requests waiting on the database", () => {
    const r = simulate(before.architecture, slow, 45);
    expectRel(util(r, "cpu"), 0.225, NETWORK);
    expectRel(util(r, "db-primary"), 0.828, NETWORK);
    expectRel(r.stations.find((s) => s.id === "db-primary")!.meanResponse, ms(117.0), NETWORK);
    expectRel(r.meanLatency, ms(127.55), NETWORK);
    expectRel(r.p95Latency, ms(365.8), NETWORK);
    expect(missesSlo(r, DEFAULT_SLO)).toBe(true);
    const d = diagnose(r, DEFAULT_SLO);
    expect(d.code).toBe("DB_BOUND");
    expectRel(d.dominant.share, 0.92, NETWORK);
    expectRel(d.cpuUtilization, 0.225, NETWORK);
  });

  it("baseline saturation point", () => {
    expect(Math.abs(saturationPoint(before, DEFAULT_SLO, 200)! - 42.73)).toBeLessThanOrEqual(1);
  });

  it("each fix at 45 rps", () => {
    const cache = simulate(get("cache").architecture, slow, 45);
    expectRel(util(cache, "db-primary"), 0.18, NETWORK);
    expectRel(cache.meanLatency, ms(19.25), NETWORK);
    expectRel(cache.p95Latency, ms(120.2), NETWORK);

    const replica = simulate(get("replica").architecture, slow, 45);
    expectRel(util(replica, "db-primary"), 0.423, NETWORK);
    expectRel(util(replica, "db-replica"), 0.405, NETWORK);
    expectRel(replica.meanLatency, ms(54.96), NETWORK);
    expectRel(replica.p95Latency, ms(169.6), NETWORK);

    const opt = simulate(arch(), assume(), 45);
    expectRel(util(opt, "db-primary"), 0.099, NETWORK);
    expectRel(opt.meanLatency, ms(14.98), NETWORK);
    expectRel(opt.p95Latency, ms(44.4), NETWORK);

    const horizontal = simulate(get("two-small-lb").architecture, slow, 45);
    expectRel(util(horizontal, "db-primary"), 0.828, NETWORK);
    expectRel(horizontal.p95Latency, ms(365.7), NETWORK);

    const bigger = simulate(get("medium-app").architecture, slow, 45);
    expectRel(util(bigger, "db-primary"), 0.828, NETWORK);
    expectRel(bigger.p95Latency, ms(364.7), NETWORK);
  });

  it("verdicts: query optimization wins, more app servers do nothing", () => {
    const v = (id: string) => verdict(before, id, options, 45, DEFAULT_SLO, 200);
    expect(v("query-optimization").code).toBe("WORTH_IT");
    expect(v("cache").code).toBe("CHEAPER_FIX_EXISTS");
    expect(v("cache").betterOption).toBe("query-optimization");
    expect(v("replica").code).toBe("CHEAPER_FIX_EXISTS");
    expect(v("two-small-lb").code).toBe("DID_NOT_FIX");
    expect(v("medium-app").code).toBe("DID_NOT_FIX");
  });
});
