import { defineConfig, devices } from "@playwright/test";

// End-to-end suite. Runs against a production build served by `vite preview`,
// reading from the live Convex deployment — the specs are read-only, they
// never create or mutate data.
//
// Two projects on purpose: the operators use this on a phone, so every spec
// runs at an iPhone-class viewport as well as on desktop.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npx vite preview --port 4173 --strictPort",
        url: "http://localhost:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          VITE_CONVEX_URL:
            process.env.VITE_CONVEX_URL ?? "https://tough-meadowlark-233.convex.cloud",
        },
      },
});
