import { isSleepCategory } from "@shared/categories";
import { shiftRest, type ShiftResult } from "@shared/replan";
import {
  formatDuration,
  formatTimeRange,
  minutesToLabel,
  type DateKey,
  type LocalMoment,
} from "@shared/time";
import type { Doc } from "@/lib/api";

// Replanning's words (PRD T11), worked out without React.

/** The shifts offered at once, in minutes. */
export const SHIFT_CHOICES = [15, 30, 60, -15] as const;

/** "+15m", "+1h", "−15m". */
export function shiftLabel(minutes: number): string {
  return `${minutes < 0 ? "−" : "+"}${formatDuration(Math.abs(minutes))}`;
}

/** What a shift would do, said before it is done. */
export function shiftPreview(
  result: ShiftResult<Doc<"blocks">>,
  minutes: number,
): { text: string; canShift: boolean } {
  if ("moves" in result) {
    const count = result.moves.length;
    const where = result.moves
      .map(({ block, to }) => `${block.title} ${minutesToLabel(to.startMin)}`)
      .join(", ");
    const direction = minutes > 0 ? "later" : "earlier";
    return {
      text: `${count === 1 ? "1 block moves" : `${count} blocks move`} ${formatDuration(Math.abs(minutes))} ${direction}: ${where}.`,
      canShift: true,
    };
  }
  switch (result.problem) {
    case "NOTHING":
      return { text: "Nothing left to shift today.", canShift: false };
    case "INVALID":
      return {
        text: "Use 5 minutes to 12 hours, in 5-minute steps.",
        canShift: false,
      };
    case "OUT_OF_DAY":
      return {
        text: `${result.block.title} would leave today. Nothing moves.`,
        canShift: false,
      };
    case "IN_THE_WAY": {
      const by = result.by;
      const range = formatTimeRange(by.plannedStartMin, by.plannedDurationMin);
      return {
        text: `${result.block.title} would run into ${by.title} (${range}). Nothing moves.`,
        canShift: false,
      };
    }
  }
}

/** Blocks a shift leaves where they are: sleep, kept to the clock. */
export function sleepAnchor(
  categories: readonly Doc<"categories">[],
): (block: Doc<"blocks">) => boolean {
  const sleeping = new Set(
    categories.filter(isSleepCategory).map((category) => category._id),
  );
  return (block) => sleeping.has(block.categoryId);
}

/** The preview for a shift of today's rest, from the blocks loaded for the day. */
export function previewShift(
  blocks: readonly Doc<"blocks">[],
  categories: readonly Doc<"categories">[],
  day: DateKey,
  gridStartMin: number,
  now: LocalMoment,
  minutes: number,
): { text: string; canShift: boolean } {
  return shiftPreview(
    shiftRest(blocks, day, gridStartMin, now, minutes, sleepAnchor(categories)),
    minutes,
  );
}
