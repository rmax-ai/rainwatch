import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ForecastLocation, SourceForecast } from "@rainwatch/domain";
import type { RainForecastSnapshot } from "@rainwatch/forecast-contract";
import { RAIN_FORECAST_SNAPSHOT_SCHEMA } from "@rainwatch/forecast-contract";

import { buildSnapshot } from "./pipeline/buildSnapshot.js";
import { extractRainEvents } from "./pipeline/events.js";
import { fuseForecasts } from "./pipeline/fusion.js";
import { normalizePrecipitation } from "./pipeline/normalize.js";
import { resampleTimeline } from "./pipeline/resample.js";

export interface ReplayOptions {
  fixtureDir: string;
  outDir: string;
  nowEpochMs: number;
  location: ForecastLocation;
}

function loadSource(fixtureDir: string, name: "radar" | "harmonie"): SourceForecast | null {
  const p = join(fixtureDir, `${name}.json`);
  if (!existsSync(p)) return null;
  const parsed = JSON.parse(readFileSync(p, "utf8")) as SourceForecast;
  return parsed;
}

/**
 * SPEC §44 — replay mode: execute the EXACT pipeline against stored source
 * files, fully offline. No network access anywhere in this path.
 */
export function runReplay(opts: ReplayOptions): RainForecastSnapshot {
  const radar = loadSource(opts.fixtureDir, "radar");
  const harmonie = loadSource(opts.fixtureDir, "harmonie");

  const normalizedRadar = normalizePrecipitation(radar?.points ?? []);
  const normalizedHarmonie = normalizePrecipitation(harmonie?.points ?? []);

  const fused = fuseForecasts({
    radar: normalizedRadar,
    harmonie: normalizedHarmonie,
    nowEpochMs: opts.nowEpochMs,
  });

  const timeline = resampleTimeline(fused, opts.nowEpochMs);
  const events = extractRainEvents(fused);

  const sources = [radar?.source, harmonie?.source].filter(
    (s): s is NonNullable<typeof s> => s !== null && s !== undefined,
  );

  const snapshot = buildSnapshot({
    location: opts.location,
    timeline,
    events,
    sources,
    nowEpochMs: opts.nowEpochMs,
  });

  mkdirSync(opts.outDir, { recursive: true });
  const outPath = join(opts.outDir, "forecast.json");
  writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(snapshot);
}
