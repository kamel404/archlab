/**
 * Scenario definitions are data. This schema validates them, so a typo in a
 * scenario file fails loudly instead of producing a silently wrong simulation.
 */
import { z } from "zod";
import type { Architecture, Assumptions, SLO } from "@/engine";

const Size = z.enum(["small", "medium", "large"]);
const fraction = z.number().min(0).max(1);
const seconds = z.number().positive();

export const ArchitectureSchema = z
  .object({
    app: z.object({ size: Size, count: z.number().int().min(1).max(8) }),
    db: z.object({ size: Size, replicas: z.number().int().min(0).max(4) }),
    cache: z.boolean(),
    jobs: z
      .discriminatedUnion("mode", [
        z.object({ mode: z.literal("inline") }),
        z.object({ mode: z.literal("queued"), workerInstances: z.number().int().min(1).max(20) }),
      ])
      .optional(),
  })
  .strict() satisfies z.ZodType<Architecture>;

/** Overrides of DEFAULT_ASSUMPTIONS. Strict, so a misspelled key is an error. */
export const AssumptionOverridesSchema = z
  .object({
    cpuTime: seconds,
    workersPerCore: z.number().int().min(1),
    dbReadTime: seconds,
    dbWriteTime: seconds,
    readFraction: fraction,
    cacheHitRate: fraction,
    cacheServiceTime: seconds,
    cacheCores: z.number().int().min(1),
    lbServiceTime: seconds,
    lbCores: z.number().int().min(1),
    queueTimeout: seconds,
    enqueueTime: seconds,
    slowFraction: fraction,
    jobTime: seconds,
    jobSlotsPerWorker: z.number().int().min(1),
  })
  .partial()
  .strict() satisfies z.ZodType<Partial<Assumptions>>;

const SloSchema = z.object({ p95: seconds, errorRate: fraction }) satisfies z.ZodType<SLO>;

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase-kebab-case");

export const FixOptionSchema = z.object({
  id: slug,
  label: z.string().min(1),
  summary: z.string().min(1),
  architecture: ArchitectureSchema,
  assumptions: AssumptionOverridesSchema.optional(),
});

export const StageSchema = z
  .object({
    id: slug,
    prompt: z.string().min(1),
    hint: z.string().optional(),
    options: z.array(FixOptionSchema).min(2).max(4),
  })
  .refine((s) => new Set(s.options.map((o) => o.id)).size === s.options.length, "option ids must be unique");

export const ScenarioSchema = z
  .object({
    slug,
    number: z.number().int().min(1),
    title: z.string().min(1),
    tagline: z.string().min(1),
    teaches: z.string().min(1),
    intro: z.array(z.string().min(1)).min(1),
    load: z.object({
      min: z.number().int().min(1),
      max: z.number().int().min(1),
      step: z.number().int().min(1),
      initial: z.number().int().min(1),
    }),
    slo: SloSchema,
    assumptions: AssumptionOverridesSchema,
    baseline: z.object({ label: z.string().min(1), architecture: ArchitectureSchema }),
    stages: z.array(StageSchema).min(1),
  })
  .refine((s) => s.load.min <= s.load.initial && s.load.initial <= s.load.max, "load.initial must be within [min, max]");

export type FixOption = z.infer<typeof FixOptionSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
