import { describe, expect, it } from "vitest";

import { resampleTimeline } from "../src/pipeline/resample.js";

const NOW = Date.parse("2026-08-30T14:00:00Z");
const P = (iso: string, mm: number) => ({ timestamp: iso, precipitationMmPerHour: mm });

describe("resampleTimeline (SPEC §19)", () => {
  it("emits 89 slots: 48 × 5-min [0–4h) + 41 × 30-min [4–24h]", () => {
    const out = resampleTimeline([], NOW);
    expect(out).toHaveLength(89);
    const t0 = Date.parse(out[0]!.timestamp);
    const t1 = Date.parse(out[1]!.timestamp);
    expect(t1 - t0).toBe(5 * 60_000);
    const t47 = Date.parse(out[47]!.timestamp);
    expect(t47 - t0).toBe(47 * 5 * 60_000);
    const t48 = Date.parse(out[48]!.timestamp);
    expect(t48 - t0).toBe(4 * 3_600_000); // first 30-min slot at exactly +4h
    const last = Date.parse(out[88]!.timestamp);
    expect(last - t0).toBe(24 * 3_600_000);
  });

  it("assigns points to the nearest slot", () => {
    const out = resampleTimeline([P("2026-08-30T14:03:00Z", 2)], NOW);
    // nearest slot to 14:03 is 14:05
    const slot = out.find((p) => p.timestamp === "2026-08-30T14:05:00.000Z");
    expect(slot?.precipitationMmPerHour).toBe(2);
  });

  it("averages colliding points", () => {
    const out = resampleTimeline([P("2026-08-30T14:01:00Z", 2), P("2026-08-30T14:02:00Z", 4)], NOW);
    const slot = out.find((p) => p.timestamp === "2026-08-30T14:00:00.000Z");
    expect(slot?.precipitationMmPerHour).toBe(3);
  });

  it("linearly interpolates interior gaps", () => {
    const out = resampleTimeline([P("2026-08-30T14:00:00Z", 0), P("2026-08-30T14:20:00Z", 2)], NOW);
    const mid = out.find((p) => p.timestamp === "2026-08-30T14:10:00.000Z");
    expect(mid?.precipitationMmPerHour).toBeCloseTo(1, 5);
  });

  it("clamps edges to nearest value", () => {
    const out = resampleTimeline([P("2026-08-30T15:00:00Z", 3)], NOW);
    const early = out.find((p) => p.timestamp === "2026-08-30T14:05:00.000Z");
    expect(early?.precipitationMmPerHour).toBe(3);
  });

  it("drops points outside the 24h window and emits ISO UTC, strictly increasing", () => {
    const out = resampleTimeline([P("2026-08-30T10:00:00Z", 9), P("2026-08-31T15:00:00Z", 9)], NOW);
    expect(out).toHaveLength(89);
    for (let i = 1; i < out.length; i += 1) {
      expect(Date.parse(out[i]!.timestamp)).toBeGreaterThan(Date.parse(out[i - 1]!.timestamp));
      expect(out[i]!.timestamp).toMatch(/Z$/);
    }
  });
});
