import type {
  ForecastLocation,
  ForecastPoint,
  ForecastSourceMetadata,
  RainIntensityThresholds,
} from "@rainwatch/domain";
import { classifyIntensity, DEFAULT_INTENSITY_THRESHOLDS } from "@rainwatch/domain";
import type { RainEvent, RainForecastSnapshot } from "@rainwatch/forecast-contract";
import { RAIN_FORECAST_SNAPSHOT_SCHEMA } from "@rainwatch/forecast-contract";

import { summarizeHorizon } from "./horizons.js";

export interface BuildSnapshotInput {
  location: ForecastLocation;
  timeline: ForecastPoint[];
  events: RainEvent[];
  sources: ForecastSourceMetadata[];
  nowEpochMs: number;
  intensityThresholds?: RainIntensityThresholds;
}

/**
 * SPEC §10, §26-27 — pure. Assemble the canonical RainForecastSnapshot.
 * Horizon summaries are computed here, for exactly now→+1h/+4h/+12h/+24h (SPEC §13).
 * Output is validated against the contract schema — throws on mismatch.
 */
export function buildSnapshot(input: BuildSnapshotInput): RainForecastSnapshot {
  const thresholds = input.intensityThresholds ?? DEFAULT_INTENSITY_THRESHOLDS;
  const now = new Date(input.nowEpochMs).toISOString();

  const sorted = [...input.timeline].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );

  const currentPoint = sorted.find((p) => Date.parse(p.timestamp) >= input.nowEpochMs);
  const nowValue = currentPoint?.precipitationMmPerHour ?? 0;
  const current = {
    raining: nowValue >= thresholds.drizzleMin,
    precipitationMmPerHour: nowValue,
    intensity: classifyIntensity(nowValue, thresholds),
    confidence: currentPoint?.confidence ?? "medium",
  } as const;

  const nextRain =
    input.events
      .filter((e) => Date.parse(e.endsAt) > input.nowEpochMs)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null;

  const horizon = (hours: number) =>
    summarizeHorizon(sorted, input.nowEpochMs, input.nowEpochMs + hours * 3_600_000, {
      intensityThresholds: thresholds,
    });

  let sourceGeneratedAt = input.sources[0]?.runGeneratedAt ?? now;
  for (const s of input.sources) {
    if (Date.parse(s.runGeneratedAt) < Date.parse(sourceGeneratedAt)) {
      sourceGeneratedAt = s.runGeneratedAt;
    }
  }

  const snapshot: RainForecastSnapshot = {
    schemaVersion: "1",
    location: input.location,
    generatedAt: now,
    sourceGeneratedAt,
    expiresAt: new Date(input.nowEpochMs + 30 * 60_000).toISOString(),
    current,
    nextRain,
    events: input.events,
    horizons: {
      oneHour: horizon(1),
      fourHours: horizon(4),
      twelveHours: horizon(12),
      twentyFourHours: horizon(24),
    },
    timeline: sorted,
    sources: input.sources,
  };

  // SPEC §40 — the backend validates with the same schema the frontend uses.
  return RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(snapshot);
}
