import type { DateKey } from "@shared/time";

// "Not now" on "Welcome back. Plan today?" lasts for that day on this device: a device
// preference, kept in localStorage like the theme (ARCHITECTURE.md section 8).

const KEY = "intent-welcome-dismissed";

/** Whether "Welcome back" was put away today on this device. */
export function welcomeDismissedOn(today: DateKey): boolean {
  try {
    return window.localStorage.getItem(KEY) === today;
  } catch {
    return false;
  }
}

/** Puts "Welcome back" away for the rest of `today` on this device. */
export function dismissWelcome(today: DateKey): void {
  try {
    window.localStorage.setItem(KEY, today);
  } catch {
    // Storage blocked: it simply shows again next time.
  }
}
