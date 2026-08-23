import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../e2e",
  testMatch: "greenhouse-transfer.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
