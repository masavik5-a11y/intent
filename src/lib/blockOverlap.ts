import { planEntry } from "@shared/blocks";
import { findOverlap, type LaneSpan } from "@shared/lanes";
import { formatTimeRange } from "@shared/time";
import type { Doc, Id } from "./api";

// Naming an overlap before the server refuses it (PRD section 7, rule 6). The rule
// itself is shared/lanes.ts; this finds the block in the way among those on screen.

/**
 * The block a span would collide with, among the blocks loaded for the day. A span
 * with an id skips that block, so an edit can stay where it is.
 */
export function collidingBlock(
  span: LaneSpan & { id?: Id<"blocks"> },
  blocks: readonly Doc<"blocks">[],
): Doc<"blocks"> | undefined {
  const hit = findOverlap(span, blocks.map(planEntry));
  return hit === null
    ? undefined
    : blocks.find((block) => block._id === hit.id);
}

/** "That overlaps Lunch (12:00–13:00). Pick another time or a shorter length." */
export function overlapMessage(block: Doc<"blocks">): string {
  const range = formatTimeRange(
    block.plannedStartMin,
    block.plannedDurationMin,
  );
  return `That overlaps ${block.title} (${range}). Pick another time or a shorter length.`;
}
