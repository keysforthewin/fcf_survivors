import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
  features: "features/**/*.feature",
  steps: ["test/steps/**/*.ts", "test/fixtures/test.ts"],
});

export default defineConfig({
  testDir,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: [
    {
      command: "bun run ../server/test/bin/test-server.ts",
      url: "http://localhost:4000/health",
      reuseExistingServer: true,
      timeout: 15_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "bun run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
