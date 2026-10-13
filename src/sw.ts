/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

// The service worker (docs/ARCHITECTURE.md, section 11). For now it only makes the
// app shell available offline. Push handlers arrive in M4.

declare let self: ServiceWorkerGlobalScope;

// The app shell: every built file, listed here by vite-plugin-pwa at build time.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// A single-page app: every in-app address is answered with the cached index.html,
// so the app opens without a connection whichever screen is asked for.
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

// A new version takes over as soon as it is installed; the page then reloads once
// (registerType "autoUpdate" in vite.config.ts).
void self.skipWaiting();
clientsClaim();
