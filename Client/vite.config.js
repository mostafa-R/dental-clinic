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
        // Split the two heavy, rarely-changing libraries into their own chunks.
        //
        // Without this they were inlined into whichever route chunk first
        // imported them (recharts landed in a ~257 kB "PieChart" chunk, dnd in
        // the clinic-operations chunk), so a change to unrelated app code
        // invalidated the chart/drag library bytes too and every user reloaded
        // them. As separate chunks they stay cached across deploys. Both are
        // still lazy: the chunk is only fetched by the routes that import it.
        //
        // This must be a function, not the `{ name: [ids] }` map: the bundler
        // here is rolldown, which only supports the callback form. d3 is grouped
        // with recharts because recharts is what pulls it in; leaving it out
        // would scatter d3 across the main chunk and re-create cross-chunk
        // imports, which is what we are trying to avoid.
        manualChunks(id) {
          const path = id.replace(/\\/g, "/");
          if (
            path.includes("/node_modules/recharts/") ||
            path.includes("/node_modules/d3-") ||
            path.includes("/node_modules/victory-vendor/") ||
            path.includes("/node_modules/react-smooth/")
          ) {
            return "recharts";
          }
          if (
            path.includes("/node_modules/@hello-pangea/dnd/") ||
            path.includes("/node_modules/@hello-pangea/dnd")
          ) {
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
