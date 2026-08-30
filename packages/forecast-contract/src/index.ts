import { CONFIDENCES, RAIN_INTENSITIES, RAIN_SOURCES } from "@rainwatch/domain";
import { z } from "zod";

// RainForecastSnapshot v1 — SPEC §10-13, §15.
// THE architectural boundary (SPEC §51): backend publishes it, frontend consumes it.
// Schema-breaking changes require incrementing schemaVersion (SPEC §40).

export const FORECAST_POINT_SCHEMA = z.object({
  timestamp: z.string(), // ISO 8601 UTC
  precipitationMmPerHour: z.number(),
  precipitationProbability: z.number().min(0).max(1).optional(),
  source: z.enum(RAIN_SOURCES),
  confidence: z.enum(CONFIDENCES),
});

export const FORECAST_LOCATION_SCHEMA = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const CURRENT_RAIN_STATE_SCHEMA = z.object({
  raining: z.boolean(),
  precipitationMmPerHour: z.number(),
  intensity: z.enum(RAIN_INTENSITIES),
  confidence: z.enum(CONFIDENCES),
});

export const RAIN_EVENT_SCHEMA = z.object({
  id: z.string().min(1),
  startsAt: z.string(),
  endsAt: z.string(),
  peakAt: z.string(),
  durationMinutes: z.number().int().min(0),
  peakMmPerHour: z.number(),
  accumulatedMm: z.number(),
  peakIntensity: z.enum(RAIN_INTENSITIES),
  confidence: z.enum(CONFIDENCES),
});

export const HORIZON_STATUS = ["dry", "rain-possible", "rain", "showers", "heavy-rain"] as const;

export const HORIZON_SUMMARY_SCHEMA = z.object({
  from: z.string(),
  until: z.string(),
  status: z.enum(HORIZON_STATUS),
  rainExpected: z.boolean(),
  precipitationProbability: z.number().min(0).max(1).optional(),
  accumulatedMm: z.number(),
  maxMmPerHour: z.number(),
  dominantIntensity: z.enum(RAIN_INTENSITIES),
  firstRainAt: z.string().nullable(),
  rainDurationMinutes: z.number().int().min(0),
  confidence: z.enum(CONFIDENCES),
});

export const FORECAST_SOURCE_METADATA_SCHEMA = z.object({
  source: z.enum(["radar-nowcast", "harmonie"]),
  runGeneratedAt: z.string(),
  fetchedAt: z.string(),
  dataset: z.string(),
  datasetVersion: z.string().optional(),
});

export const RAIN_FORECAST_SNAPSHOT_SCHEMA = z.object({
  schemaVersion: z.literal("1"),
  location: FORECAST_LOCATION_SCHEMA,
  generatedAt: z.string(),
  sourceGeneratedAt: z.string(),
  expiresAt: z.string(),
  current: CURRENT_RAIN_STATE_SCHEMA,
  nextRain: RAIN_EVENT_SCHEMA.nullable(),
  events: z.array(RAIN_EVENT_SCHEMA),
  horizons: z.object({
    oneHour: HORIZON_SUMMARY_SCHEMA,
    fourHours: HORIZON_SUMMARY_SCHEMA,
    twelveHours: HORIZON_SUMMARY_SCHEMA,
    twentyFourHours: HORIZON_SUMMARY_SCHEMA,
  }),
  timeline: z.array(FORECAST_POINT_SCHEMA),
  sources: z.array(FORECAST_SOURCE_METADATA_SCHEMA),
});

export const SCHEMA_VERSION = "1";

export type ForecastPoint = z.infer<typeof FORECAST_POINT_SCHEMA>;
export type ForecastLocation = z.infer<typeof FORECAST_LOCATION_SCHEMA>;
export type CurrentRainState = z.infer<typeof CURRENT_RAIN_STATE_SCHEMA>;
export type RainEvent = z.infer<typeof RAIN_EVENT_SCHEMA>;
export type HorizonStatus = (typeof HORIZON_STATUS)[number];
export type HorizonSummary = z.infer<typeof HORIZON_SUMMARY_SCHEMA>;
export type ForecastSourceMetadata = z.infer<typeof FORECAST_SOURCE_METADATA_SCHEMA>;
export type RainForecastSnapshot = z.infer<typeof RAIN_FORECAST_SNAPSHOT_SCHEMA>;
