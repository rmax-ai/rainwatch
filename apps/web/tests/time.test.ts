import { describe, expect, it } from "vitest";

import { formatDuration, formatTime, formatTimeRange, relativeMinutes } from "../src/time.js";

describe("time formatting (SPEC §7: Europe/Amsterdam only at UI boundary)", () => {
  it("renders Amsterdam wall time (12:00 UTC → 14:00 CEST)", () => {
    expect(formatTime("2026-08-30T12:00:00Z", { hour: "2-digit", minute: "2-digit" })).toBe(
      "14:00",
    );
  });

  it("renders a wall-time range", () => {
    expect(formatTimeRange("2026-08-30T12:00:00Z", "2026-08-30T13:00:00Z")).toBe("14:00–15:00");
  });

  it("relativeMinutes: future positive, past negative", () => {
    const now = Date.parse("2026-08-30T12:00:00Z");
    expect(relativeMinutes("2026-08-30T12:25:00Z", now)).toBe(25);
    expect(relativeMinutes("2026-08-30T11:50:00Z", now)).toBe(-10);
  });

  it("formatDuration: minutes, whole hours, mixed, clamped", () => {
    expect(formatDuration(35)).toBe("35 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(80)).toBe("1 h 20 min");
    expect(formatDuration(-5)).toBe("0 min");
    expect(formatDuration(59.6)).toBe("1 h");
  });
});
