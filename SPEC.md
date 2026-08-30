# Rainwatch NL — Project Specification

> Ground-truth reference. Preserved verbatim from the original spec.
> Every downstream document references SPEC.md sections.

---

## 1. Executive synthesis

Build a single repository containing two independently deployable applications:

1. **rain-data** — ingests KNMI precipitation products, extracts data for configured locations, normalizes heterogeneous forecast sources into one canonical precipitation timeline, derives rain events and horizon summaries, and publishes a static JSON snapshot.
2. **rain-web** — a mobile-first PWA that reads the published snapshot and answers, at a glance, what rain is expected over the next 1 hour, 4 hours, 12 hours, and 24 hours.

The architectural boundary is the published `RainForecastSnapshot` JSON contract. The web application must contain no KNMI-specific logic. The backend must contain no presentation logic.

Initial scope is one fixed location in Amsterdam West. The system should be designed so additional locations, notification delivery, probabilistic forecasts, and phone-location integration can be added later without changing the fundamental architecture.

---

## 2. Goals

The primary user question is:

> What rain is coming at my location, and how much should I care?

The application should answer within one glance:

- Is it raining now?
- When will rain start?
- How long will it last?
- How intense will it be?
- What is expected during the next:
  - 1 hour
  - 4 hours
  - 12 hours
  - 24 hours
- How fresh and trustworthy is the forecast?

The system should prioritize short-horizon precipitation accuracy over general-purpose weather information.

---

## 3. Non-goals

V1 explicitly excludes:

- temperature
- wind
- UV
- generic weather icons
- multi-day forecasts
- user accounts
- arbitrary public location search
- GPS tracking
- route-aware rain prediction
- machine learning
- LLMs
- push notifications
- Kubernetes
- historical weather analytics
- weather-provider aggregation

These can be added later.

---

## 4. Repository layout

Use a pnpm monorepo.

```
rainwatch/
├── apps/
│   ├── data/
│   │   ├── src/
│   │   ├── tests/
│   │   └── package.json
│   │
│   └── web/
│       ├── src/
│       ├── public/
│       ├── tests/
│       └── package.json
│
├── packages/
│   ├── domain/
│   │   ├── src/
│   │   └── package.json
│   │
│   ├── forecast-contract/
│   │   ├── src/
│   │   └── package.json
│   │
│   ├── config/
│   └── test-fixtures/
│
├── data/
│   ├── raw/
│   ├── processed/
│   └── snapshots/
│
├── scripts/
├── docs/
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
└── README.md
```

Use Node.js 22+, TypeScript, pnpm and Vitest.

---

## 5. High-level architecture

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

The backend performs interpretation.
The frontend performs presentation.

---

## 6. Applications

### 6.1 `apps/data`

Responsibilities:

- discover new KNMI files
- download source files
- verify metadata
- decode meteorological formats
- extract precipitation around configured locations
- normalize measurements
- merge forecast sources
- derive rain events
- compute summary windows
- publish the latest snapshot
- retain enough recent source data for debugging
- report freshness and source health

It should be runnable both as:

```
pnpm data:update
```

and as a continuously running worker later.

For V1, a scheduled run every five minutes is acceptable if the chosen KNMI access pattern permits it.

The preferred production evolution is event-driven ingestion using KNMI's notification mechanism.

### 6.2 `apps/web`

Responsibilities:

- fetch `/forecast.json`
- validate it against the shared schema
- detect stale data
- present current rain state
- present next rain event
- display precipitation timeline
- provide horizon controls:
  - 1 h
  - 4 h
  - 12 h
  - 24 h
- work well as an installed PWA
- tolerate temporary backend/static-host failures

The SPA does not directly call KNMI.

---

## 7. Shared domain model

Put domain concepts in:

```
packages/domain
```

Do not encode KNMI concepts here.

**Forecast point**

```typescript
export interface ForecastPoint {
  timestamp: string;
  precipitationMmPerHour: number;
  precipitationProbability?: number;
  source:
    | "radar-nowcast"
    | "harmonie"
    | "blended";
  confidence:
    | "high"
    | "medium"
    | "low";
}
```

Internally use UTC timestamps.
Render local time in Europe/Amsterdam only at the UI boundary.

---

## 8. Location model

```typescript
export interface ForecastLocation {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}
```

V1 configuration:

```yaml
locations:
  - id: amsterdam-west
    label: Amsterdam West
    latitude: <configured latitude>
    longitude: <configured longitude>
```

The exact home address should not be required.
A rounded coordinate is sufficient.

---

## 9. Rain intensity classification

Represent intensity independently from source products.

```typescript
export type RainIntensity =
  | "none"
  | "drizzle"
  | "light"
  | "moderate"
  | "heavy"
  | "very-heavy";
```

Thresholds must be configurable.
Example initial thresholds:

```
none        < 0.05 mm/h
drizzle     0.05–0.5
light       0.5–2
moderate    2–5
heavy       5–15
very-heavy  >15
```

Treat these as UX thresholds, not meteorological truth.
Store thresholds centrally:

```
packages/config
```

---

## 10. Canonical published contract

Create this package:

```
packages/forecast-contract
```

Use Zod or equivalent runtime validation.

```typescript
export interface RainForecastSnapshot {
  schemaVersion: "1";
  location: ForecastLocation;
  generatedAt: string;
  sourceGeneratedAt: string;
  expiresAt: string;
  current: CurrentRainState;
  nextRain: RainEvent | null;
  events: RainEvent[];
  horizons: {
    oneHour: HorizonSummary;
    fourHours: HorizonSummary;
    twelveHours: HorizonSummary;
    twentyFourHours: HorizonSummary;
  };
  timeline: ForecastPoint[];
  sources: ForecastSourceMetadata[];
}
```

---

## 11. Current rain state

```typescript
export interface CurrentRainState {
  raining: boolean;
  precipitationMmPerHour: number;
  intensity: RainIntensity;
  confidence: Confidence;
}
```

---

## 12. Rain events

Convert consecutive precipitation points into semantic weather events.

```typescript
export interface RainEvent {
  id: string;
  startsAt: string;
  endsAt: string;
  peakAt: string;
  durationMinutes: number;
  peakMmPerHour: number;
  accumulatedMm: number;
  peakIntensity: RainIntensity;
  confidence: Confidence;
}
```

Rain event extraction should use configurable minimum thresholds.
For example:

```
minimum rain intensity:  0.1 mm/h
minimum event duration:  10 minutes
merge gaps shorter than: 10 minutes
```

This prevents five-minute fluctuations from creating separate events.

Example:

```
10:20  0.0
10:25  0.2
10:30  0.7
10:35  2.1
10:40  1.4
10:45  0.3
10:50  0.0
```

becomes:

```
Rain event
start       10:25
end         10:50
duration    25 min
peak        2.1 mm/h
peak time   10:35
```

---

## 13. Horizon summaries

```typescript
export interface HorizonSummary {
  from: string;
  until: string;
  status:
    | "dry"
    | "rain-possible"
    | "rain"
    | "showers"
    | "heavy-rain";
  rainExpected: boolean;
  precipitationProbability?: number;
  accumulatedMm: number;
  maxMmPerHour: number;
  dominantIntensity: RainIntensity;
  firstRainAt: string | null;
  rainDurationMinutes: number;
  confidence: Confidence;
}
```

Generate summaries for exactly:

```
now → +1h
now → +4h
now → +12h
now → +24h
```

Do not let the frontend recompute them.

---

## 14. Source adapters

Every provider/product implements the same interface.

```typescript
export interface ForecastSource {
  id: string;
  fetch(
    context: ForecastContext
  ): Promise<SourceForecast>;
}
```

Example adapters:

```
sources/
├── radar-nowcast/
│   ├── client.ts
│   ├── decoder.ts
│   ├── grid.ts
│   └── adapter.ts
│
└── harmonie/
    ├── client.ts
    ├── decoder.ts
    ├── grid.ts
    └── adapter.ts
```

Source-specific types must not leak outside their directories.

---

## 15. Raw source representation

Each adapter produces:

```typescript
interface SourceForecast {
  source: ForecastSourceMetadata;
  points: SourceForecastPoint[];
}

interface SourceForecastPoint {
  timestamp: string;
  precipitationMmPerHour: number;
}
```

Adapters should additionally expose useful provenance:

```typescript
interface ForecastSourceMetadata {
  source:
    | "radar-nowcast"
    | "harmonie";
  runGeneratedAt: string;
  fetchedAt: string;
  dataset: string;
  datasetVersion?: string;
}
```

---

## 16. Radar nowcast ingestion

Primary purpose:

> 0–120 minute precipitation forecast

Pipeline:

```
discover latest KNMI product
        ↓
download file
        ↓
decode NetCDF/HDF5/etc.
        ↓
identify timestamp dimensions
        ↓
transform coordinate if necessary
        ↓
find Amsterdam West grid cell
        ↓
extract 25 × 5-minute values
        ↓
convert units
        ↓
NormalizedForecastPoint[]
```

Do not load entire raster datasets into application memory if avoidable.
Extract only the relevant grid cell or small surrounding region.

---

## 17. Spatial extraction

Do not trust a single grid cell blindly.
Implement configurable spatial sampling.

V1:

```
nearest cell
```

V1.1:

```
3×3 surrounding cells
```

Possible aggregation:

```
median
```

or:

```
distance-weighted average
```

This can improve robustness around precipitation-cell boundaries.

Expose strategy:

```typescript
type SpatialSamplingStrategy =
  | "nearest"
  | "median-3x3";
```

Default:

```
nearest
```

Keep complexity out until validated.

---

## 18. HARMONIE ingestion

Purpose:

> 2–24 hour precipitation forecast

The HARMONIE adapter follows the same pipeline:

```
latest model run
     ↓
download appropriate forecast files
     ↓
decode
     ↓
extract Amsterdam West
     ↓
convert precipitation units
     ↓
normalize timestamps
     ↓
NormalizedForecastPoint[]
```

Do not expose model-specific forecast-step semantics outside the adapter.

---

## 19. Canonical timeline resolution

Use:

```
5-minute points: 0–2h
hourly or source-native points: >2h
```

For simplicity, normalize the published timeline to a single resolution:

```
5 minutes for 0–4h
30 minutes for 4–24h
```

Alternative:

> publish source-native points and let visualization interpolate.

Preferred V1:

```
0–4h:  5-minute resolution
4–24h: 30-minute resolution
```

This keeps payloads small while preserving short-term detail.

---

## 20. Forecast fusion

Do not simply concatenate radar and HARMONIE.

Initial fusion strategy:

```
0–90 min:   100% radar
90–120 min: blend radar → HARMONIE
>120 min:   100% HARMONIE
```

For overlap:

```
value = radar * radarWeight + harmonie * harmonieWeight;
```

Example:

```
90 min:   75% radar, 25% HARMONIE
105 min:  50 / 50
120 min:  25% radar, 75% HARMONIE
```

The exact weights should be configuration.

---

## 21. Confidence model

Start with deterministic heuristics.

```
radar 0–60m     high
radar 60–120m   medium
HARMONIE 2–6h   medium
HARMONIE 6–12h  medium
HARMONIE 12–24h low
```

Blended points inherit the lower or weighted confidence.

Do not imply probabilistic certainty where none exists.
Later replace this heuristic with ensemble probability.

---

## 22. Data lifecycle

Store only what helps debugging.

```
data/
├── raw/
│   ├── radar/
│   └── harmonie/
│
├── processed/
│   └── ...
│
└── snapshots/
    ├── latest.json
    └── archive/
```

Retention suggestions:

```
raw data:              24–48 hours
processed source data: 7 days
published snapshots:   7–30 days
```

Do not build a database initially.
Filesystem/object storage is enough.

---

## 23. Publishing

The canonical artifact is:

```
forecast.json
```

Recommended deployment:

```
rain-data
    ↓
object/static storage
    ↓
forecast.json
    ↓
CDN
    ↓
rain-web
```

Example:

```
https://weather.example.com/data/forecast.json
```

The frontend can therefore be fully static.
No always-on application API is required.

---

## 24. Atomic publishing

Never expose half-written snapshots.

Write:

```
forecast.tmp.json
```

Validate it.
Then atomically replace:

```
forecast.json
```

For object storage:
upload versioned artifact first:

```
forecast-20260830T101500Z.json
```

then update:

```
forecast.json
```

---

## 25. Freshness semantics

Every snapshot must expose:

```
sourceGeneratedAt
generatedAt
expiresAt
```

Define:

```
fresh:      age < 10 minutes
degraded:   10–20 minutes
stale:      >20 minutes
```

Actual thresholds should account for source update frequency.

The SPA must visibly show degraded/stale state.
Never silently display stale data as current.

---

## 26. Backend pipeline

The entire update flow:

```typescript
async function updateForecast() {
  const location = config.locations[0];

  const [radar, harmonie] = await Promise.all([
    radarSource.fetch(location),
    harmonieSource.fetch(location),
  ]);

  const normalized = normalizeSources({
    radar,
    harmonie,
  });

  const timeline = fuseForecasts(normalized);

  const events = extractRainEvents(timeline);

  const snapshot = buildSnapshot({
    location,
    timeline,
    events,
    sources: [
      radar.metadata,
      harmonie.metadata,
    ],
  });

  validateSnapshot(snapshot);

  await publishSnapshot(snapshot);
}
```

Keep this function understandable.
Most complexity belongs inside isolated transformations.

---

## 27. Pure functions

The following should be deterministic pure functions:

```
normalizePrecipitation()
resampleTimeline()
fuseForecasts()
classifyIntensity()
extractRainEvents()
calculateAccumulation()
summarizeHorizon()
calculateConfidence()
buildSnapshot()
```

They should require no network access.
This allows extensive deterministic testing.

---

## 28. Frontend architecture

Recommended:

- Vite
- Preact or React
- TypeScript
- PWA plugin

Preact is sufficient because the application is very small.

Alternative:

- Vite + vanilla TypeScript

Either is reasonable.
Prefer whichever reduces implementation friction.

---

## 29. Main mobile screen

The entire product can initially be one screen.

Structure:

```
┌─────────────────────────────┐
│ Amsterdam West              │
│ Updated 2 min ago           │
│                             │
│       RAIN IN 23 MIN        │
│                             │
│ Moderate · ~35 min          │
│ Peak 2.8 mm/h               │
│                             │
├─────────────────────────────┤
│  1h     4h     12h    24h  │
│                             │
│ Rain   Showers Some   Dry   │
│                             │
├─────────────────────────────┤
│                             │
│ precipitation timeline      │
│                             │
│      ╭───╮                  │
│ ─────╯   ╰────────────      │
│ now      1h       4h        │
│                             │
├─────────────────────────────┤
│ Next rain                   │
│ 10:45–11:20                 │
│                             │
│ Later                       │
│ 17:30–18:10                 │
└─────────────────────────────┘
```

---

## 30. Primary signal states

The hero section should use one of:

```typescript
type HeroState =
  | "dry"
  | "rain-later"
  | "rain-soon"
  | "raining"
  | "heavy-rain"
  | "stale";
```

Examples:

```
DRY FOR THE NEXT HOUR
RAIN IN ~25 MIN
RAIN STARTING SOON
RAINING NOW
HEAVY RAIN
FORECAST OUT OF DATE
```

Avoid ambiguous generic weather descriptions.

---

## 31. Horizon selector

Provide:

```
1h | 4h | 12h | 24h
```

Selecting a horizon changes:

- timeline viewport
- summary numbers
- listed events

Do not build four separate dashboards.
One visualization, four temporal zoom levels.

---

## 32. Timeline visualization

Show:

```
X-axis: time
Y-axis: precipitation intensity
```

For 1h and 4h:
show detailed bars or area values.

For 12h and 24h:
reduce visual granularity.

Represent forecast-source confidence subtly rather than introducing a complicated second chart.

Possible later feature:

```
solid:        high confidence
slightly faded: lower confidence
```

---

## 33. UI priorities

Information hierarchy:

1. rain now / next onset
2. time until rain
3. expected intensity
4. expected duration
5. immediate timeline
6. longer horizons
7. data freshness
8. model/source metadata

Source/model metadata should be hidden under a diagnostics/details section.

---

## 34. PWA requirements

Support:

- Add to Home Screen
- standalone display mode
- cached app shell
- offline last-known snapshot

Important distinction:
When offline, explicitly say:

```
Offline
Showing forecast downloaded 18 minutes ago
```

Do not make offline cache look current.

---

## 35. Error states

Handle:

**KNMI source unavailable**

Backend:

- retain previous valid snapshot
- mark source health degraded
- do not overwrite good snapshot with invalid data

**One source unavailable**

Example:

```
radar available
HARMONIE unavailable
```

Publish available data.
Mark:

```
24h forecast unavailable/degraded
```

Do not fail the whole system.

**Frontend cannot fetch snapshot**

If cached snapshot exists:
display it with stale warning.

Otherwise:

```
Forecast unavailable
```

---

## 36. Configuration

Use environment/config validation.

Example:

```
KNMI_API_KEY=...
PUBLISH_PATH=...
LOCATION_LAT=...
LOCATION_LON=...
LOCATION_LABEL=Amsterdam West
```

Application startup should fail immediately if required configuration is invalid.

---

## 37. Observability

Keep observability simple.

Structured log each run:

```json
{
  "event": "forecast_updated",
  "radarRun": "...",
  "harmonieRun": "...",
  "timelinePoints": 112,
  "events": 3,
  "durationMs": 1821
}
```

Important metrics:

- last successful ingestion
- latest source age
- pipeline duration
- source download failures
- parse failures
- published snapshot age

A health command is useful:

```
pnpm data:doctor
```

Example output:

```
KNMI API          OK
Radar latest      4m old
HARMONIE latest   38m old
Forecast snapshot 2m old
Publish target    OK
```

---

## 38. Testing strategy

**Unit tests**

Test pure transformations extensively.

Intensity:

```
0      → none
0.2    → drizzle
1.0    → light
3.0    → moderate
8.0    → heavy
```

Event extraction fixtures:

- single shower
- two separated showers
- brief dry gap inside one shower
- drizzle-only period
- rain continuing from current time

Horizons — test boundary conditions exactly at:

```
+1h
+4h
+12h
+24h
```

Fusion tests:

- radar dominates near horizon
- smooth transition
- HARMONIE dominates after overlap
- missing radar
- missing HARMONIE

**Integration tests**

Store representative KNMI files under:

```
packages/test-fixtures
```

Prefer small representative subsets rather than huge production files.

Test:

```
source file
   ↓
decoder
   ↓
spatial extraction
   ↓
normalized values
```

Integration tests must not require internet access.

**Contract tests**

Both applications import the same schema.

```typescript
ForecastSnapshotSchema.parse(output);       // backend
ForecastSnapshotSchema.parse(response);     // frontend
```

Any schema-breaking change requires incrementing:

```
schemaVersion
```

**End-to-end test**

Run:

```
fixture input
    ↓
data pipeline
    ↓
generated forecast.json
    ↓
SPA
```

Verify:

- hero status
- next rain time
- correct horizon
- timeline rendering
- staleness behavior

Use Playwright.

---

## 39. Integration tests

Store representative KNMI files under:

```
packages/test-fixtures
```

Prefer small representative subsets rather than huge production files.

Test:

```
source file
   ↓
decoder
   ↓
spatial extraction
   ↓
normalized values
```

Integration tests must not require internet access.

---

## 40. Contract tests

Both applications import the same schema.

Backend:

```typescript
ForecastSnapshotSchema.parse(output);
```

Frontend:

```typescript
ForecastSnapshotSchema.parse(response);
```

Any schema-breaking change requires incrementing:

```
schemaVersion
```

---

## 41. End-to-end test

Run:

```
fixture input
    ↓
data pipeline
    ↓
generated forecast.json
    ↓
SPA
```

Verify:

- hero status
- next rain time
- correct horizon
- timeline rendering
- staleness behavior

Use Playwright.

---

## 42. Evaluation harness

Because forecast fusion contains assumptions, preserve enough data to compare predictions with eventual observations.

Store periodically:

```typescript
interface ForecastEvaluationRecord {
  issuedAt: string;
  targetTimestamp: string;
  predictedMmPerHour: number;
  source: string;
  observedMmPerHour?: number;
}
```

Do not build sophisticated evaluation initially.
But preserving predictions allows later measurement of:

- rain/no-rain precision
- rain/no-rain recall
- onset timing error
- intensity error
- false alarm rate

This is especially useful when tuning:

- radar/HARMONIE blending
- spatial aggregation
- rain thresholds

---

## 43. CLI

Expose developer commands:

```
pnpm dev
pnpm test
pnpm lint
pnpm typecheck

pnpm data:update
pnpm data:doctor
pnpm data:inspect
pnpm data:replay

pnpm web:dev
pnpm web:build
```

Useful inspection command:

```
pnpm data:inspect
```

Output:

```
Amsterdam West

Now:
0.0 mm/h

Next rain:
10:45
moderate
35 min

1h:
0.8 mm

4h:
1.7 mm

12h:
3.2 mm

24h:
3.5 mm
```

This makes debugging independent of the UI.

---

## 44. Replay mode

Build replayability from the beginning.

```
pnpm data:replay ./fixtures/rainy-day/
```

It should execute the exact pipeline against stored source files.

This makes it possible to reproduce:

- incorrect event detection
- weird radar transition
- incorrect HARMONIE blending
- UI bugs

without depending on current weather.

---

## 45. Deployment

**rain-data**

Reasonable options:

- small VPS
- Cloud Run
- Fly.io machine
- container service

If using KNMI notifications later, prefer a long-running process.
For a polling/scheduled V1:

```
cron every five minutes
```

is operationally simpler.

**rain-web**

Deploy to:

- Cloudflare Pages
- Vercel
- Netlify
- GitHub Pages

Static hosting is sufficient.

**Snapshot storage**

Possible:

- Cloudflare R2
- S3
- GCS
- same web static host

For personal use, the simplest option wins.

---

## 46. Docker

Provide:

```
Dockerfile.data
Dockerfile.web
```

But local development should not require Docker.

```
pnpm install
pnpm dev
```

must be enough.

---

## 47. CI

GitHub Actions:

- install
- typecheck
- lint
- unit tests
- integration tests
- web build
- data build
- Playwright

For pull requests, no external KNMI credentials should be needed.

---

## 48. Security

The KNMI API key belongs only in rain-data.

Never expose it through:

- frontend environment variables
- browser network calls
- forecast.json
- client-side JavaScript

The SPA needs only read access to public/static forecast data.

Exact personal coordinates should ideally remain configuration on the backend.
The published location can use:

```
label: Amsterdam West
```

and optionally rounded coordinates.

---

## 49. Failure modes to design for

**Forecast-source disagreement**

Radar says dry; HARMONIE says rain.

Do not hide this through arbitrary aggressive averaging.
Prefer near-term radar because it directly observes precipitation systems.
Record the discrepancy for evaluation.

**Model discontinuity**

Mitigate through overlap blending.

**Light-rain noise**

Mitigate using:

- minimum intensity
- minimum duration
- short-gap merging

**Grid-cell boundary effects**

Potential future mitigation:

```
3×3 spatial sampling
```

**Stale model run**

Never infer freshness from download time alone.
Use source-generation/model-run timestamps.

**DST**

Keep internal timestamps UTC.
Convert only for presentation using:

```
Europe/Amsterdam
```

---

## 50. What not to over-engineer

Do not introduce:

- Kafka
- Redis
- Postgres
- Kubernetes
- GraphQL
- microservices
- event sourcing
- workflow engines
- agent frameworks

None solve a current problem.
The entire backend can remain one executable.
The architectural separation is conceptual and package-based, not distributed-systems-based.

---

## 51. Initial API boundary

The most important interface in the project is:

```
RainForecastSnapshot v1
```

Everything else should remain replaceable.
That gives the architecture:

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

This is the long-term seam.

---

## 52. Implementation phases

**Phase 1 — Vertical slice**

Implement:

```
hardcoded fixture
    ↓
domain pipeline
    ↓
forecast.json
    ↓
SPA
```

Acceptance:
The SPA correctly visualizes synthetic rain over all four horizons.

**Phase 2 — KNMI radar**

Implement:

- KNMI API
- radar file ingestion
- coordinate extraction
- 0–2h timeline

Acceptance:
The SPA displays real Amsterdam West short-term precipitation.

**Phase 3 — HARMONIE**

Implement:

- 2–24h forecast
- normalization

Acceptance:
A complete 24-hour timeline is available.

**Phase 4 — Fusion**

Implement:

- overlap blending
- confidence
- event extraction
- horizon summaries

Acceptance:
No visible discontinuity around the radar/model transition.

**Phase 5 — operational hardening**

Implement:

- freshness
- cached last-known-good snapshot
- source health
- diagnostics
- PWA
- CI
- deployment

---

## 53. V1 acceptance criteria

The project is complete when:

1. A backend process obtains real KNMI precipitation data for Amsterdam West.
2. Short-term radar forecasts cover the next two hours.
3. A model forecast extends the timeline through 24 hours.
4. Both sources produce one canonical precipitation timeline.
5. Rain events are derived automatically.
6. Summaries exist for 1h, 4h, 12h and 24h.
7. The backend publishes valid `forecast.json`.
8. The SPA has no KNMI-specific code.
9. The SPA loads comfortably on a phone.
10. The user can determine within approximately one second whether rain is imminent.
11. Data freshness is clearly visible.
12. Stale data can never be mistaken for a current forecast.
13. The system continues operating when one upstream source temporarily fails.
14. The full domain pipeline can run offline from fixtures.
15. Forecast outputs can be replayed for debugging.

---

## 54. Definition of the first useful release

Do not wait for every feature above.

The first genuinely useful release is:

```
rainwatch/

apps/data
├── KNMI radar adapter
├── one Amsterdam West location
├── event extraction
├── 0–2h forecast
└── forecast.json

apps/web
├── mobile PWA
├── rain now
├── rain starts in X minutes
├── next rain event
├── 1h timeline
└── data freshness
```

Ship that first.
Then add HARMONIE and the 4h/12h/24h horizons.

---

## 55. Evolution path

Once the basic system is reliable:

**V2 — probabilistic forecasts**

Replace heuristic confidence with ensemble precipitation probabilities.

Expose:

```
P(rain > 0.5 mm/h)
```

instead of only deterministic precipitation.

**V3 — alerts**

Add a third consumer of the existing contract:

```
rain-alerts
```

Rules:

```
rain starts within 30m
AND
expected intensity > threshold
AND
not already alerted
```

No changes required to ingestion or SPA.

**V4 — multiple locations**

```
home
office
dance studio
current location
```

Publish:

```
/forecast/amsterdam-west.json
/forecast/office.json
```

**V5 — current-location awareness**

Phone sends coarse location.
Backend evaluates the corresponding precipitation grid.
Avoid long-term precise location storage.

**V6 — personalized decision layer**

Eventually the output can become:

```
Dry for your 25-minute walk.
Leave before 18:20.
Rain expected around 18:35.
```

This should remain a consumer of the forecast system rather than contaminating the meteorological data pipeline.

---

## 56. Core design principles

1. KNMI-specific complexity stops at source adapters.
2. The canonical timeline is the product.
3. Derived rain events matter more than raw meteorological files.
4. Near-term radar outranks numerical forecasting.
5. Confidence decreases with forecast horizon.
6. Freshness is part of correctness.
7. Preserve provenance.
8. Prefer deterministic transformations that can be replayed.
9. Do not introduce infrastructure before there is a demonstrated requirement.
10. Optimize the phone UI for decisions rather than meteorological exploration.
