import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The same `@/*` that tsconfig.json and Next resolve. Without it a test
      // importing app code would typecheck and then fail to load.
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
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
