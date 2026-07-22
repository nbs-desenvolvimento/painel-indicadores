import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.spec.ts"],
    env: {
      JWT_SECRET: "test-only-secret-do-not-use-in-production",
    },
  },
});
