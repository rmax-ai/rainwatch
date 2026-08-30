import type { RainForecastSnapshot } from "@rainwatch/forecast-contract";
import { describe, expect, it } from "vitest";

import { type HeroState, heroCopy, heroState } from "../src/hero.js";
import type { Freshness } from "../src/state.js";

const NOW = Date.parse("2026-08-30T14:00:00Z");
const HOUR = 3_600_000;

function baseSnapshot(overrides: Partial<RainForecastSnapshot> = {}): RainForecastSnapshot {
  const horizon = (from: string, until: string, rainExpected: boolean) => ({
    from,
    until,
    status: rainExpected ? ("rain" as const) : ("dry" as const),
    rainExpected,
    accumulatedMm: 0,
    maxMmPerHour: 0,
    dominantIntensity: "none" as const,
    firstRainAt: null,
    rainDurationMinutes: 0,
    confidence: "medium" as const,
  });
  return {
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
      oneHour: horizon("2026-08-30T14:00:00Z", "2026-08-30T15:00:00Z", false),
      fourHours: horizon("2026-08-30T14:00:00Z", "2026-08-30T18:00:00Z", true),
      twelveHours: horizon("2026-08-30T14:00:00Z", "2026-08-31T02:00:00Z", true),
      twentyFourHours: horizon("2026-08-30T14:00:00Z", "2026-08-31T14:00:00Z", true),
    },
    timeline: [],
    sources: [],
    ...overrides,
  };
}

const nextRainAt = (minutes: number) => ({
  id: "evt-1",
  startsAt: new Date(NOW + minutes * 60_000).toISOString(),
  endsAt: new Date(NOW + (minutes + 40) * 60_000).toISOString(),
  peakAt: new Date(NOW + (minutes + 15) * 60_000).toISOString(),
  durationMinutes: 40,
  peakMmPerHour: 2.8,
  accumulatedMm: 1.4,
  peakIntensity: "moderate" as const,
  confidence: "high" as const,
});

function state(snapshot: RainForecastSnapshot, freshness: Freshness = "fresh"): HeroState {
  return heroState(snapshot, freshness, NOW);
}

describe("heroState (SPEC §30)", () => {
  it("dry: no rain in the next hour", () => {
    expect(state(baseSnapshot())).toBe("dry");
  });

  it("rain-soon: next rain within 30 min", () => {
    const snap = baseSnapshot({ nextRain: nextRainAt(25) });
    expect(state(snap)).toBe("rain-soon");
  });

  it("rain-soon boundary: exactly 30 min is still soon, 31 min is rain-later", () => {
    expect(state(baseSnapshot({ nextRain: nextRainAt(30) }))).toBe("rain-soon");
    expect(state(baseSnapshot({ nextRain: nextRainAt(31) }))).toBe("rain-later");
  });

  it("rain-later: next rain beyond 30 min", () => {
    const snap = baseSnapshot({ nextRain: nextRainAt(120) });
    expect(state(snap)).toBe("rain-later");
  });

  it("raining: current.raining true with light/moderate intensity", () => {
    const snap = baseSnapshot({
      current: {
        raining: true,
        precipitationMmPerHour: 1.5,
        intensity: "light",
        confidence: "high",
      },
    });
    expect(state(snap)).toBe("raining");
  });

  it("heavy-rain: raining with heavy or very-heavy intensity", () => {
    const heavy = baseSnapshot({
      current: { raining: true, precipitationMmPerHour: 8, intensity: "heavy", confidence: "high" },
    });
    expect(state(heavy)).toBe("heavy-rain");
    const veryHeavy = baseSnapshot({
      current: {
        raining: true,
        precipitationMmPerHour: 20,
        intensity: "very-heavy",
        confidence: "high",
      },
    });
    expect(state(veryHeavy)).toBe("heavy-rain");
  });

  it("stale overrides everything, even active heavy rain (SPEC §25)", () => {
    const snap = baseSnapshot({
      current: {
        raining: true,
        precipitationMmPerHour: 20,
        intensity: "very-heavy",
        confidence: "high",
      },
    });
    expect(state(snap, "stale")).toBe("stale");
    expect(state(snap, "degraded")).toBe("heavy-rain");
  });
});

describe("heroCopy (SPEC §30)", () => {
  it("dry headline", () => {
    const copy = heroCopy("dry", baseSnapshot(), NOW);
    expect(copy.headline).toBe("DRY FOR THE NEXT HOUR");
  });

  it("rain-soon headline shows rounded minutes", () => {
    const snap = baseSnapshot({ nextRain: nextRainAt(23) });
    const copy = heroCopy("rain-soon", snap, NOW);
    expect(copy.headline).toBe("RAIN IN ~23 MIN");
  });

  it("raining headline + intensity/duration subline", () => {
    const snap = baseSnapshot({
      current: {
        raining: true,
        precipitationMmPerHour: 1.5,
        intensity: "light",
        confidence: "high",
      },
      events: [
        {
          ...nextRainAt(-10),
          startsAt: new Date(NOW - 10 * 60_000).toISOString(),
          peakIntensity: "light" as const,
          durationMinutes: 45,
        },
      ],
    });
    const copy = heroCopy("raining", snap, NOW);
    expect(copy.headline).toBe("RAINING NOW");
    expect(copy.subline).toContain("Light");
    expect(copy.subline).toContain("45 min");
  });

  it("heavy-rain headline", () => {
    const snap = baseSnapshot({
      current: { raining: true, precipitationMmPerHour: 9, intensity: "heavy", confidence: "high" },
    });
    expect(heroCopy("heavy-rain", snap, NOW).headline).toBe("HEAVY RAIN");
  });

  it("stale headline warns explicitly", () => {
    const copy = heroCopy("stale", baseSnapshot(), NOW);
    expect(copy.headline).toBe("FORECAST OUT OF DATE");
  });
});
