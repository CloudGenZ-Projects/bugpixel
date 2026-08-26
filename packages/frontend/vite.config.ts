/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev proxy: forward API + inspector requests to the backend so the SPA and
    // API share an origin during development (cookies/CSRF work as in prod).
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
      "/inspector": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
  },
});
