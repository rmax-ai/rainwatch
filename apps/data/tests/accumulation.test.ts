import { describe, expect, it } from "vitest";

import { calculateAccumulation } from "../src/pipeline/accumulation.js";

const NOW = Date.parse("2026-08-30T14:00:00Z");
const P = (min: number, mm: number) => ({
  timestamp: new Date(NOW + min * 60_000).toISOString(),
  precipitationMmPerHour: mm,
});

describe("calculateAccumulation (SPEC §27)", () => {
  it("empty input → 0", () => {
    expect(calculateAccumulation([], NOW, NOW + 3_600_000)).toBe(0);
  });

  it("inverted window → 0", () => {
    expect(calculateAccumulation([P(0, 1)], NOW + 60_000, NOW)).toBe(0);
  });

  it("single point covering the window: value × duration", () => {
    // one point at t=0 with 2 mm/h, window 30 min, edge gaps → half-gap on both sides
    const out = calculateAccumulation([P(0, 2)], NOW, NOW + 30 * 60_000);
    // point covers [t-?, t+?] clipped to [now, now+30m]; single point → full 30 min
    expect(out).toBeCloseTo(1, 5); // 2 mm/h × 0.5 h
  });

  it("trapezoid sum over a 5-min series", () => {
    // constant 1 mm/h from t=0..t=30 (7 points) → 0.5 mm
    const pts = Array.from({ length: 7 }, (_, i) => P(i * 5, 1));
    const out = calculateAccumulation(pts, NOW, NOW + 30 * 60_000);
    expect(out).toBeCloseTo(0.5, 3);
  });

  it("boundary points contribute proportionally", () => {
    // two points 65 min apart, half-gap 32.5 min each side:
    // p(-5) covers [now, now+27.5m], p(60) covers [now+27.5m, now+30m] → 2 mm/h × 30 min = 1 mm
    const pts = [P(-5, 2), P(60, 2)];
    const out = calculateAccumulation(pts, NOW, NOW + 30 * 60_000);
    expect(out).toBeCloseTo(1, 3);
  });
});
