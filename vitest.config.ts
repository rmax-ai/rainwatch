import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // patterns are ROOT-relative; run `pnpm test` from repo root
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        // low-RAM machine: one worker, sequential test files
        singleFork: true,
      },
    },
  },
});
