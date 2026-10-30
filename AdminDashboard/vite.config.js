import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split vendor code and heavy libraries into separate chunks
        // (mirrors Client/vite.config.js). Without this, React + Redux +
        // router hoisted into the same entry chunk as app code, and
        // recharts (~380 KiB raw / ~100 KiB gzip) landed as one huge chunk
        // pulled by every screen that renders a chart.
        //
        // The vendor chunk is loaded on every route (unavoidable) but is
        // small and stable across app changes; recharts is only fetched by
        // screens that actually import it (Dashboard, Analytics,
        // PlatformInsights).
        manualChunks(id) {
          const path = id.replace(/\\/g, "/");

          // Core vendor chunk: React, Redux, router - loaded on every route
          // but small (~50-80 KiB gzip) and stable across app changes
          if (
            path.includes("/node_modules/react/") ||
            path.includes("/node_modules/react-dom/") ||
            path.includes("/node_modules/react-redux/") ||
            path.includes("/node_modules/@reduxjs/toolkit/") ||
            path.includes("/node_modules/react-router-dom/") ||
            path.includes("/node_modules/use-sync-external-store/")
          ) {
            return "vendor";
          }

          // Recharts and its d3 dependencies - chart screens only
          if (
            path.includes("/node_modules/recharts/") ||
            path.includes("/node_modules/d3-") ||
            path.includes("/node_modules/victory-vendor/") ||
            path.includes("/node_modules/react-smooth/")
          ) {
            return "recharts";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:7000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:7000",
        ws: true,
      },
    },
  },
  optimizeDeps: {
    include: [],
  },
});
