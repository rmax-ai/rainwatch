# Architecture — Rainwatch NL

## Problem statement

> What rain is coming at my location, and how much should I care? (SPEC §2)

Two independently deployable applications in one repository (SPEC §1):

- **rain-data** — ingests KNMI precipitation products (radar nowcast 0–2h,
  HARMONIE 2–24h), normalizes them into one canonical precipitation timeline
  for configured locations, derives rain events and horizon summaries, and
  publishes a static `forecast.json` snapshot.
- **rain-web** — a mobile-first PWA that reads the snapshot and answers at a
  glance: is it raining now, when does rain start, how long and how intense —
  over the next 1h, 4h, 12h, and 24h — and how fresh and trustworthy it is.

The architectural boundary is the published `RainForecastSnapshot` JSON
contract: the web app contains no KNMI logic; the backend contains no
presentation logic (SPEC §1).

## Design goals (SPEC §2-3)

- Short-horizon precipitation accuracy over general-purpose weather.
- One-glance answers; the phone UI is optimized for decisions, not
  meteorological exploration (§56.10).
- Freshness is part of correctness (§56.6) — stale data must never look
  current.
- Everything replaceable except the published contract (§51).
- Deterministic, replayable transformations (§56.8, §44).

V1 non-goals (§3): temperature, wind, UV, generic weather icons, multi-day
forecasts, user accounts, public location search, GPS tracking, route-aware
prediction, ML, LLMs, push notifications, Kubernetes, historical analytics,
provider aggregation.

## Pipeline (SPEC §5)

```
                         KNMI

              ┌───────────┴───────────┐
              │                       │
        Radar nowcast             HARMONIE
          0–2 hours               0–24+ hours
              │                       │
              └───────────┬───────────┘
                          │
                    Source adapters
                          │
                          ▼
                   normalized points
                          │
                          ▼
                    spatial select
                          │
                          ▼
                   forecast fusion
                          │
                          ▼
                  event extraction
                          │
                          ▼
                horizon summarization
                          │
                          ▼
               RainForecastSnapshot
                          │
                  forecast.json
                          │
                          ▼
                    static hosting
                          │
                          ▼
                       rain-web
```

The backend performs interpretation. The frontend performs presentation
(SPEC §5).

## Component breakdown

### Source adapters (SPEC §14-18)

One `ForecastSource` interface (`id`, `fetch(context)`), two implementations,
each a closed directory `client.ts / decoder.ts / grid.ts / adapter.ts`:

- `sources/radar-nowcast/` — 0–120 min. Discovers the latest KNMI product,
  downloads, decodes, extracts the configured grid cell (25 × 5-minute
  values), converts units (§16). Rasters are never fully loaded into memory.
- `sources/harmonie/` — 2–24h. Same pipeline shape: latest model run →
  download → decode → extract → normalize timestamps (§18).

Source-specific types never leak outside their directories (§14); adapters
emit only `SourceForecast` / `ForecastSourceMetadata` (§15).

### Spatial select (SPEC §17)

`SpatialSamplingStrategy = "nearest" | "median-3x3"`. V1 default: `nearest`;
`median-3x3` deferred until grid-boundary robustness is demonstrated.

### Forecast fusion (SPEC §20)

```
0–90 min:    100% radar
90–120 min:  blend radar → HARMONIE   (90m: 75/25, 105m: 50/50, 120m: 25/75)
>120 min:    100% HARMONIE
```

`value = radar * radarWeight + harmonie * harmonieWeight`; weights are
configuration. Near-term radar outranks numerical forecasting (§56.4);
overlap blending mitigates model discontinuity (§49).

### Event extraction (SPEC §12)

Configurable thresholds — minimum intensity 0.1 mm/h, minimum duration 10
minutes, merge gaps shorter than 10 minutes — turn the timeline into
`RainEvent`s, preventing five-minute fluctuations from becoming separate
events.

### Horizon summarization (SPEC §13)

Summaries computed exactly for now → +1h / +4h / +12h / +24h, backend-side
only. `HorizonSummary` carries status (`dry | rain-possible | rain | showers |
heavy-rain`), accumulation, max intensity, dominant intensity, first rain,
rain duration, confidence. The frontend never recomputes them (§13).

### Publishing (SPEC §22-24)

- Canonical artifact `forecast.json`, written under `data/snapshots/`.
- Atomic: write `forecast.tmp.json`, validate, rename (filesystem); versioned
  artifact + pointer update (object storage). Never expose half-written
  snapshots.
- Retention: raw 24–48h, processed 7d, snapshots 7–30d. No database (§22).
- One source down → publish available data, mark degraded (§35). Invalid
  snapshot → keep last-known-good (§35).

## Data flow

1. A scheduled run (`pnpm data:update`; cron every five minutes for a polling
   V1, §6.1) resolves config — location, thresholds, env vars, fail-fast on
   invalid config (§36).
2. Radar + HARMONIE fetched concurrently (§26).
3. Pure pipeline: `normalizeSources` → resample (5 min for 0–4h, 30 min for
   4–24h, §19) → `fuseForecasts` (§20) → `classifyIntensity` (§9) →
   `extractRainEvents` (§12) → `summarizeHorizon` (§13) → `calculateConfidence`
   (§21) → `buildSnapshot` (§26).
4. `validateSnapshot` — `ForecastSnapshotSchema.parse` (§40).
5. Atomic publish (§24); one structured JSON log line per run (§37).
6. `rain-web` fetches `forecast.json` over CDN/static hosting (§23), validates
   with the same schema, renders; shows freshness state (§25) and, when
   offline, the last-known snapshot with an explicit "Offline" label (§34).

## The seam: RainForecastSnapshot (SPEC §51)

```
KNMI radar ─────┐
                │
HARMONIE ───────┼─► rain-data
                │        │
future source ──┘        │
                         ▼
                RainForecastSnapshot
                         │
               ┌─────────┼─────────┐
               ▼         ▼         ▼
              SPA      alerts    widget
```

`RainForecastSnapshot v1` is the most important interface in the project;
everything else is replaceable (SPEC §51). V3 alerts and V4 multi-location are
additional consumers/producers of the same contract, requiring no ingestion or
SPA changes (§55).

## Trade-offs

| Decision | Chosen | Cost | SPEC |
|---|---|---|---|
| Timeline resolution | 5 min (0–4h), 30 min (4–24h) | loses sub-5-min detail beyond 4h; small payload, one resolution for the UI | §19 |
| Fusion | weighted blend in 90–120 min | heuristic weights; needs evaluation harness | §20, §42 |
| Confidence | deterministic heuristics | not probabilistic; replaced by ensembles in V2 | §21, §55 |
| Sampling | nearest cell | grid-boundary artifacts possible; median-3x3 later | §17 |
| Storage | filesystem/object, no DB | no ad-hoc queries; plenty for debugging and replay | §22 |
| Distribution | static snapshot, no API | freshness bounded by publish cadence; zero always-on infra | §23 |
| Sources | radar + HARMONIE only | model gap risk around the 2h transition; mitigated by blending | §16, §18 |
| Scheduling | cron every 5 min (V1) | bounded freshness; event-driven KNMI notifications later | §6.1, §45 |

## Failure modes designed for (SPEC §49)

- **Source disagreement** — near-term radar wins because it directly observes
  precipitation systems; the discrepancy is recorded for evaluation (§42).
- **Model discontinuity** — mitigated by overlap blending.
- **Light-rain noise** — minimum intensity + minimum duration + short-gap
  merging.
- **Grid-cell boundary effects** — future mitigation: 3×3 spatial sampling.
- **Stale model run** — freshness from source-generation/model-run
  timestamps, never from download time.
- **DST** — UTC internally; `Europe/Amsterdam` conversion only at the UI
  boundary.
