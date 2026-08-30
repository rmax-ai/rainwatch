# TS_DEVELOPMENT.md — Rainwatch NL

Day-to-day TypeScript idioms for this repository. Companion to `AGENTS.md`.
Pair with `TS_ARCHITECTURE.md` (layout, layers, import boundaries) and
`TS_SYSTEM_DESIGN_PATTERNS.md` (domain patterns). Ground truth: `SPEC.md`.

## Toolchain

- Node.js 22+, pnpm workspaces, TypeScript (catalog-pinned), Vitest 3, Biome.
- ESM everywhere: every `package.json` sets `"type": "module"`; relative
  imports use explicit `.js` extensions (`import { x } from "./y.js"`).
- CLI entry points run through `tsx` from the repo root; no per-package `bin`
  scripts (`node --experimental-strip-types` is fragile — see the
  ts-monorepo-bootstrap reference). Example root scripts:

  ```jsonc
  "scripts": {
    "data:update": "tsx apps/data/src/cli.ts update",
    "data:replay": "tsx apps/data/src/cli.ts replay"
  }
  ```

## Strict TypeScript settings

`tsconfig.base.json`, extended by every workspace member:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "verbatimModuleSyntax": true,
    "exactOptionalPropertyTypes": false,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true
  }
}
```

Consequences:

- `verbatimModuleSyntax: true` → type-only imports **must** use `import type`:

  ```typescript
  import type { ForecastPoint, RainIntensity } from "@rainwatch/domain";
  import { classifyIntensity } from "@rainwatch/domain"; // value import
  ```

  A plain `import { ForecastPoint }` is a compile error.
- `exactOptionalPropertyTypes: false` stays off — it fights Zod inference on
  optional fields such as `precipitationProbability?` (SPEC §7).
- Every workspace member needs its own tsconfig extending the base; stub
  packages need a real `src/index.ts` (`export {};`) or `tsc` fails with
  TS18003.
- Root typecheck is `pnpm -r --if-present run typecheck` (each package runs
  `tsc --noEmit`); the root `tsconfig.json` is IDE-only.

## Error handling

Two zones, two rules:

1. **Pure transformations never throw for domain reasons.** They are total
   functions over their inputs (SPEC §27). A point below the rain threshold is
   `"none"`, not an error. `buildSnapshot` receives already-validated pieces.
2. **I/O code throws typed errors; the CLI boundary catches and reports.**

```typescript
// apps/data/src/errors.ts
export class SourceUnavailableError extends Error {
  constructor(readonly sourceId: string, cause: unknown) {
    super(`source unavailable: ${sourceId}`, { cause });
  }
}
```

```typescript
// apps/data/src/cli.ts — the only place that converts errors to exit codes
try {
  await run(command, args);
} catch (err) {
  log({ event: "command_failed", command, error: String(err) });
  process.exit(1);
}
```

Never catch inside a pure function to "recover". When absence is a legitimate
outcome, return it as data: `nextRain: RainEvent | null` (SPEC §10) or a
discriminated union.

## Async patterns

Fetch sources concurrently (SPEC §26):

```typescript
const [radar, harmonie] = await Promise.all([
  radarSource.fetch(context),
  harmonieSource.fetch(context),
]);
```

But §35 says one failing source must not fail the whole system. Use
`Promise.allSettled` where partial results are acceptable:

```typescript
const settled = await Promise.allSettled([
  radarSource.fetch(context),
  harmonieSource.fetch(context),
]);

const available = new Map<string, SourceForecast>();
for (const [id, result] of [
  ["radar-nowcast", settled[0]],
  ["harmonie", settled[1]],
] as const) {
  if (result.status === "fulfilled") available.set(id, result.value);
  else log({ event: "source_fetch_failed", source: id });
}
// fusion proceeds over what is available; missing sources show as
// degraded/unavailable in the snapshot (SPEC §35)
```

Use `node:`-prefixed imports (`node:fs`, `node:path`) — unambiguous against
npm packages. Prefer `node:fs/promises` for async file I/O; the sync forms
are only for one-shot CLI startup.

## Testing with Vitest

Run from the repo root only. Root `vitest.config.ts` `include` patterns are
root-relative; per-package runs report "No test files found". The root config
uses `pool: "forks"` + `singleFork: true` (low-RAM friendly, no
worker-per-file forking).

**Unit tests** — pure functions, table-driven (`it.each`):

```typescript
// packages/domain/src/intensity.test.ts
import { describe, expect, it } from "vitest";
import { classifyIntensity } from "./intensity.js";

describe("classifyIntensity", () => {
  it.each([
    [0, "none"],
    [0.2, "drizzle"],
    [1.0, "light"],
    [3.0, "moderate"],
    [8.0, "heavy"],
    [16, "very-heavy"],
  ] as const)("%s mm/h → %s", (mmh, expected) => {
    expect(classifyIntensity(mmh)).toBe(expected);
  });
});
```

**Integration tests** — fixtures from `packages/test-fixtures`, never the
network (SPEC §38-39):

```typescript
// apps/data/tests/radar-decoder.integration.test.ts
import { readFixture } from "@rainwatch/test-fixtures";
const file = readFixture("radar/knmi-radar-nowcast-sample.nc");
// decoder → spatial extraction → normalized values,
// asserted against fixture metadata
```

**Contract tests** — both sides parse with the same schema (SPEC §40):

```typescript
ForecastSnapshotSchema.parse(output);   // apps/data — before publish
ForecastSnapshotSchema.parse(response); // apps/web — after fetch
```

**E2E** — Playwright drives the built SPA against a fixture-generated
`forecast.json`: hero status, next rain time, horizon selection, timeline
rendering, staleness banner (SPEC §41).

## Structured logging (SPEC §37)

One JSON object per line on stdout — machine-readable, no prose:

```typescript
// apps/data/src/log.ts
export function log(entry: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(entry) + "\n");
}

log({
  event: "forecast_updated",
  radarRun: "20260830T101500Z",
  harmonieRun: "20260830T090000Z",
  timelinePoints: 112,
  events: 3,
  durationMs: 1821,
});
```

Event names are stable strings (`forecast_updated`, `source_fetch_failed`,
`publish_skipped_invalid`). Tracked metrics (SPEC §37): last successful
ingestion, latest source age, pipeline duration, source download/parse
failures, published snapshot age — surfaced by `pnpm data:doctor`.

## Configuration validation, fail-fast (SPEC §36)

Validate the whole environment at process start, before any I/O; exit
immediately on invalid config:

```typescript
// packages/config/src/env.ts
import { z } from "zod";

export const envSchema = z.object({
  KNMI_API_KEY: z.string().min(1),
  PUBLISH_PATH: z.string().min(1),
  LOCATION_LAT: z.coerce.number().min(-90).max(90),
  LOCATION_LON: z.coerce.number().min(-180).max(180),
  LOCATION_LABEL: z.string().default("Amsterdam West"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // SPEC §36: fail immediately — never run with partially-valid config
    console.error(
      "Invalid configuration:",
      JSON.stringify(parsed.error.flatten(), null, 2),
    );
    process.exit(1);
  }
  return parsed.data;
}
```

Thresholds (intensity §9, event extraction §12, fusion weights §20) are also
config, not constants scattered through code — they live in `packages/config`.

## Date and time

- Store and compare UTC ISO-8601 strings with `Z` suffix everywhere internal
  (SPEC §7, §49). Never format local time inside `apps/data`.
- Convert to `Europe/Amsterdam` only in `apps/web` at render time. The Intl
  API is enough; no date library:

  ```typescript
  // apps/web/src/format.ts
  const fmt = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
  });
  export const formatClock = (isoUtc: string): string =>
    fmt.format(new Date(isoUtc));
  ```

- Freshness derives from `generatedAt` / `sourceGeneratedAt` / `expiresAt`,
  never from download time (SPEC §25, §49).

## Formatting and linting

- Biome for format + lint: `biome check .` inside `pnpm lint`.
- `pnpm lint` also runs `node scripts/check-boundaries.mjs` (import-boundary
  allowlist — see `TS_ARCHITECTURE.md`).
- All three gates — `pnpm typecheck`, `pnpm lint`, `pnpm test` — must pass
  before a PR (SPEC §47).
