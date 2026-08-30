import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RAIN_FORECAST_SNAPSHOT_SCHEMA } from "@rainwatch/forecast-contract";
import { describe, expect, it } from "vitest";

import { runReplay } from "../src/replay.js";

const FIXTURES = join(process.cwd(), "packages", "test-fixtures", "fixtures");
const NOW = Date.parse("2026-08-30T12:02:00Z");
const LOCATION = {
  id: "amsterdam-west",
  label: "Amsterdam West",
  latitude: 52.37,
  longitude: 4.85,
};

function replay(scenario: string) {
  const out = mkdtempSync(join(tmpdir(), "rw-replay-"));
  const snapshot = runReplay({
    fixtureDir: join(FIXTURES, scenario),
    outDir: out,
    nowEpochMs: NOW,
    location: LOCATION,
  });
  return { out, snapshot };
}

describe("offline replay e2e (SPEC §39, §41, §44)", () => {
  it("rainy-day: fixture → pipeline → valid forecast.json", () => {
    const { out, snapshot } = replay("rainy-day");
    expect(existsSync(join(out, "forecast.json"))).toBe(true);
    expect(() => RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(snapshot)).not.toThrow();

    const onDisk = JSON.parse(readFileSync(join(out, "forecast.json"), "utf8"));
    expect(() => RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(onDisk)).not.toThrow();
  });

  it("rainy-day: events derived, horizons computed, timeline has 89 points", () => {
    const { snapshot } = replay("rainy-day");
    expect(snapshot.timeline).toHaveLength(89);
    // near-term shower (+40 min) and small second shower; model events may add more
    expect(snapshot.events.length).toBeGreaterThanOrEqual(2);
    expect(snapshot.horizons.oneHour.from).toBe("2026-08-30T12:02:00.000Z");
    expect(snapshot.horizons.twentyFourHours.until).toBe("2026-08-31T12:02:00.000Z");
    expect(snapshot.sources).toHaveLength(2);
  });

  it("rainy-day: nextRain is the +40 min shower", () => {
    const { snapshot } = replay("rainy-day");
    expect(snapshot.nextRain).not.toBeNull();
    expect(snapshot.nextRain!.startsAt).toBe("2026-08-30T12:40:00.000Z");
  });

  it("gap-in-shower: brief dry gap merged into one event", () => {
    const { snapshot } = replay("gap-in-shower");
    const nearEvents = snapshot.events.filter((e) => Date.parse(e.startsAt) < NOW + 60 * 60_000);
    expect(nearEvents).toHaveLength(1);
  });

  it("drizzle-only: no rain events, dry 1h horizon", () => {
    const { snapshot } = replay("drizzle-only");
    expect(snapshot.events).toHaveLength(0);
    expect(snapshot.horizons.oneHour.rainExpected).toBe(false);
  });

  it("radar-missing: single source, snapshot still valid (SPEC §35)", () => {
    const { snapshot } = replay("radar-missing");
    expect(() => RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(snapshot)).not.toThrow();
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.sources[0]!.source).toBe("harmonie");
  });

  it("harmonie-missing: radar-only, snapshot still valid (SPEC §35)", () => {
    const { snapshot } = replay("harmonie-missing");
    expect(() => RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(snapshot)).not.toThrow();
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.sources[0]!.source).toBe("radar-nowcast");
  });
});
