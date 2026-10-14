import { useSyncExternalStore } from "react";
import { MINUTES_PER_HOUR, toDateKey, type LocalMoment } from "@shared/time";

/** The day and minute a Date falls on in the device's own time zone. */
export function toLocalMoment(instant: Date): LocalMoment {
  return {
    date: toDateKey({
      year: instant.getFullYear(),
      month: instant.getMonth() + 1,
      day: instant.getDate(),
    }),
    minute: instant.getHours() * MINUTES_PER_HOUR + instant.getMinutes(),
  };
}

/**
 * The device's current local day and minute. This is the only place in src/ that
 * reads the clock (docs/ARCHITECTURE.md, section 4); ESLint rejects it elsewhere.
 */
export function readNow(): LocalMoment {
  return toLocalMoment(new Date());
}

// One ticker for the whole app: every useNow() shares it, it fires just after each
// minute turns, and it catches up at once when the app comes back to the foreground
// (a phone asleep for an hour must not show the old minute).

const MS_PER_MINUTE = 60_000;
const listeners = new Set<() => void>();
let current: LocalMoment = readNow();
let timer: ReturnType<typeof setTimeout> | undefined;

function refresh(): void {
  const next = readNow();
  if (next.date === current.date && next.minute === current.minute) return;
  current = next;
  for (const listener of listeners) listener();
}

function scheduleTick(): void {
  // A few milliseconds past the minute, so readNow already sees the new one.
  const wait = MS_PER_MINUTE - (Date.now() % MS_PER_MINUTE) + 25;
  timer = setTimeout(() => {
    refresh();
    scheduleTick();
  }, wait);
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") refresh();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    refresh();
    scheduleTick();
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

/**
 * The device's local day and minute, updated once a minute. The only way components
 * read the clock (docs/ARCHITECTURE.md, section 4).
 */
export function useNow(): LocalMoment {
  return useSyncExternalStore(subscribe, () => current);
}
