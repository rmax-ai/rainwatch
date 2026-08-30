import { describe, expect, it } from "vitest";

import { blendConfidence, calculateConfidence } from "../src/pipeline/confidence.js";

describe("calculateConfidence (SPEC §21 table)", () => {
  it("radar 0–60 min → high", () => {
    expect(calculateConfidence("radar-nowcast", 0)).toBe("high");
    expect(calculateConfidence("radar-nowcast", 30)).toBe("high");
    expect(calculateConfidence("radar-nowcast", 60)).toBe("high");
  });

  it("radar 61–120 min → medium", () => {
    expect(calculateConfidence("radar-nowcast", 61)).toBe("medium");
    expect(calculateConfidence("radar-nowcast", 90)).toBe("medium");
    expect(calculateConfidence("radar-nowcast", 120)).toBe("medium");
  });

  it("harmonie 2–12 h → medium", () => {
    expect(calculateConfidence("harmonie", 60)).toBe("medium");
    expect(calculateConfidence("harmonie", 720)).toBe("medium");
  });

  it("harmonie 12–24 h → low", () => {
    expect(calculateConfidence("harmonie", 721)).toBe("low");
    expect(calculateConfidence("harmonie", 1440)).toBe("low");
  });

  it("blended inherits the lower of the two", () => {
    expect(blendConfidence("high", "low")).toBe("low");
    expect(blendConfidence("medium", "medium")).toBe("medium");
    expect(blendConfidence("medium", "high")).toBe("medium");
    expect(blendConfidence("low", "low")).toBe("low");
  });
});
