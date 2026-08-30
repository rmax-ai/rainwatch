# AGENTS.md — Rainwatch NL

Operating guide for humans and agents working in this repository.
Ground truth is `SPEC.md`; every convention below cites its section.
This file is the hub — the companion docs hold the depth (see References).

## Project DNA — ten principles (SPEC §56)

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

## Repository layout (SPEC §4)

pnpm monorepo, Node.js 22+, TypeScript, Vitest.

```
apps/data     — ingestion pipeline, publishes forecast.json (§6.1)
apps/web      — mobile-first PWA, reads forecast.json (§6.2)
packages/domain            — shared domain model + pure transformations, no KNMI concepts (§7, §27)
packages/forecast-contract — canonical RainForecastSnapshot schema, Zod (§10, §40)
packages/config            — thresholds + environment config (§9, §12, §20, §36)
packages/test-fixtures     — representative KNMI files for offline integration tests (§38-39)
data/         — runtime storage: raw/, processed/, snapshots/ (§22)
scripts/      — check-boundaries.mjs and repo tooling
docs/         — user-facing documentation
```

## Core conventions

- **UTC everywhere internally.** Convert to `Europe/Amsterdam` only at the UI
  boundary (SPEC §7, §49). Never infer freshness from download time; use
  source-generation/model-run timestamps (§49).
- **Pure deterministic transformations.** `normalizePrecipitation`,
  `resampleTimeline`, `fuseForecasts`, `classifyIntensity`,
  `extractRainEvents`, `calculateAccumulation`, `summarizeHorizon`,
  `calculateConfidence`, `buildSnapshot` are pure functions with no network
  access (SPEC §27).
- **Source-specific types never leak.** KNMI/NetCDF/HDF5 types stay inside
  `apps/data/src/sources/radar-nowcast/` and `.../harmonie/`; adapters emit
  only `SourceForecast` / `SourceForecastPoint` / `ForecastSourceMetadata`
  (SPEC §14-15).
- **Contract-first.** Both apps import the same Zod schema from
  `packages/forecast-contract`. Any schema-breaking change increments
  `schemaVersion` (SPEC §10, §40).
- **The backend interprets; the frontend presents** (SPEC §5). Horizon
  summaries are computed backend-side, never recomputed in the frontend (§13).
- **Don't over-engineer.** No Kafka/Redis/Postgres/Kubernetes/GraphQL/
  microservices/event sourcing/workflow engines/agent frameworks (SPEC §50).
  The backend remains one executable; separation is package-based, not
  distributed-systems-based.

## Execution conventions (SPEC §43)

CLI commands run via `tsx` at the repo root — no per-package `bin` scripts:

- `pnpm dev` — data update + web dev loop
- `pnpm test` / `pnpm lint` / `pnpm typecheck`
- `pnpm data:update` — full ingestion → publish
- `pnpm data:doctor` — health report (KNMI API, source ages, snapshot age, publish target)
- `pnpm data:inspect` — human-readable summary of the latest snapshot
- `pnpm data:replay <dir>` — exact pipeline against stored source files (§44)
- `pnpm web:dev` / `pnpm web:build`

Local development must not require Docker (SPEC §46).

## Testing requirements (SPEC §38-41)

- **Unit** — pure functions, extensively. Intensity mapping (0 → none, 0.2 →
  drizzle, 1.0 → light, 3.0 → moderate, 8.0 → heavy), event-extraction
  fixtures (single shower, two separated showers, brief dry gap, drizzle-only,
  rain continuing from now), horizon boundaries at exactly +1h/+4h/+12h/+24h,
  fusion cases (radar dominates, smooth transition, HARMONIE dominates,
  missing radar, missing HARMONIE).
- **Integration** — representative KNMI files in `packages/test-fixtures`;
  decode → spatial extraction → normalized values. Must not require internet.
- **Contract** — `ForecastSnapshotSchema.parse(output)` in the backend,
  `.parse(response)` in the frontend; same schema both sides.
- **E2E** — Playwright: fixture input → data pipeline → `forecast.json` → SPA;
  verify hero status, next rain time, horizon, timeline rendering, staleness.

## Architecture non-negotiables

- `apps/web` contains **zero KNMI logic**: it fetches, validates, and renders
  `forecast.json` only (SPEC §1, §53). It never calls KNMI (§6.2) and never
  sees `KNMI_API_KEY` (§48).
- `apps/data` contains **zero presentation logic**; it never formats times for
  Europe/Amsterdam and never recomputes what the snapshot already carries.
- `RainForecastSnapshot` is the boundary seam (SPEC §51). Everything behind it
  is replaceable.
- Never overwrite a good snapshot with invalid data — keep last-known-good
  (§35).

## TypeScript conventions (see TS_ARCHITECTURE.md)

- `verbatimModuleSyntax: true` — type-only imports must use `import type`.
- `exactOptionalPropertyTypes: false` — keep it off; it fights Zod inference.
- Vitest runs from the repo root only; root config uses `pool: "forks"` with
  `singleFork: true`.
- Every workspace member has a tsconfig extending `tsconfig.base.json`; stub
  packages need `src/index.ts` with `export {};` or `tsc` fails (TS18003).
- Dependency direction enforced by `scripts/check-boundaries.mjs` inside
  `pnpm lint`: web → forecast-contract → domain; data may import all packages.
- Shared deps pinned once in the pnpm workspace `catalog`; intra-workspace
  edges use `workspace:*`.

## References

- `SPEC.md` — ground truth (authoritative)
- `ARCHITECTURE.md` — system design, data flow, trade-offs
- `DECISIONS.md` — decisions + rationale + open decisions
- `ROADMAP.md` — phases, first-useful-release, evolution path
- `TS_DEVELOPMENT.md` — day-to-day TS idioms (errors, async, vitest, logging, config)
- `TS_ARCHITECTURE.md` — monorepo layout, layers, import boundaries
- `TS_SYSTEM_DESIGN_PATTERNS.md` — adapters, pipeline, publish, replay, freshness
- `README.md`, `docs/getting-started.md` — user-facing
