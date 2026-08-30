# Getting started — Rainwatch NL

## Prerequisites

- Node.js 22+ — check with `node --version`
- pnpm 9+ — `corepack enable` or `npm install -g pnpm`

## Install

```bash
cd ~/src/rainwatch
pnpm install
```

Local development needs no Docker (SPEC §46).

## Environment

Create `.envrc` with the variables below and run `direnv allow`, or export
the same variables manually in your shell (SPEC §36):

```bash
export KNMI_API_KEY=...
export PUBLISH_PATH=$PWD/data/snapshots/latest.json
export LOCATION_LAT=52.37
export LOCATION_LON=4.87
export LOCATION_LABEL="Amsterdam West"
```

`data:update` refuses to start if required variables are missing or invalid —
configuration is validated fail-fast at process start (SPEC §36).

## The development loop

```bash
pnpm data:update    # ingest → fuse → extract → summarize → publish
pnpm data:inspect   # what does the latest snapshot say?
pnpm web:dev        # open the SPA against the published snapshot
```

`pnpm web:dev` serves the app that fetches `forecast.json` (see the Vite
config for the dev-server proxy target) and validates it against the shared
schema before rendering.

## data:update

Runs the full pipeline (SPEC §26): fetch radar + HARMONIE, normalize, resample
to the canonical timeline (5 min for 0–4h, 30 min for 4–24h), fuse, extract
events, summarize horizons, validate against `ForecastSnapshotSchema`, and
atomically publish `forecast.json` (tmp-write → validate → rename, SPEC §24).
Each run emits one structured JSON log line (SPEC §37).

Scheduled V1: cron every five minutes (SPEC §6.1, §45).

## data:doctor

Health report (SPEC §37). Example output:

```
KNMI API          OK
Radar latest      4m old
HARMONIE latest   38m old
Forecast snapshot 2m old
Publish target    OK
```

## data:inspect

Human-readable summary of the latest snapshot — debugging without the UI
(SPEC §43). Example output:

```
Amsterdam West

Now:
0.0 mm/h

Next rain:
10:45
moderate
35 min

1h:   0.8 mm
4h:   1.7 mm
12h:  3.2 mm
24h:  3.5 mm
```

## data:replay

Run the exact pipeline against stored source files instead of the network
(SPEC §44) — deterministic reproduction of event-detection, blending, or UI
bugs:

```bash
pnpm data:replay ./fixtures/rainy-day/
```

Replay input is a directory of source files (radar + HARMONIE) captured at one
point in time. Fixtures live in `packages/test-fixtures`.

## web:dev / web:build

- `pnpm web:dev` — Vite dev server with HMR.
- `pnpm web:build` — production PWA build: add to home screen, standalone
  display, cached app shell, offline last-known snapshot (SPEC §34). When
  offline, the app explicitly says "Offline — showing forecast downloaded
  18 minutes ago" and never presents the cached snapshot as current.

## Tests

```bash
pnpm test                      # unit + integration + contract (Vitest — run from repo root)
pnpm lint                      # Biome + import-boundary checks
pnpm typecheck                 # tsc --noEmit across the workspace
pnpm exec playwright test      # e2e against a fixture-generated forecast.json
```

Integration tests never touch the network (SPEC §39).
