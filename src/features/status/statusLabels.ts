import { hasActual, hasPlan, type SkipReason } from "@shared/blocks";
import { formatDuration, formatTimeRange } from "@shared/time";
import type { Doc } from "@/lib/api";

// How a block's status reads (DESIGN.md sections 4 and 9): plain words, no verdicts.

/** The optional reasons offered after Skip (PRD A1), in the order shown. */
export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  tired: "Tired",
  noTime: "No time",
  choseOther: "Chose something else",
  forgot: "Forgot",
  other: "Other",
};

/**
 * One line for what became of a block: "Done · 11:00–11:50", "Partly · 25m of 1h",
 * "Skipped · tired", "Not marked yet", or for an unplanned entry "Logged · 13:00–13:45".
 */
export function statusLine(block: Doc<"blocks">): string {
  switch (block.status) {
    case "planned":
      return "Not marked yet";
    case "skipped":
      return block.skipReason === undefined
        ? "Skipped"
        : `Skipped · ${SKIP_REASON_LABELS[block.skipReason].toLowerCase()}`;
    case "partial":
      return hasActual(block) && hasPlan(block)
        ? `Partly · ${formatDuration(block.actualDurationMin)} of ${formatDuration(block.plannedDurationMin)}`
        : "Partly";
    case "done": {
      if (!hasActual(block)) return "Done";
      const range = formatTimeRange(
        block.actualStartMin,
        block.actualDurationMin,
      );
      return hasPlan(block) ? `Done · ${range}` : `Logged · ${range}`;
    }
  }
}
