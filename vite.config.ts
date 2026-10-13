import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Must come before the React plugin. Generates src/routeTree.gen.ts from src/routes/.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      // A hand-written service worker (src/sw.ts): push handlers need one in M4.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // A new version installs in the background, takes over, and reloads the page once.
      registerType: "autoUpdate",
      // Registered in src/main.tsx.
      injectRegister: false,
      injectManifest: {
        // The app shell. Of the fonts, only the Latin subsets: the others are fetched
        // on demand and would triple the download for nothing.
        // The icons in the manifest below are added by the plugin itself.
        globPatterns: ["**/*.{js,css,html,svg,ico}", "assets/*-latin-*.woff2"],
        globIgnores: ["logo-maskable.svg"],
      },
      manifest: {
        name: "Intent",
        short_name: "Intent",
        description:
          "A day planner that keeps the why next to the plan, and the plan next to what happened.",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // The light page colour. index.html sets theme-color for each theme.
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
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
