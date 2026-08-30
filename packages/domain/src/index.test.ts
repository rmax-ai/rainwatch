import { describe, expect, it } from "vitest";

import { classifyIntensity, DEFAULT_INTENSITY_THRESHOLDS, type RainIntensity } from "./index.js";

// SPEC §38 intensity table
const CASES: Array<[number, RainIntensity]> = [
  [0, "none"],
  [0.2, "drizzle"],
  [1.0, "light"],
  [3.0, "moderate"],
  [8.0, "heavy"],
  [20.0, "very-heavy"],
];

describe("classifyIntensity (SPEC §9 thresholds)", () => {
  it.each(CASES)("%s mm/h → %s", (mm, expected) => {
    expect(classifyIntensity(mm)).toBe(expected);
  });

  it("handles boundary values exactly at thresholds", () => {
    expect(classifyIntensity(0.05)).toBe("drizzle");
    expect(classifyIntensity(0.0499)).toBe("none");
    expect(classifyIntensity(0.5)).toBe("light");
    expect(classifyIntensity(2)).toBe("moderate");
    expect(classifyIntensity(5)).toBe("heavy");
    expect(classifyIntensity(15)).toBe("very-heavy");
  });

  it("treats negative and non-finite input as none", () => {
    expect(classifyIntensity(-1)).toBe("none");
    expect(classifyIntensity(Number.NaN)).toBe("none");
    expect(classifyIntensity(Number.POSITIVE_INFINITY)).toBe("none");
  });

  it("respects custom thresholds (SPEC §9: thresholds must be configurable)", () => {
    const custom = {
      drizzleMin: 0.1,
      lightMin: 1,
      moderateMin: 3,
      heavyMin: 10,
      veryHeavyMin: 20,
    };
    expect(classifyIntensity(0.5, custom)).toBe("drizzle");
    expect(classifyIntensity(3, custom)).toBe("moderate");
    expect(classifyIntensity(25, custom)).toBe("very-heavy");
  });

  it("ships the SPEC §9 default thresholds", () => {
    expect(DEFAULT_INTENSITY_THRESHOLDS).toEqual({
      drizzleMin: 0.05,
      lightMin: 0.5,
      moderateMin: 2,
      heavyMin: 5,
      veryHeavyMin: 15,
    });
  });
});
