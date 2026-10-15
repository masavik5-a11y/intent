// The day record (PRD section 4): tomorrow's main focus, written while planning, and
// the evening review (PRD P5, R1, R2). Also when someone is back after days away.

import { daysBetween, type DateKey } from "./time";

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

/** How far back "Welcome back" looks for something recorded (decided 2026-10-15). */
export const RETURNING_LOOK_BACK_DAYS = 14;

/** Days between the last one with anything recorded and today that count as away. */
export const RETURNING_GAP_DAYS = 2;

/**
 * Whether today opens with "Welcome back. Plan today?" (decided 2026-10-15): the last
 * day with anything recorded (a status, a logged entry or a review) is two or more
 * days before today, or nothing was recorded in the look-back while the app was in
 * use before. A first day in the app is not a return. Nothing here counts the days.
 */
export function isReturning({
  lastRecorded,
  usedBefore,
  today,
}: {
  /** The latest day in the look-back with anything recorded, or null. */
  lastRecorded: DateKey | null;
  /** Something is dated before today: the app was in use before. */
  usedBefore: boolean;
  today: DateKey;
}): boolean {
  if (lastRecorded === null) return usedBefore;
  return daysBetween(lastRecorded, today) >= RETURNING_GAP_DAYS;
}
