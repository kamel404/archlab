/**
 * "Check My App" load estimate. MODEL.md §10. Every input is editable in the UI.
 */

export interface CheckInput {
  dailyActiveUsers: number;
  requestsPerUserPerDay?: number;
  peakFactor?: number;
}

export const CHECK_DEFAULTS = { requestsPerUserPerDay: 50, peakFactor: 10 } as const;

export interface CheckEstimate {
  averageRps: number;
  peakRps: number;
  requestsPerUserPerDay: number;
  peakFactor: number;
}

export function estimateLoad(input: CheckInput): CheckEstimate {
  const requestsPerUserPerDay = input.requestsPerUserPerDay ?? CHECK_DEFAULTS.requestsPerUserPerDay;
  const peakFactor = input.peakFactor ?? CHECK_DEFAULTS.peakFactor;
  const averageRps = (input.dailyActiveUsers * requestsPerUserPerDay) / 86_400;
  return { averageRps, peakRps: averageRps * peakFactor, requestsPerUserPerDay, peakFactor };
}
