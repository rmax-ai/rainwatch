import { describe, expect, it } from "vitest";

import { fuseForecasts } from "../src/pipeline/fusion.js";

const NOW = Date.parse("2026-08-30T14:00:00Z");
const at = (min: number, mm: number) => ({
  timestamp: new Date(NOW + min * 60_000).toISOString(),
  precipitationMmPerHour: mm,
});

describe("fuseForecasts (SPEC §20)", () => {
  it("radar dominates t < 90 (values exactly radar's)", () => {
    const radar = [at(5, 1), at(30, 2), at(60, 3)];
    const harmonie = [at(30, 10), at(60, 10)];
    const out = fuseForecasts({ radar, harmonie, nowEpochMs: NOW });
    const leadToValue = new Map(
      out.map((p) => [(Date.parse(p.timestamp) - NOW) / 60_000, p.precipitationMmPerHour]),
    );
    expect(leadToValue.get(5)).toBe(1);
    expect(leadToValue.get(30)).toBe(2);
    expect(leadToValue.get(60)).toBe(3);
    expect(out.filter((q) => q.source === "radar-nowcast")).toHaveLength(3);
  });

  it("weight schedule: t=90 → 0.75, t=105 → 0.5, t=120 → 0.25 (SPEC §20 example)", () => {
    const radar = [at(90, 1), at(105, 1), at(120, 1)];
    const harmonie = [at(90, 4), at(105, 4), at(120, 4)];
    const out = fuseForecasts({ radar, harmonie, nowEpochMs: NOW });
    const blended = out.filter((p) => p.source === "blended");
    const leadToValue = new Map(
      blended.map((p) => [(Date.parse(p.timestamp) - NOW) / 60_000, p.precipitationMmPerHour]),
    );
    expect(leadToValue.get(90)).toBeCloseTo(1.75, 5);
    expect(leadToValue.get(105)).toBeCloseTo(2.5, 5);
    expect(leadToValue.get(120)).toBeCloseTo(3.25, 5);
  });

  it("transition is smooth and monotonic between 90 and 120", () => {
    const radar = Array.from({ length: 7 }, (_, i) => at(90 + i * 5, 1));
    const harmonie = Array.from({ length: 7 }, (_, i) => at(90 + i * 5, 4));
    const out = fuseForecasts({ radar, harmonie, nowEpochMs: NOW });
    const values = out.filter((p) => p.source === "blended").map((p) => p.precipitationMmPerHour);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!); // radar weight decreases → value rises toward HARMONIE
    }
  });

  it("HARMONIE dominates t > 120; blend at exactly 120 is 25/75", () => {
    const radar = [at(5, 1), at(120, 1)];
    const harmonie = [at(120, 5), at(180, 6), at(360, 7)];
    const out = fuseForecasts({ radar, harmonie, nowEpochMs: NOW });
    const h = out.filter((p) => p.source === "harmonie");
    expect(h).toHaveLength(2);
    expect(h[0]!.precipitationMmPerHour).toBe(6);
    expect(h[1]!.precipitationMmPerHour).toBe(7);
    const blended120 = out.find((p) => p.source === "blended");
    expect(blended120?.precipitationMmPerHour).toBeCloseTo(0.25 * 1 + 0.75 * 5, 5);
  });

  it("missing radar → HARMONIE-only everywhere", () => {
    const harmonie = [at(60, 2), at(180, 3)];
    const out = fuseForecasts({ radar: [], harmonie, nowEpochMs: NOW });
    expect(out.every((p) => p.source === "harmonie")).toBe(true);
    expect(out).toHaveLength(2);
  });

  it("missing HARMONIE → radar-only till 120, nothing beyond", () => {
    const radar = [at(5, 1), at(60, 2), at(115, 3)];
    const out = fuseForecasts({ radar, harmonie: [], nowEpochMs: NOW });
    expect(out).toHaveLength(3);
    expect(out.every((p) => p.source === "radar-nowcast")).toBe(true);
  });

  it("output sorted by timestamp; blended only in the 90–120 band", () => {
    const radar = [at(5, 1), at(95, 1), at(110, 1)];
    const harmonie = [at(95, 2), at(110, 2), at(150, 2)];
    const out = fuseForecasts({ radar, harmonie, nowEpochMs: NOW });
    for (let i = 1; i < out.length; i += 1) {
      expect(Date.parse(out[i]!.timestamp)).toBeGreaterThan(Date.parse(out[i - 1]!.timestamp));
    }
    for (const p of out.filter((q) => q.source === "blended")) {
      const lead = (Date.parse(p.timestamp) - NOW) / 60_000;
      expect(lead).toBeGreaterThanOrEqual(90);
      expect(lead).toBeLessThanOrEqual(120);
    }
  });
});
