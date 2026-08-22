import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // A real Postgres has to start and migrate; the default 5s is too tight.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // The database is shared state — parallel files would race on it.
    fileParallelism: false,
  },
});
