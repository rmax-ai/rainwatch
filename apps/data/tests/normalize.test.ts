import { describe, expect, it } from "vitest";

import { normalizePrecipitation } from "../src/pipeline/normalize.js";

const P = (timestamp: string, mm: number) => ({ timestamp, precipitationMmPerHour: mm });

describe("normalizePrecipitation (SPEC §27)", () => {
  it("sorts ascending by time", () => {
    const out = normalizePrecipitation([
      P("2026-08-30T14:10:00Z", 1),
      P("2026-08-30T14:00:00Z", 1),
    ]);
    expect(out.map((p) => p.timestamp)).toEqual(["2026-08-30T14:00:00Z", "2026-08-30T14:10:00Z"]);
  });

  it("clamps negative values to 0", () => {
    const out = normalizePrecipitation([P("2026-08-30T14:00:00Z", -2.5)]);
    expect(out[0]!.precipitationMmPerHour).toBe(0);
  });

  it("dedupes identical timestamps keeping the last", () => {
    const out = normalizePrecipitation([
      P("2026-08-30T14:00:00Z", 1),
      P("2026-08-30T14:00:00Z", 3),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.precipitationMmPerHour).toBe(3);
  });

  it("drops unparseable timestamps", () => {
    const out = normalizePrecipitation([P("not-a-date", 5), P("2026-08-30T14:00:00Z", 1)]);
    expect(out).toHaveLength(1);
  });

  it("does not mutate input", () => {
    const input = [P("2026-08-30T14:10:00Z", 1), P("2026-08-30T14:00:00Z", 2)];
    normalizePrecipitation(input);
    expect(input.map((p) => p.timestamp)).toEqual(["2026-08-30T14:10:00Z", "2026-08-30T14:00:00Z"]);
  });
});
