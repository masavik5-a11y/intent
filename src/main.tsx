import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { RouterProvider } from "@tanstack/react-router";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import { startThemeSync } from "./lib/theme";
import { router } from "./router";

// Production builds only; in development the plugin makes this a no-op.
registerSW({ immediate: true });
startThemeSync();

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root element.");

createRoot(root).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <RouterProvider router={router} />
    </ConvexAuthProvider>
  </StrictMode>,
);
