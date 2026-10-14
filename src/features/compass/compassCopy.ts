import { formatDayLabel } from "@shared/time";
import { toLocalMoment } from "@/lib/now";

// The Compass screen's words (PRD V1; the prompts are from PRINCIPLES.md).

export const VISION = {
  field: "vision",
  title: "The life I'm building",
  prompts: [
    "What does an ordinary Tuesday look like in three years if I use my time on purpose?",
    "What am I proud of having built?",
    "Who benefits from it?",
  ],
} as const;

export const ANTI_VISION = {
  field: "antiVision",
  title: "The life I refuse to drift into",
  prompts: [
    "If nothing changes, what does an ordinary Tuesday look like in three years?",
    "What would I be embarrassed to still be saying?",
    "What will I have stopped believing I can do?",
  ],
} as const;

/** "Last edited Wed 14 Oct 2026", on this device's calendar. */
export function lastEditedText(updatedAt: number): string {
  const { date } = toLocalMoment(new Date(updatedAt));
  return `Last edited ${formatDayLabel(date, { withYear: true })}`;
}
