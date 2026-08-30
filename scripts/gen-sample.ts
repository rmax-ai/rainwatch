import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig } from "@rainwatch/config";
import { runReplay } from "@rainwatch/data";

// Regenerates apps/web/public/forecast.json from the rainy-day fixture,
// shifting the fixture's fixed base time (2026-08-30T12:00:00Z) to the current
// moment so the dev app demos live hero states instead of permanent "stale".
// Synthetic dev data, not live KNMI (see public/README.md).
const FIXTURE_NOW_MS = Date.parse("2026-08-30T12:02:00Z");
const now = Date.now();
const shift = now - FIXTURE_NOW_MS;

const tmp = mkdtempSync(join(tmpdir(), "rw-sample-"));
for (const name of ["radar.json", "harmonie.json"]) {
  const src = join("packages", "test-fixtures", "fixtures", "rainy-day", name);
  const raw = JSON.parse(readFileSync(src, "utf8")) as {
    source: unknown;
    points: Array<{ timestamp: string; precipitationMmPerHour: number }>;
  };
  const shifted = {
    source: raw.source,
    points: raw.points.map((p) => ({
      ...p,
      timestamp: new Date(Date.parse(p.timestamp) + shift).toISOString(),
    })),
  };
  writeFileSync(join(tmp, name), JSON.stringify(shifted, null, 2));
}

const cfg = loadConfig({ KNMI_API_KEY: "dev", PUBLISH_PATH: "apps/web/public" });
const snapshot = runReplay({
  fixtureDir: tmp,
  outDir: "apps/web/public",
  nowEpochMs: now,
  location: cfg.location,
});

console.log(
  `wrote apps/web/public/forecast.json (${snapshot.timeline.length} points, ${snapshot.events.length} events, nextRain ${snapshot.nextRain?.startsAt ?? "none"})`,
);
