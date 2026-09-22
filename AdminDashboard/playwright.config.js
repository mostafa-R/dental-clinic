import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: { baseURL },
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
