import { describe, expect, it } from "vitest";

import { summarizeHorizon } from "../src/pipeline/horizons.js";

const NOW = Date.parse("2026-08-30T14:00:00Z");
const P = (min: number, mm: number, confidence: "high" | "medium" | "low" = "high") => ({
  timestamp: new Date(NOW + min * 60_000).toISOString(),
  precipitationMmPerHour: mm,
  source: "radar-nowcast" as const,
  confidence,
});
const HOUR = 3_600_000;

describe("summarizeHorizon (SPEC §13)", () => {
  it("produces exact window bounds for +1h", () => {
    const s = summarizeHorizon([P(10, 1)], NOW, NOW + HOUR);
    expect(s.from).toBe("2026-08-30T14:00:00.000Z");
    expect(s.until).toBe("2026-08-30T15:00:00.000Z");
  });

  it("dry window → status dry, zero accumulation, firstRainAt null", () => {
    const s = summarizeHorizon([P(10, 0), P(20, 0.02)], NOW, NOW + HOUR);
    expect(s.status).toBe("dry");
    expect(s.rainExpected).toBe(false);
    expect(s.firstRainAt).toBeNull();
    expect(s.rainDurationMinutes).toBe(0);
  });

  it("steady rain → status rain", () => {
    const pts = Array.from({ length: 12 }, (_, i) => P(i * 5, 1.5));
    const s = summarizeHorizon(pts, NOW, NOW + HOUR);
    expect(s.status).toBe("rain");
    expect(s.rainExpected).toBe(true);
    expect(s.firstRainAt).toBe("2026-08-30T14:00:00.000Z");
    expect(s.dominantIntensity).toBe("light");
  });

  it("intermittent rain (≤50% of window) → showers", () => {
    // rain 0-20 min of a 60-min window → 20/60 < 50%
    const pts = [
      P(0, 2),
      P(5, 2),
      P(10, 2),
      P(15, 2),
      ...Array.from({ length: 8 }, (_, i) => P(20 + i * 5, 0)),
    ];
    const s = summarizeHorizon(pts, NOW, NOW + HOUR);
    expect(s.status).toBe("showers");
  });

  it("heavy rain → heavy-rain", () => {
    const pts = Array.from({ length: 12 }, (_, i) => P(i * 5, 8));
    const s = summarizeHorizon(pts, NOW, NOW + HOUR);
    expect(s.status).toBe("heavy-rain");
    expect(s.maxMmPerHour).toBe(8);
  });

  it("low confidence rain → rain-possible", () => {
    const pts = Array.from({ length: 12 }, (_, i) => P(i * 5, 1.5, "low"));
    const s = summarizeHorizon(pts, NOW, NOW + HOUR);
    expect(s.status).toBe("rain-possible");
    expect(s.confidence).toBe("low");
  });

  it("exact +4h/+12h/+24h boundaries", () => {
    const s4 = summarizeHorizon([P(10, 1)], NOW, NOW + 4 * HOUR);
    const s12 = summarizeHorizon([P(10, 1)], NOW, NOW + 12 * HOUR);
    const s24 = summarizeHorizon([P(10, 1)], NOW, NOW + 24 * HOUR);
    expect(s4.until).toBe("2026-08-30T18:00:00.000Z");
    expect(s12.until).toBe("2026-08-31T02:00:00.000Z");
    expect(s24.until).toBe("2026-08-31T14:00:00.000Z");
  });

  it("window excludes points exactly at until", () => {
    const s = summarizeHorizon([P(0, 1), P(60, 9)], NOW, NOW + HOUR);
    expect(s.maxMmPerHour).toBe(1);
    expect(s.rainDurationMinutes).toBeLessThanOrEqual(15);
  });
});
