// Import-boundary lint: enforces the package dependency direction.
//
// Layer model (SPEC §51 + TS_ARCHITECTURE.md):
//   web           → domain, forecast-contract
//   data          → domain, forecast-contract, config, test-fixtures
//   test-fixtures → anything (fixtures only)
//   forecast-contract → domain
//   config        → domain
//   domain        → nothing internal
//
// KNMI-specific code MUST NOT appear in web or domain (SPEC §14, §6.2).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ALLOW = {
  "@rainwatch/domain": new Set(),
  "@rainwatch/forecast-contract": new Set(["@rainwatch/domain"]),
  "@rainwatch/config": new Set(["@rainwatch/domain"]),
  "@rainwatch/test-fixtures": new Set([
    "@rainwatch/domain",
    "@rainwatch/forecast-contract",
    "@rainwatch/config",
  ]),
  "@rainwatch/data": new Set([
    "@rainwatch/domain",
    "@rainwatch/forecast-contract",
    "@rainwatch/config",
    "@rainwatch/test-fixtures",
  ]),
  "@rainwatch/web": new Set(["@rainwatch/domain", "@rainwatch/forecast-contract"]),
};

const IMPORT_RE = /(?:from\s*|import\s*\(|require\()\s*["'](@rainwatch\/[^"'/]+)/g;

function* tsFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry !== "node_modules" && entry !== "dist") yield* tsFiles(p);
    } else if (/\.(ts|tsx|mts|cts|mjs)$/.test(entry)) {
      yield p;
    }
  }
}

let violations = 0;
for (const [pkg, allowed] of Object.entries(ALLOW)) {
  const pkgDir = pkg.startsWith("@rainwatch/")
    ? join(
        ROOT,
        pkg.includes("/web") || pkg.includes("/data") ? "apps" : "packages",
        pkg.split("/")[1],
      )
    : null;
  if (!pkgDir) continue;
  for (const file of tsFiles(pkgDir)) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(IMPORT_RE)) {
      const target = match[1];
      if (target !== pkg && !allowed.has(target)) {
        console.error(`BOUNDARY: ${relative(ROOT, file)} imports ${target}`);
        violations += 1;
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} boundary violation(s). Fix or extend the allowlist deliberately.`);
  process.exit(1);
}
console.log("boundaries: ok");
