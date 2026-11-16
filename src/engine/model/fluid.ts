/**
 * Time-stepped fluid model for a job queue. MODEL.md §6.2.
 */
import { capacityFromTimeout, solveStation } from "./station";

export interface LoadSegment {
  /** Jobs per second during this segment. */
  jobRate: number;
  durationS: number;
}

export interface JobQueueInput {
  /** Parallel job slots (instances × slots per instance). */
  slots: number;
  /** Seconds per job. */
  jobTime: number;
  segments: LoadSegment[];
  /** Step size (s). Default 1. */
  dt?: number;
  /** Backlog size to report "time until backlog passes X" for. */
  backlogThreshold?: number;
}

export interface JobQueuePoint {
  t: number;
  backlog: number;
  /** Delay a job joining at time t can expect (s). */
  delay: number;
}

export interface JobQueueResult {
  capacity: number;
  series: JobQueuePoint[];
  peakBacklog: number;
  peakDelay: number;
  /** First t where backlog > threshold, or null. */
  timeToThreshold: number | null;
  /**
   * Seconds from the end of the last segment where jobs arrive faster than capacity
   * until the backlog is empty. null if there was no backlog or it never drains.
   */
  drainTime: number | null;
}

export function simulateJobQueue(input: JobQueueInput): JobQueueResult {
  const dt = input.dt ?? 1;
  const capacity = input.slots / input.jobTime;

  const delayAt = (backlog: number, jobRate: number) => {
    if (backlog > 0) return backlog / capacity + input.jobTime;
    if (jobRate <= 0) return input.jobTime;
    if (jobRate >= capacity) return input.jobTime; // backlog starts growing next step
    // Stable and empty: M/M/c mean response with an effectively unlimited queue.
    return solveStation({
      arrivalRate: jobRate,
      serviceTime: input.jobTime,
      servers: input.slots,
      capacity: capacityFromTimeout(input.slots, input.jobTime, Infinity),
    }).meanResponse;
  };

  const series: JobQueuePoint[] = [];
  let t = 0;
  let backlog = 0;
  let timeToThreshold: number | null = null;
  let lastOverloadEnd: number | null = null;
  let drainTime: number | null = null;
  series.push({ t, backlog, delay: delayAt(0, input.segments[0]?.jobRate ?? 0) });

  for (const seg of input.segments) {
    const steps = Math.round(seg.durationS / dt);
    if (seg.jobRate > capacity) {
      lastOverloadEnd = null;
      drainTime = null;
    }
    for (let i = 0; i < steps; i++) {
      const available = backlog + seg.jobRate * dt;
      const processed = Math.min(available, capacity * dt);
      backlog = available - processed;
      if (backlog < 1e-9) backlog = 0;
      t += dt;
      series.push({ t, backlog, delay: delayAt(backlog, seg.jobRate) });
      if (timeToThreshold === null && input.backlogThreshold !== undefined && backlog > input.backlogThreshold) {
        timeToThreshold = t;
      }
      if (lastOverloadEnd !== null && drainTime === null && backlog === 0) drainTime = t - lastOverloadEnd;
    }
    if (seg.jobRate > capacity) lastOverloadEnd = t;
  }

  let peakBacklog = 0;
  let peakDelay = 0;
  for (const p of series) {
    if (p.backlog > peakBacklog) peakBacklog = p.backlog;
    if (p.delay > peakDelay) peakDelay = p.delay;
  }
  return { capacity, series, peakBacklog, peakDelay, timeToThreshold, drainTime };
}
