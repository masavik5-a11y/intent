// The day record (PRD section 4): tomorrow's main focus, written while planning, and
// the evening review (PRD P5, R1, R2).

/** The three reflection prompts' answers, in the order the review asks them. */
export const REFLECTION_FIELDS = [
  "wentWell",
  "drifted",
  "changeTomorrow",
] as const;
export type ReflectionField = (typeof REFLECTION_FIELDS)[number];

/** The day rating and the energy are each 1 to 5, both optional (PRD R2). */
export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

/** Whether a number is a point on the 1-to-5 scale. */
export function isScalePoint(value: number): boolean {
  return Number.isInteger(value) && value >= SCALE_MIN && value <= SCALE_MAX;
}

/** The points of the scale, lowest first. */
export const SCALE_POINTS: readonly number[] = Array.from(
  { length: SCALE_MAX - SCALE_MIN + 1 },
  (_, index) => SCALE_MIN + index,
);
