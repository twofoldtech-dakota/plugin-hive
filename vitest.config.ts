import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    testTimeout: 10_000,
    setupFiles: ["src/test/setup.ts"],
  },
});
