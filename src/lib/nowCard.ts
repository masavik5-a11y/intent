import { useSyncExternalStore } from "react";

// Whether the phone's now card is folded to one line (DESIGN.md section 2). A device
// preference, kept in localStorage like the theme and the zoom.

const STORAGE_KEY = "intent-now-card";
const listeners = new Set<() => void>();

function readFolded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "folded";
  } catch {
    return false;
  }
}

export function setNowCardFolded(folded: boolean): void {
  try {
    if (folded) localStorage.setItem(STORAGE_KEY, "folded");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not remembered, but still folded for this visit.
  }
  for (const listener of listeners) listener();
}

/** Whether this device keeps the now card folded to one line. */
export function useNowCardFolded(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, readFolded);
}
