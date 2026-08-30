# Rainwatch NL

[![pnpm](https://img.shields.io/badge/pnpm-9-orange?logo=pnpm&logoColor=white)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node](https://img.shields.io/badge/Node-22%2B-green?logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> What rain is coming at my location, and how much should I care?

Rainwatch ingests KNMI precipitation products — radar nowcast (0–2h) and
HARMONIE (2–24h) — fuses them into one canonical precipitation timeline for
your location, derives rain events and horizon summaries, and publishes a
static `forecast.json`. A mobile-first PWA reads that snapshot and answers at
a glance: is it raining now, when does rain start, how long and how intense —
over the next 1h, 4h, 12h, and 24h — and how fresh the forecast is.

Two independently deployable applications, one repository (SPEC §1):
**rain-data** performs the interpretation; **rain-web** performs the
presentation. They meet only at the published `RainForecastSnapshot` contract
(SPEC §51).

## Quickstart

```bash
pnpm install
pnpm dev
```

Requires Node.js 22+ and pnpm 9+. Local development needs no Docker
(SPEC §46).

## Environment variables

`apps/data` fails fast on invalid configuration (SPEC §36). Prefer the
`.envrc` + [direnv](https://direnv.net) pattern — create `.envrc`, then run
`direnv allow` once:

```bash
# .envrc — loaded automatically on `cd` into the repo
export KNMI_API_KEY=...
export PUBLISH_PATH=$PWD/data/snapshots/latest.json
export LOCATION_LAT=52.37
export LOCATION_LON=4.87
export LOCATION_LABEL="Amsterdam West"
```

| Variable | Required | Meaning |
|---|---|---|
| `KNMI_API_KEY` | yes | KNMI data access key — backend only, never exposed to the frontend (SPEC §48) |
| `PUBLISH_PATH` | yes | where `forecast.json` is written (SPEC §23-24) |
| `LOCATION_LAT` | yes | location latitude — a rounded coordinate is sufficient (SPEC §8) |
| `LOCATION_LON` | yes | location longitude |
| `LOCATION_LABEL` | no | display label; default `Amsterdam West` |

`.envrc` (and `.env`) are gitignored. Without direnv, export the same
variables in your shell.

## Commands (SPEC §43)

| Command | Purpose |
|---|---|
| `pnpm dev` | local dev loop: data update + web dev server |
| `pnpm test` | all unit, integration, and contract tests (Vitest) |
| `pnpm lint` | Biome + import-boundary checks |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm data:update` | full pipeline: ingest → fuse → extract → publish |
| `pnpm data:doctor` | health report (KNMI API, source ages, snapshot age, publish target) |
| `pnpm data:inspect` | human-readable summary of the latest snapshot |
| `pnpm data:replay <dir>` | replay the exact pipeline from stored source files (SPEC §44) |
| `pnpm web:dev` | Vite dev server |
| `pnpm web:build` | production PWA build |

## Architecture overview

```
KNMI radar (0–2h) ──┐
                    ├──► rain-data ──► RainForecastSnapshot ──► forecast.json ──► CDN ──► rain-web
HARMONIE (2–24h) ───┘
```

The backend performs interpretation; the frontend performs presentation
(SPEC §5). Full detail in [ARCHITECTURE.md](ARCHITECTURE.md).

## Documentation

| Doc | Contents |
|---|---|
| [SPEC.md](SPEC.md) | Ground-truth project specification (authoritative) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, data flow, trade-offs |
| [DECISIONS.md](DECISIONS.md) | Decisions + rationale + open decisions |
| [ROADMAP.md](ROADMAP.md) | Phases, first-useful-release, evolution path |
| [AGENTS.md](AGENTS.md) | Working conventions for humans and agents |
| [TS_DEVELOPMENT.md](TS_DEVELOPMENT.md) | TypeScript day-to-day idioms |
| [TS_ARCHITECTURE.md](TS_ARCHITECTURE.md) | Monorepo layout, layers, import boundaries |
| [TS_SYSTEM_DESIGN_PATTERNS.md](TS_SYSTEM_DESIGN_PATTERNS.md) | Domain design patterns |
| [docs/getting-started.md](docs/getting-started.md) | Install, dev loop, command walkthrough |

## License

MIT — see [LICENSE](LICENSE).
