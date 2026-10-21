import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // The integration tests share one database, and the import queue in it is global: one file's
    // cleanup (import-queue.test.ts cancels every queued video) would break another's mid-test.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
