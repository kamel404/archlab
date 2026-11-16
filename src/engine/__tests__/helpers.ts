import { expect } from "vitest";
import { DEFAULT_ASSUMPTIONS, type Architecture, type Assumptions } from "../model/types";

/** Station values are exact for the model (MODEL.md §13). */
export const EXACT = 1e-3;
/** Architecture values depend on bisection (MODEL.md §13). */
export const NETWORK = 1e-2;

export function expectRel(actual: number, expected: number, tolerance: number, label = "") {
  const err = expected === 0 ? Math.abs(actual) : Math.abs(actual - expected) / Math.abs(expected);
  expect(err, `${label} expected ${expected}, got ${actual}`).toBeLessThanOrEqual(tolerance);
}

export const ms = (x: number) => x / 1000;

export const arch = (overrides: Partial<Architecture> = {}): Architecture => ({
  app: { size: "small", count: 1 },
  db: { size: "small", replicas: 0 },
  cache: false,
  ...overrides,
});

export const assume = (overrides: Partial<Assumptions> = {}): Assumptions => ({
  ...DEFAULT_ASSUMPTIONS,
  ...overrides,
});
