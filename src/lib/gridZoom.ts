import { useSyncExternalStore } from "react";
import { ZOOM_LEVELS, type ZoomLevel } from "@shared/grid";

// The day grid's zoom on the desktop (DESIGN.md section 3): Fit, Comfortable or
// Detailed. A device preference, like the theme (ARCHITECTURE.md section 8): kept in
// localStorage, so the PC's choice does not reach the phone, which always scrolls.

const STORAGE_KEY = "intent-zoom";
const listeners = new Set<() => void>();

function isZoomLevel(value: unknown): value is ZoomLevel {
  return ZOOM_LEVELS.some((level) => level === value);
}

export function readGridZoom(): ZoomLevel {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isZoomLevel(stored) ? stored : "fit";
  } catch {
    return "fit";
  }
}

export function setGridZoom(level: ZoomLevel): void {
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // Not remembered, but still used for this visit.
  }
  for (const listener of listeners) listener();
}

/** The device's zoom for the day grid. */
export function useGridZoom(): ZoomLevel {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, readGridZoom);
}
