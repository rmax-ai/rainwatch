# Decisions — Rainwatch NL

Decisions with rationale. Status: `decided` (locked by SPEC or this doc) or
`open` (research pending). Ground truth: `SPEC.md`.

## Decided

### D1. Monorepo layout (SPEC §4) — decided
pnpm workspace with `apps/data`, `apps/web`, `packages/domain`,
`packages/forecast-contract`, `packages/config`, `packages/test-fixtures`.
Rationale: two independently deployable apps sharing types, schema,
thresholds and fixtures; one repo keeps the contract honest (§40).

### D2. Timeline resolution 5 min / 30 min (SPEC §19) — decided
0–4h at 5-minute resolution; 4–24h at 30-minute resolution; the published
timeline is normalized to this single pair of resolutions.
Rejected: publishing source-native points and letting the client interpolate
(more payload, visualization complexity).
Rationale: payloads stay small while short-term detail is preserved; one
resolution simplifies the UI timeline.

### D3. Fusion strategy (SPEC §20) — decided
```
0–90 min:   100% radar
90–120 min: blend radar → HARMONIE
>120 min:   100% HARMONIE
```
Default blend weights (configurable): 90 min → 75% radar / 25% HARMONIE;
105 min → 50/50; 120 min → 25% radar / 75% HARMONIE, via
`value = radar * radarWeight + harmonie * harmonieWeight`.
Rejected: naive concatenation (discontinuity at the switch) and aggressive
averaging (hides source disagreement).
Rationale: near-term radar directly observes precipitation systems (§49);
blending mitigates model discontinuity; weights stay configurable so the
evaluation harness (§42) can tune them against observations.

### D4. Confidence heuristics (SPEC §21) — decided
```
radar 0–60m     high
radar 60–120m   medium
HARMONIE 2–6h   medium
HARMONIE 6–12h  medium
HARMONIE 12–24h low
```
Blended points inherit the lower or weighted confidence.
Rejected: implying probabilistic certainty where none exists; building an
ensemble for V1.
Rationale: deterministic, testable, honest. Replaced in V2 by ensemble
P(rain > 0.5 mm/h) (§55).

### D5. Freshness thresholds (SPEC §25) — decided
```
fresh:      age < 10 minutes
degraded:   10–20 minutes
stale:      >20 minutes
```
Calibrated to a 5-minute radar update cadence; thresholds must account for
source update frequency. The SPA must visibly show degraded/stale state; stale
data must never be displayed as current.

### D6. Event extraction thresholds (SPEC §12) — decided
```
minimum rain intensity:  0.1 mm/h
minimum event duration:  10 minutes
merge gaps shorter than: 10 minutes
```
Rationale: prevents five-minute fluctuations from creating separate events.
All three configurable.

### D7. Intensity thresholds (SPEC §9) — decided
```
none        < 0.05 mm/h
drizzle     0.05–0.5
light       0.5–2
moderate    2–5
heavy       5–15
very-heavy  >15
```
Boundary convention: intervals are lower-inclusive, upper-exclusive
(`[0.05, 0.5)` → drizzle). UX thresholds, not meteorological truth; stored
centrally in `packages/config`.

### D8. Spatial sampling: nearest first (SPEC §17) — decided
V1 uses `"nearest"`; `"median-3x3"` (median of 3×3 surrounding cells, or a
distance-weighted average) only when grid-boundary robustness is demonstrated.
Keep complexity out until validated.

### D9. Static snapshot publishing, no API (SPEC §23) — decided
`forecast.json` on object/static storage behind a CDN; the frontend is fully
static with no always-on application API.
Rationale: simplest operations for a personal product; the snapshot is the
contract (§51). Cost: freshness is bounded by publish cadence.

### D10. Filesystem storage, no database (SPEC §22) — decided
`data/raw` (24–48h), `data/processed` (7 days), `data/snapshots` (7–30 days +
archive). Do not build a database initially; filesystem/object storage is
enough for debugging and replay.

### D11. Atomic publish (SPEC §24) — decided
Write `forecast.tmp.json`, validate, atomically rename → `forecast.json`.
Object-storage variant: upload the versioned artifact
`forecast-<generatedAt>.json` first, then update `forecast.json`. Never
expose half-written snapshots.

### D12. Contract-first with schemaVersion (SPEC §10, §40) — decided
Zod schema in `packages/forecast-contract`; both apps parse with it. Any
schema-breaking change increments `schemaVersion`. This contract is the
long-term seam (§51).

### D13. Frontend: Preact proposed (SPEC §28) — proposed
Vite + Preact + TypeScript + PWA plugin; Vite + vanilla TypeScript is the
fallback if it reduces friction. The application is very small; Preact is
sufficient. Final call is open (O2).

### D14. UTC internally, Europe/Amsterdam at the UI boundary (SPEC §7, §49) — decided
No local-time arithmetic in `apps/data`; DST is handled by rendering in the
UI only.

### D15. What not to over-engineer (SPEC §50) — decided
Rejected for V1: Kafka, Redis, Postgres, Kubernetes, GraphQL, microservices,
event sourcing, workflow engines, agent frameworks. None solves a current
problem. The entire backend remains one executable; the architectural
separation is conceptual and package-based, not distributed-systems-based.

## Open decisions

### O1. KNMI dataset IDs + access pattern — ✅ RESOLVED (Phase 1 research, verified live 2026-08-30)

- **Radar nowcast:** `radar_forecast` v2.0 — HDF5, 25 steps × 5 min (0–120 min),
  1 km stereographic grid, ~410 KB/file, every 5 min. NOT the climatological
  `rad_nl25_rac_mfbs_5min`.
- **Model:** `uwcw-ha-det-nl-s1` v1.0 — UWC-West HARMONIE, NetCDF4, hourly
  60 h horizon, 2 km regular lat-lon, precip file
  `total-precipitation-accumulation-01h-gl` (~7.3 MB). NOT `harmonie_arome_cy43_p1`
  (now a historic archive post-UWC-West migration).
- **Auth:** Open Data API, registered API key (free; anonymous key shared +
  yearly rotation). Endpoint patterns + rate limits in
  `docs/research/knmi-data-access.md`.
- **V1 access pattern:** 5-min polling (≈48 req/h, ≪ quota). Cache HARMONIE by
  cycle — download only when a new cycle appears. KNMI Notification Service is
  the preferred evolution (§6.1), deferred.
- **Decode:** h5wasm for both formats (NetCDF4 is HDF5-backed).
- Verified grid reference points for Amsterdam West (52.37, 4.85): radar
  (col=343, row=398), HARMONIE (lat_i=187, lon_i=167). See
  `docs/research/radar-nowcast.md` and `docs/research/harmonie.md`.
- **Cycle latency reality:** HARMONIE cycle T+0 appears ≈2.5 h after init with
  no t+0 step (first step = +1 h). Radar covers the 0–2 h window — this
  matches the SPEC §20 fusion design (radar 0–90 min, blend 90–120 min,
  HARMONIE >120 min).

### O2. Frontend framework — open (Preact proposed)
Preact vs Vite + vanilla TypeScript (§28). Prefer whichever reduces
implementation friction; the app is one screen (§29).

### O3. Snapshot hosting target — open
Cloudflare R2, S3, GCS, or the same web static host (§45). For personal use,
the simplest option wins.

### O4. Deployment targets — open
rain-data: small VPS, Cloud Run, or Fly.io machine — cron every five minutes
for a polling V1, long-running process if KNMI notifications are adopted.
rain-web: Cloudflare Pages, Vercel, Netlify, or GitHub Pages (§45).

### O5. Evaluation harness scope — open
`ForecastEvaluationRecord` capture cadence and storage location (§42) — how
much to retain, and when to start tuning fusion weights, spatial sampling, and
rain thresholds against observations.
