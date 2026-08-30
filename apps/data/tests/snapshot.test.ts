import { RAIN_FORECAST_SNAPSHOT_SCHEMA } from "@rainwatch/forecast-contract";
import { describe, expect, it } from "vitest";

import { buildSnapshot } from "../src/pipeline/buildSnapshot.js";

const NOW = Date.parse("2026-08-30T14:00:00Z");
const P = (min: number, mm: number, confidence: "high" | "medium" | "low" = "high") => ({
  timestamp: new Date(NOW + min * 60_000).toISOString(),
  precipitationMmPerHour: mm,
  source: "radar-nowcast" as const,
  confidence,
});
const LOCATION = {
  id: "amsterdam-west",
  label: "Amsterdam West",
  latitude: 52.37,
  longitude: 4.85,
};
const SOURCES = [
  {
    source: "radar-nowcast" as const,
    runGeneratedAt: "2026-08-30T13:55:00Z",
    fetchedAt: "2026-08-30T14:00:00Z",
    dataset: "radar_forecast",
    datasetVersion: "2.0",
  },
  {
    source: "harmonie" as const,
    runGeneratedAt: "2026-08-30T11:00:00Z",
    fetchedAt: "2026-08-30T13:30:00Z",
    dataset: "uwcw-ha-det-nl-s1",
    datasetVersion: "1.0",
  },
];

const RAIN_EVENT = {
  id: "evt-1",
  startsAt: "2026-08-30T14:30:00.000Z",
  endsAt: "2026-08-30T15:10:00.000Z",
  peakAt: "2026-08-30T14:45:00.000Z",
  durationMinutes: 40,
  peakMmPerHour: 2.8,
  accumulatedMm: 1.4,
  peakIntensity: "moderate" as const,
  confidence: "high" as const,
};

describe("buildSnapshot (SPEC §10, §26)", () => {
  it("output parses with the contract schema", () => {
    const timeline = Array.from({ length: 12 }, (_, i) => P(i * 5, 1.2));
    const snap = buildSnapshot({
      location: LOCATION,
      timeline,
      events: [RAIN_EVENT],
      sources: SOURCES,
      nowEpochMs: NOW,
    });
    expect(() => RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(snap)).not.toThrow();
    expect(snap.schemaVersion).toBe("1");
  });

  it("computes exactly four horizon summaries with correct windows", () => {
    const snap = buildSnapshot({
      location: LOCATION,
      timeline: [P(0, 0)],
      events: [],
      sources: SOURCES,
      nowEpochMs: NOW,
    });
    expect(snap.horizons.oneHour.from).toBe("2026-08-30T14:00:00.000Z");
    expect(snap.horizons.oneHour.until).toBe("2026-08-30T15:00:00.000Z");
    expect(snap.horizons.fourHours.until).toBe("2026-08-30T18:00:00.000Z");
    expect(snap.horizons.twelveHours.until).toBe("2026-08-31T02:00:00.000Z");
    expect(snap.horizons.twentyFourHours.until).toBe("2026-08-31T14:00:00.000Z");
  });

  it("nextRain = first event with endsAt > now, else null", () => {
    const past = { ...RAIN_EVENT, endsAt: "2026-08-30T13:50:00.000Z" };
    const withNext = buildSnapshot({
      location: LOCATION,
      timeline: [P(0, 0)],
      events: [past, RAIN_EVENT],
      sources: SOURCES,
      nowEpochMs: NOW,
    });
    expect(withNext.nextRain?.id).toBe(RAIN_EVENT.id);

    const without = buildSnapshot({
      location: LOCATION,
      timeline: [P(0, 0)],
      events: [past],
      sources: SOURCES,
      nowEpochMs: NOW,
    });
    expect(without.nextRain).toBeNull();
  });

  it("current state reflects the first point at/after now", () => {
    const snap = buildSnapshot({
      location: LOCATION,
      timeline: [P(-5, 0), P(0, 1.2)],
      events: [],
      sources: SOURCES,
      nowEpochMs: NOW,
    });
    expect(snap.current.raining).toBe(true);
    expect(snap.current.precipitationMmPerHour).toBe(1.2);
    expect(snap.current.intensity).toBe("light");
  });

  it("sourceGeneratedAt = min of sources; expiresAt = generatedAt + 30 min", () => {
    const snap = buildSnapshot({
      location: LOCATION,
      timeline: [P(0, 0)],
      events: [],
      sources: SOURCES,
      nowEpochMs: NOW,
    });
    expect(snap.sourceGeneratedAt).toBe("2026-08-30T11:00:00Z");
    expect(snap.expiresAt).toBe("2026-08-30T14:30:00.000Z");
    expect(snap.generatedAt).toBe("2026-08-30T14:00:00.000Z");
  });
});
