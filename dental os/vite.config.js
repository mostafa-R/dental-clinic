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
