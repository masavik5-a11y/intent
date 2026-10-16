import { defineConfig, devices } from "@playwright/test";

// The end-to-end smoke test (docs/ARCHITECTURE.md, section 13). It needs a real
// backend, so it runs on Filip's PC against the Convex dev deployment, never in
// `npm run check` or CI: `npm run e2e`. It signs in as the dev test account from
// .env.example (E2E_EMAIL and E2E_PASSWORD override it).

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // `npm run dev` pushes the functions to the dev deployment and serves the app; one
  // already running is used as it is.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
