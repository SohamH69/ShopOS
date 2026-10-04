import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The FastAPI backend runs on :8000; in dev and preview the browser talks to it through this proxy,
// so the app always calls same-origin `/api/*` (exactly like production, where FastAPI serves dist/).
// Set SHOPOS_API_URL to point the proxy at another API, e.g. SHOPOS_API_URL=http://127.0.0.1:8123.
const apiTarget = process.env.SHOPOS_API_URL || "http://127.0.0.1:8000";
const apiProxy = {
  "/api": { target: apiTarget, changeOrigin: false },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    proxy: apiProxy,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // React, the router and TanStack Query change rarely: one long-cached vendor chunk.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@tanstack)[\\/]/.test(id)) {
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
