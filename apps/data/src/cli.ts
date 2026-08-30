import { join } from "node:path";

import { loadConfig } from "@rainwatch/config";

import { runReplay } from "./replay.js";

const USAGE = `rainwatch data CLI (SPEC §43)

Usage:
  pnpm data:replay <fixtureDir> [--out <dir>] [--now <ISO-UTC>]
  pnpm data:update      (story 15)
  pnpm data:doctor      (story 15)
  pnpm data:inspect     (story 15)
`;

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "replay": {
      const fixtureDir = args[0];
      if (!fixtureDir) fail(USAGE);
      let out = join(fixtureDir, "out");
      let now = Date.now();
      for (let i = 1; i < args.length; i += 1) {
        if (args[i] === "--out" && args[i + 1]) {
          out = args[i + 1]!;
          i += 1;
        } else if (args[i] === "--now" && args[i + 1]) {
          now = Date.parse(args[i + 1]!);
          i += 1;
        }
      }
      const cfg = loadConfig({
        KNMI_API_KEY: "replay", // replay never calls KNMI; config requires the key to exist
        PUBLISH_PATH: out,
      });
      const snapshot = runReplay({
        fixtureDir,
        outDir: out,
        nowEpochMs: now,
        location: cfg.location,
      });
      console.log(
        `replay ok: ${snapshot.timeline.length} timeline points, ${snapshot.events.length} events → ${out}/forecast.json`,
      );
      return;
    }
    case "update":
    case "doctor":
    case "inspect":
      fail(`${cmd} is implemented in story 15.\n${USAGE}`);
      return;
    default:
      fail(USAGE);
  }
}

void main();
