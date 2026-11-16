/** Display formatting. The engine works in seconds and fractions; the UI shows ms and %. */

export function formatMs(seconds: number): string {
  const ms = seconds * 1000;
  if (ms >= 10_000) return `${(ms / 1000).toFixed(0)} s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 100) return `${ms.toFixed(0)} ms`;
  return `${ms.toFixed(1)} ms`;
}

export function formatPercent(fraction: number): string {
  const p = fraction * 100;
  if (p === 0) return "0%";
  if (p < 0.1) return "<0.1%";
  if (p < 10) return `${p.toFixed(1)}%`;
  return `${p.toFixed(0)}%`;
}

export function formatRps(rps: number): string {
  return `${rps < 10 ? rps.toFixed(1) : rps.toFixed(0)} rps`;
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(0)}`;
}

export function formatSignedUsd(usd: number): string {
  if (usd === 0) return "+$0";
  return `${usd > 0 ? "+" : "−"}$${Math.abs(usd).toFixed(0)}`;
}

export function complexityPhrase(points: number): string {
  if (points === 0) return "no added complexity";
  return `+${points} complexity point${points === 1 ? "" : "s"}`;
}
