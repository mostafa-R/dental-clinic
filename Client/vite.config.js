import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: [],

    include: ["react-redux", "use-sync-external-store/shim/with-selector"],
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split vendor code and heavy libraries into separate chunks.
        //
        // The previous manualChunks only named recharts and dnd chunks, which
        // caused all shared React/router/Redux code to be hoisted into those
        // same chunks, making them mandatory entry dependencies. This meant
        // recharts+dnd (~462 KiB raw / ~132 KiB gzip) was loaded on every route
        // including /login and /pricing, even though they're only used by two
        // screens (AppointmentQueue pie, LiveQueue board).
        //
        // The fix: explicitly vendor React/Redux/router first, then isolate
        // recharts and dnd. The vendor chunk is loaded on every route (unavoidable)
        // but is small and stable. recharts/dnd are only fetched by routes that
        // actually import them.
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

          // Recharts and its d3 dependencies - only loaded by AppointmentQueue
          if (
            path.includes("/node_modules/recharts/") ||
            path.includes("/node_modules/d3-") ||
            path.includes("/node_modules/victory-vendor/") ||
            path.includes("/node_modules/react-smooth/")
          ) {
            return "recharts";
          }

          // DnD library - only loaded by LiveQueue
          if (path.includes("/node_modules/@hello-pangea/dnd/")) {
            return "dnd";
          }

          return undefined;
        },
      },
    },
  },
  server: {
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
});
