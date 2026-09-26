import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    globals: true,
    // Components are authored for the automatic JSX runtime and never import
    // React, but this transform emits classic `React.createElement` calls, so the
    // runtime must be in scope. See test.setup.js.
    setupFiles: ["./test.setup.js"],
  },
});
