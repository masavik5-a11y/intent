// Keyboard shortcuts (PRD T10; DESIGN.md section 8). One table: the keys each screen
// listens for, and the `?` overlay that lists them.

/** What a key does on the day view. */
export type DayCommand =
  | "previousDay"
  | "nextDay"
  | "add"
  | "log"
  | "previousBlock"
  | "nextBlock"
  | "open"
  | "done"
  | "partly"
  | "skip"
  | "undo"
  | "notFeeling"
  | "review";

/** What a key does anywhere in the app. */
export type AppCommand = "today" | "help";

export interface ShortcutRow {
  keys: readonly string[];
  does: string;
}

/** The overlay's table, in DESIGN.md section 8's order, grouped by where it works. */
export const SHORTCUT_GROUPS: readonly {
  title: string;
  rows: readonly ShortcutRow[];
}[] = [
  {
    title: "Anywhere",
    rows: [
      { keys: ["T"], does: "Go to today" },
      { keys: ["?"], does: "Show these shortcuts" },
      { keys: ["Esc"], does: "Close a panel or sheet" },
    ],
  },
  {
    title: "Day",
    rows: [
      { keys: ["←", "→"], does: "Previous or next day" },
      { keys: ["N"], does: "New block" },
      { keys: ["L"], does: "Log what happened" },
      { keys: ["↑", "↓"], does: "Select the previous or next block" },
      { keys: ["Enter"], does: "Open the selected block" },
      {
        keys: ["D", "P", "S"],
        does: "Done, Partly or Skip: the selected block, or the current one",
      },
      { keys: ["U"], does: "Undo its status" },
      { keys: ["X"], does: "Not feeling it, for the current block" },
      { keys: ["R"], does: "Review the day" },
    ],
  },
];

/** The modifier keys and target a shortcut cares about. */
export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

const DAY_KEYS: Record<string, DayCommand> = {
  arrowleft: "previousDay",
  arrowright: "nextDay",
  n: "add",
  l: "log",
  arrowup: "previousBlock",
  arrowdown: "nextBlock",
  enter: "open",
  d: "done",
  p: "partly",
  s: "skip",
  u: "undo",
  x: "notFeeling",
  r: "review",
};

/** The day view's command for a key, or null. Shift is fine; other modifiers are not. */
export function dayCommand(press: KeyPress): DayCommand | null {
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  return DAY_KEYS[press.key.toLowerCase()] ?? null;
}

/** The app-wide command for a key, or null. */
export function appCommand(press: KeyPress): AppCommand | null {
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  if (press.key === "?") return "help";
  if (press.key.toLowerCase() === "t") return "today";
  return null;
}

/**
 * Whether shortcuts should stay quiet: typing in a field, or a dialog or sheet is
 * open (it has keys of its own). DESIGN.md section 8.
 */
export function shortcutsPaused(target: EventTarget | null): boolean {
  const typing =
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
  return typing || document.querySelector("[role=dialog]") !== null;
}
