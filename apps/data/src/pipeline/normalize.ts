import type { SourceForecastPoint } from "@rainwatch/domain";

/**
 * SPEC §27 — pure. Canonicalize raw points before fusion:
 * sort by time, drop unparseable timestamps, clamp negatives, dedupe by epoch.
 * Does not mutate input.
 */
export function normalizePrecipitation(points: SourceForecastPoint[]): SourceForecastPoint[] {
  const parsed = points
    .map((p) => ({ point: p, ms: Date.parse(p.timestamp) }))
    .filter((p) => Number.isFinite(p.ms));
  parsed.sort((a, b) => a.ms - b.ms);

  const byEpoch = new Map<number, SourceForecastPoint>();
  for (const { point, ms } of parsed) {
    byEpoch.set(ms, {
      timestamp: point.timestamp,
      precipitationMmPerHour: Math.max(0, point.precipitationMmPerHour),
    });
  }
  return [...byEpoch.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}
