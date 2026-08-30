import type { ForecastPoint } from "@rainwatch/domain";
import { classifyIntensity, DEFAULT_INTENSITY_THRESHOLDS } from "@rainwatch/domain";
import type { RainEvent } from "@rainwatch/forecast-contract";

export interface EventConfig {
  /** wet threshold, mm/h (SPEC §12: 0.1) */
  minIntensityMmPerHour: number;
  /** minimum event duration, minutes (SPEC §12: 10) */
  minDurationMinutes: number;
  /** dry gaps shorter than this are merged, minutes (SPEC §12: 10) */
  mergeGapMinutes: number;
}

export const DEFAULT_EVENT_CONFIG: EventConfig = {
  minIntensityMmPerHour: 0.1,
  minDurationMinutes: 10,
  mergeGapMinutes: 10,
};

const CONF_RANK = { low: 0, medium: 1, high: 2 } as const;

/**
 * SPEC §12, §27 — pure. Convert consecutive precipitation points into semantic
 * rain events. Wet runs separated by dry gaps < mergeGapMinutes are merged;
 * merged events shorter than minDurationMinutes are dropped.
 */
export function extractRainEvents(
  points: ForecastPoint[],
  cfg: EventConfig = DEFAULT_EVENT_CONFIG,
): RainEvent[] {
  const pts = [...points].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (pts.length === 0) return [];

  const runs: Array<{ start: number; end: number; members: ForecastPoint[] }> = [];
  let current: ForecastPoint[] = [];
  for (const p of pts) {
    const wet = p.precipitationMmPerHour >= cfg.minIntensityMmPerHour;
    if (wet) {
      current.push(p);
      continue;
    }
    if (current.length > 0) {
      runs.push(makeRun(current));
      current = [];
    }
  }
  if (current.length > 0) {
    runs.push(makeRun(current));
  }
  if (runs.length === 0) return [];

  // Merge runs separated by a dry gap < mergeGapMinutes. Note run ends already
  // include one trailing step, so a 5-min dry gap between wet points reads as gap 0.
  const merged: typeof runs = [runs[0]!];
  for (let i = 1; i < runs.length; i += 1) {
    const run = runs[i];
    const prev = merged[merged.length - 1];
    if (run === undefined || prev === undefined) continue;
    const gapMin = (run.start - prev.end) / 60_000;
    if (gapMin < cfg.mergeGapMinutes) {
      merged[merged.length - 1] = {
        start: prev.start,
        end: run.end,
        members: [...prev.members, ...run.members],
      };
    } else {
      merged.push(run);
    }
  }

  const events: RainEvent[] = [];
  for (const m of merged) {
    const durationMinutes = (m.end - m.start) / 60_000;
    if (durationMinutes < cfg.minDurationMinutes) continue;
    let peak = m.members[0]!;
    for (const p of m.members) {
      if (p.precipitationMmPerHour > peak.precipitationMmPerHour) peak = p;
    }
    let lowest = m.members[0]!.confidence;
    for (const p of m.members) {
      if (CONF_RANK[p.confidence] < CONF_RANK[lowest]) lowest = p.confidence;
    }
    const stepMin = medianGapMinutes(m.members);
    const accumulatedMm =
      m.members.reduce((sum, p) => sum + p.precipitationMmPerHour * stepMin, 0) / 60;
    events.push({
      id: `evt-${m.start}`,
      startsAt: new Date(m.start).toISOString(),
      endsAt: new Date(m.end).toISOString(),
      peakAt: new Date(Date.parse(peak.timestamp)).toISOString(),
      durationMinutes: Math.round(durationMinutes),
      peakMmPerHour: peak.precipitationMmPerHour,
      accumulatedMm,
      peakIntensity: classifyIntensity(peak.precipitationMmPerHour, DEFAULT_INTENSITY_THRESHOLDS),
      confidence: lowest,
    });
  }
  return events.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

function makeRun(members: ForecastPoint[]): {
  start: number;
  end: number;
  members: ForecastPoint[];
} {
  const start = Date.parse(members[0]!.timestamp);
  const last = Date.parse(members[members.length - 1]!.timestamp);
  // Event end extends one step past the last wet point: the precipitation of
  // the final 5-min point covers the following interval (SPEC §12 example:
  // last wet 10:45 → event end 10:50).
  const stepMs = medianGapMinutes(members) * 60_000;
  return { start, end: last + stepMs, members };
}

function medianGapMinutes(members: ForecastPoint[]): number {
  if (members.length < 2) return 5;
  const gaps = members
    .slice(1)
    .map((p, i) => (Date.parse(p.timestamp) - Date.parse(members[i]!.timestamp)) / 60_000)
    .filter((g) => g > 0)
    .sort((a, b) => a - b);
  if (gaps.length === 0) return 5;
  const mid = Math.floor(gaps.length / 2);
  return gaps[mid] ?? 5;
}
