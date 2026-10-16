// Goals (PRD U6): something with a why and, usually, a due date. Activities point at
// one, so their blocks show the days left. Days left and pace live in pace.ts.

import { MINUTE_STEP, MINUTES_PER_DAY } from "./time";

/** Active until it is marked done or dropped; either can be reopened. */
export const GOAL_STATUSES = ["active", "done", "dropped"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** More goals than anyone keeps; keeps every read of the table bounded. */
export const MAX_GOALS = 200;

/** A weekly target is at most the whole week. */
export const MAX_WEEKLY_TARGET_MIN = 7 * MINUTES_PER_DAY;

/** A weekly target in minutes: on the 5-minute step, from 5 minutes to the whole week. */
export function isValidWeeklyTarget(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes % MINUTE_STEP === 0 &&
    minutes >= MINUTE_STEP &&
    minutes <= MAX_WEEKLY_TARGET_MIN
  );
}
