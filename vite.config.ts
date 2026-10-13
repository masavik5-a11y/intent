import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Keep in sync with the `paths` in tsconfig.app.json.
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@shared": path.resolve(import.meta.dirname, "./shared"),
    },
  },
  server: {
    // Convex Auth's SITE_URL points at this port, so do not drift to another one.
    port: 5173,
    strictPort: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "shared",
          include: ["shared/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "app",
          include: ["src/**/*.test.{ts,tsx}"],
          // Switch to jsdom when the first component test is written.
          environment: "node",
          // Vitest blanks CSS imports by default; theme.test.ts reads theme.css?raw.
          css: { include: [/src\/styles\/theme\.css/] },
        },
      },
      {
        extends: true,
        test: {
          name: "convex",
          include: ["convex/**/*.test.ts"],
          // Convex functions run in a V8 isolate, not in Node.
          environment: "edge-runtime",
        },
      },
    ],
  },
});
