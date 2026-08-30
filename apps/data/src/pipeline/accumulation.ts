import type { ForecastPoint, SourceForecastPoint } from "@rainwatch/domain";

/**
 * SPEC §27 — pure. Accumulation (mm) over [fromEpochMs, untilEpochMs].
 * Trapezoid-style: each point covers half the gap to its neighbors; boundary
 * contributions are clipped proportionally to the overlap.
 */
export function calculateAccumulation(
  points: SourceForecastPoint[],
  fromEpochMs: number,
  untilEpochMs: number,
): number {
  if (untilEpochMs <= fromEpochMs) return 0;
  const pts = points
    .map((p) => ({ ms: Date.parse(p.timestamp), value: p.precipitationMmPerHour }))
    .filter((p) => Number.isFinite(p.ms))
    .sort((a, b) => a.ms - b.ms);
  if (pts.length === 0) return 0;
  // Single point: treat as constant over the whole window.
  if (pts.length === 1) {
    return (pts[0]!.value * (untilEpochMs - fromEpochMs)) / 3_600_000;
  }

  let total = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    if (p === undefined) continue;
    const prev = pts[i - 1]?.ms;
    const next = pts[i + 1]?.ms;
    // half-gap on each side; edges use the one-sided gap
    const left = prev === undefined ? (next === undefined ? 0 : next - p.ms) : p.ms - prev;
    const right = next === undefined ? (prev === undefined ? 0 : p.ms - prev) : next - p.ms;
    const halfLeft = left / 2;
    const halfRight = right / 2;
    const start = Math.max(fromEpochMs, p.ms - halfLeft);
    const end = Math.min(untilEpochMs, p.ms + halfRight);
    if (end > start) total += (p.value * (end - start)) / 3_600_000;
  }
  return total;
}
