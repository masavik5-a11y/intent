import { weekdaysLabel, type RepeatRule } from "@shared/recurrence";
import { formatDayLabel, type DateKey } from "@shared/time";

// Repeat settings in block detail (PRD P3), worked out without React.

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const WEEKDAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** The chip for a weekday: one letter, and its full name for screen readers. */
export function weekdayChip(day: number): { letter: string; name: string } {
  return {
    letter: WEEKDAY_LETTERS[day] ?? "?",
    name: WEEKDAY_FULL[day] ?? "",
  };
}

const SHOWN = 3;

/**
 * The quiet line after a rule is made or changed (decided 2026-10-15): which dates
 * were left out because something else is there. Null when none were.
 */
export function skippedLine(
  skipped: readonly { date: DateKey; blockedBy: string }[],
): string | null {
  const [only] = skipped;
  if (only === undefined) return null;
  if (skipped.length === 1) {
    return `Left out on ${formatDayLabel(only.date)}: ${only.blockedBy} is there.`;
  }
  const named = skipped
    .slice(0, SHOWN)
    .map((item) => `${formatDayLabel(item.date)} (${item.blockedBy})`)
    .join(", ");
  const more =
    skipped.length > SHOWN ? `, and ${skipped.length - SHOWN} more` : "";
  return `Left out where something else is: ${named}${more}.`;
}

/** "Repeats every day", "Repeats on weekdays", "Repeats on Mon, Wed, Fri · until Sun 20 Dec" */
export function repeatsSentence(rule: RepeatRule): string {
  const days = weekdaysLabel(rule.weekdays);
  const when =
    days === "Every day"
      ? "every day"
      : days === "Weekdays" || days === "Weekends"
        ? `on ${days.toLowerCase()}`
        : `on ${days}`;
  return rule.endDate === undefined
    ? `Repeats ${when}`
    : `Repeats ${when} · until ${formatDayLabel(rule.endDate)}`;
}
