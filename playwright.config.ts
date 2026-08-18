import { defineConfig, devices } from "@playwright/test";

const hosted = process.env.ROLEPROWL_HOSTED_TEST === "true";
const hostedBaseUrl = process.env.ROLEPROWL_TEST_BASE_URL?.trim();
if (hosted && !hostedBaseUrl)
  throw new Error(
    "ROLEPROWL_TEST_BASE_URL is required for hosted smoke tests.",
  );
if (hostedBaseUrl && new URL(hostedBaseUrl).protocol !== "https:")
  throw new Error("ROLEPROWL_TEST_BASE_URL must use HTTPS.");
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: hostedBaseUrl ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
    extraHTTPHeaders: bypass
      ? {
          "x-vercel-protection-bypass": bypass,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: hosted
    ? undefined
    : {
        command: "node_modules/.bin/next dev --webpack --port 3100",
        url: "http://127.0.0.1:3100/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
