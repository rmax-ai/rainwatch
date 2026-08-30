import { describe, expect, it } from "vitest";

import { RAIN_FORECAST_SNAPSHOT_SCHEMA, type RainForecastSnapshot } from "./index.js";

// Minimal but complete valid snapshot per SPEC §10-13, §15.
export const VALID_SNAPSHOT: RainForecastSnapshot = {
  schemaVersion: "1",
  location: { id: "amsterdam-west", label: "Amsterdam West", latitude: 52.37, longitude: 4.85 },
  generatedAt: "2026-08-30T14:00:00Z",
  sourceGeneratedAt: "2026-08-30T13:55:00Z",
  expiresAt: "2026-08-30T14:30:00Z",
  current: {
    raining: false,
    precipitationMmPerHour: 0,
    intensity: "none",
    confidence: "high",
  },
  nextRain: null,
  events: [],
  horizons: {
    oneHour: {
      from: "2026-08-30T14:00:00Z",
      until: "2026-08-30T15:00:00Z",
      status: "dry",
      rainExpected: false,
      accumulatedMm: 0,
      maxMmPerHour: 0,
      dominantIntensity: "none",
      firstRainAt: null,
      rainDurationMinutes: 0,
      confidence: "high",
    },
    fourHours: {
      from: "2026-08-30T14:00:00Z",
      until: "2026-08-30T18:00:00Z",
      status: "rain-possible",
      rainExpected: true,
      precipitationProbability: 0.4,
      accumulatedMm: 0.8,
      maxMmPerHour: 1.2,
      dominantIntensity: "light",
      firstRainAt: "2026-08-30T16:30:00Z",
      rainDurationMinutes: 30,
      confidence: "medium",
    },
    twelveHours: {
      from: "2026-08-30T14:00:00Z",
      until: "2026-08-31T02:00:00Z",
      status: "rain",
      rainExpected: true,
      precipitationProbability: 0.6,
      accumulatedMm: 3.4,
      maxMmPerHour: 4.5,
      dominantIntensity: "moderate",
      firstRainAt: "2026-08-30T16:30:00Z",
      rainDurationMinutes: 120,
      confidence: "medium",
    },
    twentyFourHours: {
      from: "2026-08-30T14:00:00Z",
      until: "2026-08-31T14:00:00Z",
      status: "rain",
      rainExpected: true,
      precipitationProbability: 0.6,
      accumulatedMm: 4.2,
      maxMmPerHour: 4.5,
      dominantIntensity: "moderate",
      firstRainAt: "2026-08-30T16:30:00Z",
      rainDurationMinutes: 120,
      confidence: "low",
    },
  },
  timeline: [
    {
      timestamp: "2026-08-30T14:00:00Z",
      precipitationMmPerHour: 0,
      source: "radar-nowcast",
      confidence: "high",
    },
  ],
  sources: [
    {
      source: "radar-nowcast",
      runGeneratedAt: "2026-08-30T13:55:00Z",
      fetchedAt: "2026-08-30T14:00:00Z",
      dataset: "radar_forecast",
      datasetVersion: "2.0",
    },
  ],
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("RainForecastSnapshot v1 contract (SPEC §40)", () => {
  it("parses a valid snapshot", () => {
    expect(() => RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(VALID_SNAPSHOT)).not.toThrow();
  });

  it("rejects wrong schemaVersion", () => {
    expect(() =>
      RAIN_FORECAST_SNAPSHOT_SCHEMA.parse({ ...VALID_SNAPSHOT, schemaVersion: "2" }),
    ).toThrow();
  });

  it("rejects missing required field (horizons.twelveHours)", () => {
    const bad = clone(VALID_SNAPSHOT);
    // biome-ignore lint/performance/noDelete: intentional removal for negative test
    delete (bad.horizons as Record<string, unknown>).twelveHours;
    expect(() => RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(bad)).toThrow();
  });

  it("rejects invalid intensity enum", () => {
    const bad = clone(VALID_SNAPSHOT);
    bad.current.intensity = "torrential" as never;
    expect(() => RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(bad)).toThrow();
  });

  it("rejects invalid source enum in timeline", () => {
    const bad = clone(VALID_SNAPSHOT);
    bad.timeline[0]!.source = "knmi-magic" as never;
    expect(() => RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(bad)).toThrow();
  });

  it("rejects invalid horizon status", () => {
    const bad = clone(VALID_SNAPSHOT);
    bad.horizons.oneHour.status = "maybe" as never;
    expect(() => RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(bad)).toThrow();
  });
});
