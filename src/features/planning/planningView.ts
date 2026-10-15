import { copyablePlan, ruleBlockCount } from "@shared/planning";
import {
  addDays,
  formatDayLabel,
  minutesToLabel,
  type DateKey,
} from "@shared/time";
import type { Doc } from "@/lib/api";

// Planning ahead (PRD P1, P2, P5; DESIGN.md section 7, "Plan tomorrow"), worked out
// without React.

/** "Plan tomorrow", "Plan today", or "Plan Sat 17 Oct". */
export function planTitle(date: DateKey, today: DateKey): string {
  if (date === addDays(today, 1)) return "Plan tomorrow";
  if (date === today) return "Plan today";
  return `Plan ${formatDayLabel(date)}`;
}

/** The main focus field's prompt (PRD P5): "What makes tomorrow a win?" */
export function focusPrompt(date: DateKey, today: DateKey): string {
  if (date === addDays(today, 1)) return "What makes tomorrow a win?";
  if (date === today) return "What makes today a win?";
  return `What makes ${formatDayLabel(date)} a win?`;
}

/**
 * The days offered at once to copy from: today (when planning another day), and the
 * same weekday a week before, which repeats a week's rhythm. Any other date is typed.
 */
export function copySources(
  to: DateKey,
  today: DateKey,
): { label: string; date: DateKey }[] {
  const sources: { label: string; date: DateKey }[] = [];
  if (to !== today) sources.push({ label: "Today", date: today });
  const weekBefore = addDays(to, -7);
  if (weekBefore !== today) {
    sources.push({
      label: `Last ${formatDayLabel(weekBefore).slice(0, 3)}`,
      date: weekBefore,
    });
  }
  return sources;
}

/**
 * What a copy from `from` would bring, before it is made: "3 blocks to copy.", with a
 * note when repeating blocks stay out because they come by themselves.
 */
export function copyPreview(
  blocks: readonly Doc<"blocks">[],
  from: DateKey,
  gridStartMin: number,
): string {
  const count = copyablePlan(blocks, from, gridStartMin).length;
  const fromRules = ruleBlockCount(blocks, from, gridStartMin);
  const main =
    count === 0
      ? `Nothing to copy from ${formatDayLabel(from)}.`
      : `${blockCount(count)} to copy from ${formatDayLabel(from)}.`;
  if (fromRules === 0) return main;
  return fromRules === 1
    ? `${main} 1 repeating block stays out; it comes by itself.`
    : `${main} ${fromRules} repeating blocks stay out; they come by themselves.`;
}

/** After copying: "Copied 3 blocks. 2 blocks didn't fit: Gym at 11:30, Edit at 14:00." */
export function copyResultLine(result: {
  copied: number;
  skipped: readonly { title: string; startMin: number }[];
}): string {
  const copied =
    result.copied === 0
      ? "Nothing was copied."
      : `Copied ${blockCount(result.copied)}.`;
  if (result.skipped.length === 0) return copied;
  const list = result.skipped
    .map((item) => `${item.title} at ${minutesToLabel(item.startMin)}`)
    .join(", ");
  return `${copied} ${blockCount(result.skipped.length)} didn't fit: ${list}.`;
}

function blockCount(count: number): string {
  return count === 1 ? "1 block" : `${count} blocks`;
}
