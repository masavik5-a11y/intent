// How user text is cleaned and capped before it is stored (docs/ARCHITECTURE.md,
// section 5, invariant 7). Inputs in the UI carry the same limits as maxLength, so the
// server's checks only catch what the UI should never send.

/** A block title or an activity or category name. */
export const MAX_TITLE_LENGTH = 80;
/** A block's one-line focus for the day. */
export const MAX_FOCUS_LENGTH = 120;
/** One intent field: why, how, if-then, minimum version, cost of skipping, done when. */
export const MAX_INTENT_LENGTH = 1000;
/** The one-line note on a block, added after the fact (PRD A5). */
export const MAX_NOTE_LENGTH = 200;
/** One answer in the evening review (PRD R2). */
export const MAX_REFLECTION_LENGTH = 1000;
/** The vision or the anti-vision. */
export const MAX_COMPASS_LENGTH = 10_000;

/**
 * Optional text as it is stored: trimmed, and undefined when nothing is left, so blank
 * means unset everywhere. Null when it is longer than `max` after trimming.
 */
export function cleanText(
  value: string,
  max: number,
): string | undefined | null {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return trimmed.length <= max ? trimmed : null;
}

/** A required name: trimmed, 1 to `max` characters, or null when it is not. */
export function cleanName(value: string, max: number): string | null {
  const trimmed = value.trim();
  return trimmed !== "" && trimmed.length <= max ? trimmed : null;
}
