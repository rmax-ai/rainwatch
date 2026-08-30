import { describe, expect, it } from "vitest";

import { extractRainEvents } from "../src/pipeline/events.js";

const DAY = "2026-08-30";
const P = (hhmm: string, mm: number) => ({
  timestamp: `${DAY}T${hhmm}:00Z`,
  precipitationMmPerHour: mm,
  source: "radar-nowcast" as const,
  confidence: "high" as const,
});

describe("extractRainEvents (SPEC §12)", () => {
  it("reproduces the SPEC §12 worked example exactly", () => {
    // 10:20 0.0 | 10:25 0.2 | 10:30 0.7 | 10:35 2.1 | 10:40 1.4 | 10:45 0.3 | 10:50 0.0
    const points = [
      P("10:20", 0.0),
      P("10:25", 0.2),
      P("10:30", 0.7),
      P("10:35", 2.1),
      P("10:40", 1.4),
      P("10:45", 0.3),
      P("10:50", 0.0),
    ];
    const events = extractRainEvents(points);
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.startsAt).toBe(`${DAY}T10:25:00.000Z`);
    expect(e.endsAt).toBe(`${DAY}T10:50:00.000Z`);
    expect(e.durationMinutes).toBe(25);
    expect(e.peakMmPerHour).toBe(2.1);
    expect(e.peakAt).toBe(`${DAY}T10:35:00.000Z`);
  });

  it("single shower → one event", () => {
    const events = extractRainEvents([
      P("10:00", 0),
      P("10:05", 1.5),
      P("10:10", 2),
      P("10:15", 0),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]!.startsAt).toBe(`${DAY}T10:05:00.000Z`);
    expect(events[0]!.endsAt).toBe(`${DAY}T10:15:00.000Z`);
  });

  it("two separated showers (dry gap ≥ mergeGap) → two events", () => {
    const points = [
      P("10:00", 0),
      P("10:05", 1.5),
      P("10:10", 1.2),
      P("10:15", 0),
      P("10:20", 0),
      P("10:25", 0),
      P("10:30", 1.8),
      P("10:35", 1.6),
      P("10:40", 0),
    ];
    const events = extractRainEvents(points);
    expect(events).toHaveLength(2);
  });

  it("brief dry gap inside one shower (< mergeGap) → one event", () => {
    const points = [
      P("10:00", 0),
      P("10:05", 2),
      P("10:10", 1.5),
      P("10:15", 0), // 5-min dry gap
      P("10:20", 1.8),
      P("10:25", 1.4),
      P("10:30", 0),
    ];
    const events = extractRainEvents(points);
    expect(events).toHaveLength(1);
  });

  it("drizzle-only below threshold → no events", () => {
    const points = [P("10:00", 0), P("10:05", 0.05), P("10:10", 0.02), P("10:15", 0)];
    expect(extractRainEvents(points)).toHaveLength(0);
  });

  it("rain continuing from current time → event starts at first wet point", () => {
    const points = [P("10:00", 2.5), P("10:05", 2.2), P("10:10", 1.9), P("10:15", 0)];
    const events = extractRainEvents(points);
    expect(events).toHaveLength(1);
    expect(events[0]!.startsAt).toBe(`${DAY}T10:00:00.000Z`);
  });

  it("drops events shorter than minDurationMinutes", () => {
    // single 5-min spike → duration 5 min < 10 min → dropped
    const points = [P("10:00", 0), P("10:05", 3), P("10:10", 0)];
    expect(extractRainEvents(points)).toHaveLength(0);
  });

  it("event confidence = lowest of member points", () => {
    const points = [
      P("10:00", 0),
      { ...P("10:05", 1), confidence: "high" as const },
      { ...P("10:10", 1.5), confidence: "medium" as const },
      { ...P("10:15", 1), confidence: "high" as const },
      P("10:20", 0),
    ];
    const events = extractRainEvents(points);
    expect(events[0]!.confidence).toBe("medium");
  });

  it("accumulatedMm sums values over the event window", () => {
    // 5-min steps: 0.2+0.7+2.1+1.4+0.3 = 4.7 mm/h × 5 min = 0.3917 mm
    const points = [
      P("10:20", 0.0),
      P("10:25", 0.2),
      P("10:30", 0.7),
      P("10:35", 2.1),
      P("10:40", 1.4),
      P("10:45", 0.3),
      P("10:50", 0.0),
    ];
    const e = extractRainEvents(points)[0]!;
    expect(e.accumulatedMm).toBeCloseTo((4.7 * 5) / 60, 3);
  });
});
