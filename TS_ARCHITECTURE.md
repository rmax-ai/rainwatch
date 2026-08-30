# TS_ARCHITECTURE.md — Rainwatch NL

Monorepo layout, package dependency direction, layer model, and import
boundaries. Ground truth: `SPEC.md` §4, §14, §51.

## Workspace layout (SPEC §4)

```
rainwatch/
├── apps/
│   ├── data/    # ingestion pipeline → publishes forecast.json
│   └── web/     # mobile-first PWA, consumes forecast.json
├── packages/
│   ├── domain/             # shared domain model + pure transformations
│   ├── forecast-contract/  # canonical RainForecastSnapshot schema (Zod)
│   ├── config/             # thresholds + environment config
│   └── test-fixtures/      # representative KNMI files for offline tests
├── data/                   # runtime storage (gitignored): raw/, processed/, snapshots/
├── scripts/                # check-boundaries.mjs and repo tooling
└── docs/
```

Root files: `pnpm-workspace.yaml` (members + shared dependency `catalog`),
`package.json` (root scripts + devDependencies), `tsconfig.base.json`, root
`vitest.config.ts`.

## pnpm workspace catalog

Shared deps pinned once in `pnpm-workspace.yaml` so every package stays in
lockstep:

```yaml
packages:
  - packages/*
  - apps/*

catalog:
  typescript: ^5.7.3
  zod: ^4.0.5
  vitest: ^3.0.5
  "@biomejs/biome": ^2.1.3
  "@types/node": ^22.13.0
  tsx: ^4.19.0
```

Root devDependencies reference `catalog:`; intra-workspace edges use
`workspace:*`:

```jsonc
// apps/data/package.json
"dependencies": {
  "@rainwatch/domain": "workspace:*",
  "@rainwatch/forecast-contract": "workspace:*",
  "@rainwatch/config": "workspace:*",
  "zod": "catalog:"
}
```

## Package dependency direction

```
apps/web ──► packages/forecast-contract ──► packages/domain
                                                  ▲
apps/data ──► packages/domain                     │
apps/data ──► packages/forecast-contract          │
apps/data ──► packages/config                     │
apps/data ──► packages/test-fixtures ─────────────┘ (fixture helper types only)
```

- `packages/domain` — imports nothing internal. Pure types and transformations
  (SPEC §27); no KNMI concepts (SPEC §7).
- `packages/forecast-contract` — the Zod schema and TypeScript types of
  `RainForecastSnapshot` (SPEC §10). Imports `domain` types. Bumps
  `schemaVersion` on any breaking change (SPEC §40).
- `packages/config` — thresholds (intensity §9, event extraction §12, fusion
  weights §20) and environment validation (§36). Imports nothing internal.
- `packages/test-fixtures` — static files plus a `readFixture()` helper.
  Imports nothing (or domain types only). Never imported by `apps/web`.
- `apps/data` — may import every package. The only place KNMI-specific code
  exists, confined to `src/sources/<provider>/` (SPEC §14).
- `apps/web` — imports **only** `@rainwatch/forecast-contract`. It contains
  zero KNMI logic (SPEC §1, §53) and must not recompute horizon summaries
  (SPEC §13). It does not import `config` — the snapshot carries everything
  presentation needs.

## Layer model

```
┌────────────────────────────────────────────────────────────┐
│ apps/web                  presentation layer                │
│   fetch → validate → render. Zero KNMI logic.               │
├────────────────────────────────────────────────────────────┤
│ packages/forecast-contract   the published seam (SPEC §51)  │
│   RainForecastSnapshot schema — the only contract           │
├────────────────────────────────────────────────────────────┤
│ packages/domain              interpretation layer           │
│   pure transformations: fuse, classify, extract, summarize  │
├────────────────────────────────────────────────────────────┤
│ apps/data + packages/config  ingestion layer                │
│   adapters (KNMI specifics) → pipeline → publish            │
└────────────────────────────────────────────────────────────┘
```

The backend performs interpretation; the frontend performs presentation
(SPEC §5).

## Import boundaries

Enforced by `scripts/check-boundaries.mjs` (≈60 lines, no deps) inside
`pnpm lint`. It greps `from "@rainwatch/<name>"` imports per package and
checks them against an allowlist:

```javascript
// scripts/check-boundaries.mjs — sketch
const ALLOW = {
  "apps/web": ["@rainwatch/forecast-contract"],
  "apps/data": [
    "@rainwatch/domain",
    "@rainwatch/forecast-contract",
    "@rainwatch/config",
    "@rainwatch/test-fixtures",
  ],
  "packages/forecast-contract": ["@rainwatch/domain"],
  "packages/domain": [],
  "packages/config": [],
  "packages/test-fixtures": [],
};
```

Root wiring: `"lint": "biome check . && node scripts/check-boundaries.mjs"`.

## Source adapter isolation (SPEC §14)

Within `apps/data/src/sources/`, each provider is a closed directory:

```
apps/data/src/sources/
├── radar-nowcast/
│   ├── client.ts    # KNMI API/download — NetCDF/HDF5 types live here
│   ├── decoder.ts
│   ├── grid.ts
│   └── adapter.ts   # exports the ForecastSource; returns SourceForecast
└── harmonie/
    ├── client.ts
    ├── decoder.ts
    ├── grid.ts
    └── adapter.ts
```

Source-specific types must not leak outside these directories (SPEC §14);
adapters emit only `SourceForecast` (SPEC §15).

## Root scripts (SPEC §43)

```jsonc
"scripts": {
  "dev": "pnpm data:update && pnpm web:dev",
  "test": "vitest run",
  "lint": "biome check . && node scripts/check-boundaries.mjs",
  "typecheck": "pnpm -r --if-present run typecheck",
  "data:update": "tsx apps/data/src/cli.ts update",
  "data:doctor": "tsx apps/data/src/cli.ts doctor",
  "data:inspect": "tsx apps/data/src/cli.ts inspect",
  "data:replay": "tsx apps/data/src/cli.ts replay",
  "web:dev": "pnpm --filter @rainwatch/web dev",
  "web:build": "pnpm --filter @rainwatch/web build"
}
```

Vitest runs from the repo root (root-relative `include` patterns; root config
`pool: "forks"`, `singleFork: true`). Stub packages keep `src/index.ts` with
`export {};` so `pnpm -r typecheck` never hits TS18003.
