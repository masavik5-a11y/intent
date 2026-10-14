import { useSyncExternalStore } from "react";

// Light and dark themes following the system, with a manual switch (PRD S5). The
// choice belongs to the device, so the PC can be dark while the phone follows its
// system; it is kept in localStorage, not in Convex. index.html applies the stored
// choice before the first paint with a copy of this logic: keep the two in step.

export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_CHOICES: readonly ThemeChoice[] = [
  "system",
  "light",
  "dark",
];

const STORAGE_KEY = "intent-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The page colour of each theme (src/styles/theme.css, --background). */
const PAGE_COLOUR: Record<Theme, string> = {
  light: "#ffffff",
  dark: "#0a0a0a",
};

function isThemeChoice(value: unknown): value is ThemeChoice {
  return THEME_CHOICES.some((choice) => choice === value);
}

/** The theme a choice comes to, given whether the system is dark. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === "system") return systemDark ? "dark" : "light";
  return choice;
}

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    // Storage can be blocked; then the system decides.
    return "system";
  }
}

function systemIsDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/** Puts a choice on the page: the `dark` class and the browser's theme colour. */
function applyTheme(choice: ThemeChoice): void {
  const theme = resolveTheme(choice, systemIsDark());
  document.documentElement.classList.toggle("dark", theme === "dark");
  // The two theme-color tags answer to the system's scheme; a manual choice sets
  // both to its own colour so the phone's status bar matches the page.
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    const media = meta.media.includes("dark") ? "dark" : "light";
    meta.content = PAGE_COLOUR[choice === "system" ? media : theme];
  }
}

const listeners = new Set<() => void>();

/** Saves the device's choice and applies it at once. */
export function setThemeChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Not remembered, but still applied for this visit.
  }
  applyTheme(choice);
  for (const listener of listeners) listener();
}

// Held for the life of the page: a MediaQueryList nothing refers to can be garbage
// collected, and its change listener with it.
let systemScheme: MediaQueryList | undefined;

/** Keeps the page in step with the system while the choice is "system". */
export function startThemeSync(): void {
  applyTheme(readThemeChoice());
  if (systemScheme !== undefined) return;
  systemScheme = window.matchMedia(DARK_QUERY);
  systemScheme.addEventListener("change", () => {
    applyTheme(readThemeChoice());
  });
}

/** The device's theme choice, for the switch in Settings. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, readThemeChoice);
}
