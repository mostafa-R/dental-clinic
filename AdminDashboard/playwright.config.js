import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  // Each test drives a full React SPA with charting bundles. Uncapped workers
  // starve each other on shared CI hardware and turn 1s waits into 30s timeouts.
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: { baseURL, trace: "on-first-retry" },
  // Serves the production build locally (CI builds first, then runs e2e).
  // Point PLAYWRIGHT_BASE_URL at a running server to reuse it instead.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npx vite preview --port 4173 --strictPort",
        url: "http://localhost:4173",
        reuseExistingServer: true,
        timeout: 60000,
      },
});
