import { describe, expect, it } from "vitest";

import { loadConfig } from "./index.js";

const VALID_ENV = {
  KNMI_API_KEY: "test-key",
  PUBLISH_PATH: "/tmp/rw-publish",
  LOCATION_LAT: "52.37",
  LOCATION_LON: "4.85",
  LOCATION_LABEL: "Amsterdam West",
};

describe("loadConfig (SPEC §36 fail-fast)", () => {
  it("loads a valid environment", () => {
    const cfg = loadConfig(VALID_ENV);
    expect(cfg.location).toEqual({
      id: "amsterdam-west",
      label: "Amsterdam West",
      latitude: 52.37,
      longitude: 4.85,
    });
    expect(cfg.knmiApiKey).toBe("test-key");
    expect(cfg.publishPath).toBe("/tmp/rw-publish");
  });

  it("applies SPEC §9/§12/§20/§25 defaults", () => {
    const cfg = loadConfig(VALID_ENV);
    expect(cfg.intensityThresholds.drizzleMin).toBe(0.05);
    expect(cfg.events).toEqual({
      minIntensityMmPerHour: 0.1,
      minDurationMinutes: 10,
      mergeGapMinutes: 10,
    });
    expect(cfg.fusion).toEqual({ blendStartMin: 90, blendEndMin: 120 });
    expect(cfg.freshness).toEqual({ freshMaxAgeMinutes: 10, degradedMaxAgeMinutes: 20 });
  });

  it("fails immediately on missing required env", () => {
    expect(() => loadConfig({})).toThrow(/Invalid configuration/);
    expect(() => loadConfig({ KNMI_API_KEY: "k" })).toThrow(/PUBLISH_PATH/);
  });

  it("fails on invalid coordinates", () => {
    expect(() => loadConfig({ ...VALID_ENV, LOCATION_LAT: "95" })).toThrow();
  });

  it("coerces numeric env values", () => {
    const cfg = loadConfig({ ...VALID_ENV, LOCATION_LAT: "52", LOCATION_LON: "5" });
    expect(cfg.location.latitude).toBe(52);
  });

  it("uses Amsterdam West as default location", () => {
    const cfg = loadConfig({ KNMI_API_KEY: "k", PUBLISH_PATH: "/tmp/x" });
    expect(cfg.location.label).toBe("Amsterdam West");
    expect(cfg.location.latitude).toBe(52.37);
  });
});
