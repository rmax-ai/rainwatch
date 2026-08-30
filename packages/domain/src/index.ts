// Rainwatch domain model — SPEC §7-9.
// Zero KNMI concepts here. UTC timestamps as ISO strings.

export const RAIN_SOURCES = ["radar-nowcast", "harmonie", "blended"] as const;
export type RainSource = (typeof RAIN_SOURCES)[number];

export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const RAIN_INTENSITIES = [
  "none",
  "drizzle",
  "light",
  "moderate",
  "heavy",
  "very-heavy",
] as const;
export type RainIntensity = (typeof RAIN_INTENSITIES)[number];

/** SPEC §7 — a single precipitation point on the canonical timeline. */
export interface ForecastPoint {
  /** ISO 8601 UTC timestamp. */
  timestamp: string;
  precipitationMmPerHour: number;
  precipitationProbability?: number;
  source: RainSource;
  confidence: Confidence;
}

/** SPEC §8 — configured location. */
export interface ForecastLocation {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

/**
 * SPEC §9 — UX thresholds for intensity classification (mm/h).
 * Treat as UX thresholds, not meteorological truth.
 */
export interface RainIntensityThresholds {
  /** >= this value → drizzle (SPEC §9: 0.05) */
  drizzleMin: number;
  /** >= this value → light (0.5) */
  lightMin: number;
  /** >= this value → moderate (2) */
  moderateMin: number;
  /** >= this value → heavy (5) */
  heavyMin: number;
  /** >= this value → very-heavy (15) */
  veryHeavyMin: number;
}

export const DEFAULT_INTENSITY_THRESHOLDS: RainIntensityThresholds = {
  drizzleMin: 0.05,
  lightMin: 0.5,
  moderateMin: 2,
  heavyMin: 5,
  veryHeavyMin: 15,
};

/**
 * SPEC §27 — deterministic pure function.
 * Classify precipitation intensity (mm/h) using configurable thresholds.
 * Negative or NaN input → "none".
 */
export function classifyIntensity(
  precipitationMmPerHour: number,
  thresholds: RainIntensityThresholds = DEFAULT_INTENSITY_THRESHOLDS,
): RainIntensity {
  if (!Number.isFinite(precipitationMmPerHour) || precipitationMmPerHour < thresholds.drizzleMin) {
    return "none";
  }
  if (precipitationMmPerHour < thresholds.lightMin) return "drizzle";
  if (precipitationMmPerHour < thresholds.moderateMin) return "light";
  if (precipitationMmPerHour < thresholds.heavyMin) return "moderate";
  if (precipitationMmPerHour < thresholds.veryHeavyMin) return "heavy";
  return "very-heavy";
}

// --- Raw source representation (SPEC §14-15) -------------------------------
// Adapters emit these; pipeline consumes them. Source-specific types never
// leave the adapter directories.

export const SOURCE_IDS = ["radar-nowcast", "harmonie"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

/** SPEC §15 — one normalized point from a raw source (already mm/h). */
export interface SourceForecastPoint {
  timestamp: string;
  precipitationMmPerHour: number;
}

/** SPEC §15 — provenance of a source forecast. */
export interface ForecastSourceMetadata {
  source: SourceId;
  runGeneratedAt: string;
  fetchedAt: string;
  dataset: string;
  datasetVersion?: string;
}

/** SPEC §15 — an adapter's normalized output for one source. */
export interface SourceForecast {
  source: ForecastSourceMetadata;
  points: SourceForecastPoint[];
}
