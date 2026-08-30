# TS_SYSTEM_DESIGN_PATTERNS.md — Rainwatch NL

Domain-relevant patterns with concrete code. Ground truth: `SPEC.md`.

## 1. Source adapter interface (SPEC §14)

Every provider/product implements the same interface; the pipeline never
touches provider specifics.

```typescript
// packages/domain/src/source.ts
export interface ForecastContext {
  location: ForecastLocation;
}

export interface ForecastSource {
  id: string;
  fetch(context: ForecastContext): Promise<SourceForecast>;
}
```

Adapter skeleton (radar):

```typescript
// apps/data/src/sources/radar-nowcast/adapter.ts
// Isolation rule (SPEC §14): NetCDF/HDF5 and KNMI-specific types never leave
// this directory. Only SourceForecast crosses the boundary (SPEC §15).

import type {
  ForecastContext,
  ForecastSource,
  SourceForecast,
} from "@rainwatch/domain";
import { downloadLatestRadarFile } from "./client.js";
import { decodeRadarFile } from "./decoder.js";
import { extractPoint } from "./grid.js";

export const radarSource: ForecastSource = {
  id: "radar-nowcast",
  async fetch({ location }: ForecastContext): Promise<SourceForecast> {
    const file = await downloadLatestRadarFile();
    const raster = decodeRadarFile(file);          // raster type stays local
    const points = extractPoint(raster, location); // 25 × 5-min values (SPEC §16)
    return {
      source: {
        source: "radar-nowcast",
        runGeneratedAt: raster.runGeneratedAt,
        fetchedAt: new Date().toISOString(),
        dataset: file.datasetId,
      },
      points,
    };
  },
};
```

`extractPoint` applies the configured `SpatialSamplingStrategy` — `"nearest"`
(V1) or `"median-3x3"` (V1.1) — and never loads the full raster into memory
(SPEC §16-17).

## 2. Pipeline as pure-function composition (SPEC §26-27)

`updateForecast()` is orchestration only; every transformation is a pure
function. From SPEC §26:

```typescript
async function updateForecast() {
  const location = config.locations[0];

  const [radar, harmonie] = await Promise.all([
    radarSource.fetch(location),
    harmonieSource.fetch(location),
  ]);

  const normalized = normalizeSources({ radar, harmonie });
  const timeline = fuseForecasts(normalized);
  const events = extractRainEvents(timeline);
  const snapshot = buildSnapshot({
    location,
    timeline,
    events,
    sources: [radar.metadata, harmonie.metadata],
  });

  validateSnapshot(snapshot);
  await publishSnapshot(snapshot);
}
```

The pure-function list (SPEC §27) — all deterministic, no network:

```
normalizePrecipitation()  resampleTimeline()       fuseForecasts()
classifyIntensity()       extractRainEvents()      calculateAccumulation()
summarizeHorizon()        calculateConfidence()    buildSnapshot()
```

This shape is the replay target: swap the source fetchers for fixture readers
and the same composition runs offline (SPEC §44).

## 3. Atomic publish via tmp + rename (SPEC §24)

Never expose half-written snapshots.

```typescript
// apps/data/src/publish.ts
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RainForecastSnapshot } from "@rainwatch/forecast-contract";

export async function publishSnapshot(
  snapshot: RainForecastSnapshot,
  publishPath: string,
): Promise<void> {
  const tmp = path.join(path.dirname(publishPath), "forecast.tmp.json");
  await writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8"); // write
  // validation happened upstream in updateForecast() (validateSnapshot)
  await rename(tmp, publishPath); // atomic replace
}
```

Object-storage variant (SPEC §24): upload the versioned artifact
`forecast-<generatedAt>.json` first, then overwrite `forecast.json`.

## 4. Last-known-good snapshot retention (SPEC §35)

Never overwrite a good snapshot with invalid data; never fail the whole
system when one source is down.

```typescript
// apps/data/src/publish.ts
import { ForecastSnapshotSchema } from "@rainwatch/forecast-contract";
import { log } from "./log.js";

export async function publishIfValid(
  snapshot: unknown,
  publishPath: string,
): Promise<void> {
  const parsed = ForecastSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    log({ event: "publish_skipped_invalid", reason: parsed.error.message });
    return; // previous valid snapshot stays in place
  }
  await publishSnapshot(parsed.data, publishPath);
}
```

Missing-source behavior (SPEC §35): fuse whatever fetched successfully,
include `ForecastSourceMetadata` only for available sources, and let the
horizon summaries reflect the gap (e.g. "24h forecast unavailable/degraded").
Last-known-good also powers the frontend: a cached snapshot is shown with a
stale warning when the fetch fails (SPEC §34-35).

## 5. Replay pattern (SPEC §44)

`pnpm data:replay ./fixtures/rainy-day/` runs the exact pipeline against
stored source files. Implement by injecting the source fetchers:

```typescript
// apps/data/src/replay.ts
export async function replayFrom(dir: string): Promise<void> {
  const radar = readLocalSource(dir, "radar");
  const harmonie = readLocalSource(dir, "harmonie");
  // identical composition to updateForecast(), minus network
}
```

Because transformations are pure and sources are files, replays are
deterministic — reproducing event-detection bugs, weird radar transitions,
blending errors, and UI bugs without depending on current weather (SPEC §44).

## 6. Freshness semantics (SPEC §25)

Every snapshot carries `sourceGeneratedAt`, `generatedAt`, `expiresAt`:

```typescript
// packages/domain/src/freshness.ts
export type Freshness = "fresh" | "degraded" | "stale";

export function classifyFreshness(ageMs: number): Freshness {
  if (ageMs < 10 * 60_000) return "fresh";    // age < 10 minutes
  if (ageMs < 20 * 60_000) return "degraded"; // 10–20 minutes
  return "stale";                             // > 20 minutes
}
```

`apps/web` classifies freshness from `generatedAt` and renders a visible
degraded/stale state (SPEC §25). Offline it says "Offline — showing forecast
downloaded 18 minutes ago"; a cached snapshot must never look current
(SPEC §34).

## 7. Event extraction (SPEC §12)

Consecutive precipitation points → semantic events, with configurable
thresholds (min intensity 0.1 mm/h, min duration 10 min, merge gaps < 10 min):

```typescript
// packages/domain/src/events.ts
export interface EventExtractionConfig {
  minimumIntensityMmPerHour: number; // 0.1
  minimumDurationMinutes: number;    // 10
  mergeGapMinutes: number;           // 10
}
```

Gaps shorter than `mergeGapMinutes` merge the flanking rain into one event —
five-minute fluctuations must not create separate events (SPEC §12).
