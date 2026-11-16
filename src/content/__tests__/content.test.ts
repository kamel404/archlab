import { describe, expect, it } from "vitest";
import { diagnose, simulate, verdict, DEFAULT_ASSUMPTIONS, DEFAULT_SLO, type Architecture } from "@/engine";
import { DIAGNOSIS_CODES, explainDiagnosis } from "@/content/diagnosis";
import { VERDICT_CODES, explainVerdict } from "@/content/verdict";
import { formatMs, formatPercent, formatSignedUsd } from "@/content/format";

const small: Architecture = { app: { size: "small", count: 1 }, db: { size: "small", replicas: 0 }, cache: false };
const ctx = { slo: DEFAULT_SLO, maxRps: 400 };

describe("content coverage", () => {
  it("has text for every diagnosis and verdict code", () => {
    expect(DIAGNOSIS_CODES.sort()).toEqual(
      ["APPROACHING_LIMIT", "CACHE_BOUND", "CPU_BOUND", "DB_BOUND", "HEALTHY", "INLINE_SLOW_WORK", "JOB_BACKLOG_GROWING", "WORKER_POOL_EXHAUSTED"].sort(),
    );
    expect(VERDICT_CODES.sort()).toEqual(["CHEAPER_FIX_EXISTS", "DID_NOT_FIX", "NOT_NEEDED_YET", "WORTH_IT"].sort());
  });
});

describe("diagnosis text", () => {
  it("states headroom when healthy", () => {
    const r = simulate(small, DEFAULT_ASSUMPTIONS, 50);
    const text = explainDiagnosis(diagnose(r, DEFAULT_SLO, 186), r, ctx);
    expect(text.tone).toBe("good");
    expect(text.body).toContain("186 rps");
    expect(text.body).toContain("3.7×");
  });

  it("says the server is full and how many requests fail in overload", () => {
    const r = simulate(small, DEFAULT_ASSUMPTIONS, 250);
    const text = explainDiagnosis(diagnose(r, DEFAULT_SLO), r, ctx);
    expect(text.headline).toBe("The app server is full");
    expect(text.body).toContain("25%");
  });

  it("matches the MODEL.md §7 DB_BOUND example", () => {
    const r = simulate(small, { ...DEFAULT_ASSUMPTIONS, dbReadTime: 0.04 }, 45);
    const d = diagnose(r, DEFAULT_SLO);
    expect(d.code).toBe("DB_BOUND");
    expect(explainDiagnosis(d, r, ctx).body).toMatch(/78% idle.*92% of their time/);
  });
});

describe("verdict text", () => {
  const medium: Architecture = { ...small, app: { size: "medium", count: 1 } };
  const options = [{ id: "m", architecture: medium, assumptions: DEFAULT_ASSUMPTIONS }];
  const before = { architecture: small, assumptions: DEFAULT_ASSUMPTIONS };

  it("explains not-needed-yet with the cost of the change", () => {
    const v = verdict(before, "m", options, 100, DEFAULT_SLO, 400);
    const text = explainVerdict(v, { ...ctx, optionLabel: "Bigger server" });
    expect(text.headline).toBe("You did not need this yet");
    expect(text.body).toContain("+$20/month");
  });

  it("explains worth-it with before and after numbers", () => {
    const v = verdict(before, "m", options, 250, DEFAULT_SLO, 400);
    const text = explainVerdict(v, { ...ctx, optionLabel: "Bigger server" });
    expect(text.tone).toBe("good");
    expect(text.body).toContain("cheapest option");
  });
});

describe("format", () => {
  it("formats engine units for display", () => {
    expect(formatMs(0.0278)).toBe("27.8 ms");
    expect(formatMs(1.069)).toBe("1.07 s");
    expect(formatPercent(0.2515)).toBe("25%");
    expect(formatPercent(0.0005)).toBe("<0.1%");
    expect(formatSignedUsd(-20)).toBe("−$20");
  });
});
