// Blocks and their intent (docs/PRD.md, section 4; docs/ARCHITECTURE.md, section 5).

import {
  actualStartFor,
  defaultActual,
  liveActual,
  minuteFrom,
  spansOverlap,
  type LaneEntry,
  type LaneSpan,
} from "./lanes";
import {
  isValidDuration,
  isValidMinute,
  MINUTE_STEP,
  MINUTES_PER_DAY,
  type DateKey,
  type LocalMoment,
} from "./time";

/**
 * What became of a block. `planned` until it is marked; `done` and `partial` carry
 * actual times; `skipped` has none (PRD section 7, rule 2).
 */
export const BLOCK_STATUSES = [
  "planned",
  "done",
  "partial",
  "skipped",
] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];

/** The optional reasons offered when skipping (PRD A1). */
export const SKIP_REASONS = [
  "tired",
  "noTime",
  "choseOther",
  "forgot",
  "other",
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/**
 * The time fields of a block as stored. Plan and actual times are each a start and a
 * duration, set or unset together, in minutes from the local midnight of `date`.
 */
export interface BlockTimes {
  date: DateKey;
  status: BlockStatus;
  plannedStartMin?: number | undefined;
  plannedDurationMin?: number | undefined;
  actualStartMin?: number | undefined;
  actualDurationMin?: number | undefined;
}

/** A block that has plan times: every block except an unplanned entry. */
export type WithPlan<B> = B & {
  plannedStartMin: number;
  plannedDurationMin: number;
};

/** A block that has actual times: done, partly done, or an unplanned entry. */
export type WithActual<B> = B & {
  actualStartMin: number;
  actualDurationMin: number;
};

export function hasPlan<B extends BlockTimes>(block: B): block is WithPlan<B> {
  return (
    block.plannedStartMin !== undefined &&
    block.plannedDurationMin !== undefined
  );
}

export function hasActual<B extends BlockTimes>(
  block: B,
): block is WithActual<B> {
  return (
    block.actualStartMin !== undefined && block.actualDurationMin !== undefined
  );
}

/** A block's place in the plan lane. */
export function planEntry<Id>(
  block: WithPlan<BlockTimes> & { _id: Id },
): LaneEntry<Id> {
  return {
    id: block._id,
    date: block.date,
    startMin: block.plannedStartMin,
    durationMin: block.plannedDurationMin,
  };
}

/** A block's place in the actual lane. */
export function actualEntry<Id>(
  block: WithActual<BlockTimes> & { _id: Id },
): LaneEntry<Id> {
  return {
    id: block._id,
    date: block.date,
    startMin: block.actualStartMin,
    durationMin: block.actualDurationMin,
  };
}

/** The plan lane of some blocks: those with plan times, each with its block. */
export function planLaneOf<B extends BlockTimes & { _id: unknown }>(
  blocks: readonly B[],
): (LaneEntry<B["_id"]> & { block: WithPlan<B> })[] {
  return blocks.filter(hasPlan).map((block) => ({
    ...planEntry<B["_id"]>(block),
    block,
  }));
}

/** The actual lane of some blocks: those with actual times, each with its block. */
export function actualLaneOf<B extends BlockTimes & { _id: unknown }>(
  blocks: readonly B[],
): (LaneEntry<B["_id"]> & { block: WithActual<B> })[] {
  return blocks.filter(hasActual).map((block) => ({
    ...actualEntry<B["_id"]>(block),
    block,
  }));
}

/**
 * The span a block is known by: its plan, or for an unplanned entry what happened.
 * Every block has one or the other (invariant 1).
 */
export function blockSpan(block: BlockTimes): LaneSpan {
  if (hasPlan(block)) {
    return {
      date: block.date,
      startMin: block.plannedStartMin,
      durationMin: block.plannedDurationMin,
    };
  }
  return {
    date: block.date,
    startMin: block.actualStartMin ?? 0,
    durationMin: block.actualDurationMin ?? 0,
  };
}

/**
 * An actual start: on the 5-minute step, from the midnight of the block's day up to
 * the end of the next one. It may pass 1440 where a plan start may not, because a
 * block planned before midnight can begin after it (docs/ARCHITECTURE.md, section 4).
 */
export function isValidActualStart(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value % MINUTE_STEP === 0 &&
    value >= 0 &&
    value < 2 * MINUTES_PER_DAY
  );
}

/**
 * The actual start a typed clock time means for a block whose actual start is now
 * `current` (minutes from its day's midnight): the reading of that clock time, on the
 * block's day or the next, nearest to `current`. Null when even that is more than 12
 * hours away, which would mean a start before the block's own day.
 */
export function actualStartFromClock(
  clockMin: number,
  current: number,
): number | null {
  const candidates = [clockMin, clockMin + MINUTES_PER_DAY].filter(
    isValidActualStart,
  );
  let best: number | null = null;
  for (const candidate of candidates) {
    if (
      best === null ||
      Math.abs(candidate - current) < Math.abs(best - current)
    ) {
      best = candidate;
    }
  }
  return best !== null && Math.abs(best - current) <= MINUTES_PER_DAY / 2
    ? best
    : null;
}

/** Everything about a block that its shape rules look at. */
export type BlockShape = BlockTimes & {
  skipReason?: SkipReason | undefined;
  minimumChosen?: boolean | undefined;
};

/**
 * What is wrong with a block's fields as they would be stored, or null when they keep
 * the invariants in docs/ARCHITECTURE.md, section 5 (1 to 4): plan or actual times or
 * both, never neither; start and duration set together; `planned` and `skipped`
 * without actual times, `done` and `partial` with them; an unplanned entry `done`,
 * starting on its own day;
 * minutes on the 5-minute step and in range; a skip reason only on a skipped block;
 * the minimum chosen only on a planned or partly done block.
 */
export function blockShapeProblem(
  block: BlockShape,
): "INVALID_INPUT" | "INVALID_TIME" | null {
  const planStart = block.plannedStartMin;
  const planLength = block.plannedDurationMin;
  const actualStart = block.actualStartMin;
  const actualLength = block.actualDurationMin;
  if ((planStart === undefined) !== (planLength === undefined)) {
    return "INVALID_INPUT";
  }
  if ((actualStart === undefined) !== (actualLength === undefined)) {
    return "INVALID_INPUT";
  }
  const planned = planStart !== undefined;
  const happened = actualStart !== undefined;
  if (!planned && !happened) return "INVALID_INPUT";

  switch (block.status) {
    case "planned":
    case "skipped":
      if (happened) return "INVALID_INPUT";
      break;
    case "done":
    case "partial":
      if (!happened) return "INVALID_INPUT";
      break;
  }
  if (!planned && block.status !== "done") return "INVALID_INPUT";
  // An unplanned entry is stored on the day it began, like a plan.
  if (!planned && happened && actualStart >= MINUTES_PER_DAY) {
    return "INVALID_TIME";
  }
  if (block.skipReason !== undefined && block.status !== "skipped") {
    return "INVALID_INPUT";
  }
  // The minimum is chosen on a block still planned and ends as partly done: never
  // done in full, never a skip (PRD V3).
  if (
    block.minimumChosen === true &&
    block.status !== "planned" &&
    block.status !== "partial"
  ) {
    return "INVALID_INPUT";
  }

  if (
    planned &&
    (!isValidMinute(planStart) || !isValidDuration(planLength ?? 0))
  ) {
    return "INVALID_TIME";
  }
  if (
    happened &&
    (!isValidActualStart(actualStart) ||
      !isValidDuration(actualLength ?? 0) ||
      actualStart + (actualLength ?? 0) > 2 * MINUTES_PER_DAY)
  ) {
    return "INVALID_TIME";
  }
  return null;
}

/**
 * The intent fields, in the order the now panel shows them. Activities hold the
 * standing text; a block may override any of them for that day.
 */
export const INTENT_FIELDS = [
  "doneWhen",
  "why",
  "how",
  "ifThen",
  "minimumVersion",
  "costOfSkipping",
] as const;
export type IntentField = (typeof INTENT_FIELDS)[number];

/** Intent texts as stored on an activity or on a block. Unset means none, or inherit. */
export type IntentTexts = { readonly [F in IntentField]?: string | undefined };

export interface IntentText {
  text: string;
  /** True when the text comes from the activity rather than from the block itself. */
  inherited: boolean;
}

/** For each intent field, the text that applies to a block, or null when there is none. */
export type EffectiveIntent = { [F in IntentField]: IntentText | null };

function present(text: string | undefined): text is string {
  return text !== undefined && text.trim() !== "";
}

/**
 * The intent that applies to a block: for each field, the block's own text if it has
 * one, otherwise its activity's. Blank text counts as unset. Because nothing is copied,
 * editing an activity's why changes every block that has not overridden it, past ones
 * included: the why is a living statement.
 */
export function effectiveIntent(
  block: IntentTexts,
  activity: IntentTexts | null,
): EffectiveIntent {
  const pick = (field: IntentField): IntentText | null => {
    const own = block[field];
    if (present(own)) return { text: own, inherited: false };
    const inherited = activity?.[field];
    if (present(inherited)) return { text: inherited, inherited: true };
    return null;
  };
  return {
    doneWhen: pick("doneWhen"),
    why: pick("why"),
    how: pick("how"),
    ifThen: pick("ifThen"),
    minimumVersion: pick("minimumVersion"),
    costOfSkipping: pick("costOfSkipping"),
  };
}

// ---------------------------------------------------------------------------
// Plan versus actual (docs/PRD.md, section 7; docs/ARCHITECTURE.md, section 6)
// ---------------------------------------------------------------------------

/** A block's plan as a span. */
export function planSpan(block: WithPlan<BlockTimes>): LaneSpan {
  return {
    date: block.date,
    startMin: block.plannedStartMin,
    durationMin: block.plannedDurationMin,
  };
}

/** Whether a planned block has begun by `now`: from then on it can be marked. */
export function hasStarted(
  block: WithPlan<BlockTimes>,
  now: LocalMoment,
): boolean {
  return minuteFrom(block.date, now) >= block.plannedStartMin;
}

/**
 * Whether a block is the one running at `now`: still `planned`, and its plan holds
 * this minute. A block marked done or skipped early is no longer running.
 */
export function isRunning(block: BlockTimes, now: LocalMoment): boolean {
  if (block.status !== "planned" || !hasPlan(block)) return false;
  const at = minuteFrom(block.date, now);
  return (
    at >= block.plannedStartMin &&
    at < block.plannedStartMin + block.plannedDurationMin
  );
}

/**
 * Which times an edit changes (PRD section 7, rule 4): the plan while a block has not
 * started, what happened once it has. An unplanned entry only has what happened. On a
 * past day every block has started, so its plan is frozen unless the screen offers
 * "Edit plan"; on a future day nothing has, so there is only the plan.
 */
export function editTarget(
  block: BlockTimes,
  now: LocalMoment,
): "plan" | "actual" {
  return hasPlan(block) && !hasStarted(block, now) ? "plan" : "actual";
}

export type StatusAction =
  | { type: "done" }
  | { type: "partial"; minutes: number }
  | { type: "skip"; reason?: SkipReason | undefined }
  | { type: "undo" }
  | { type: "startMinimum" };

/** What a status change writes. Undefined removes the field. */
export interface StatusFields {
  status: BlockStatus;
  actualStartMin: number | undefined;
  actualDurationMin: number | undefined;
  skipReason: SkipReason | undefined;
  minimumChosen: true | undefined;
}

/**
 * Why a status change cannot be made: the block is an unplanned entry (it is deleted,
 * not unmarked); it has not started, so it cannot be done yet; the actual lane has no
 * room for it; Partly was given a length that is not one; or the minimum was asked
 * for on a block already marked.
 */
export type StatusProblem =
  "UNPLANNED" | "NOT_STARTED" | "NO_ROOM" | "INVALID_TIME" | "MARKED";

/**
 * The fields Done, Partly, Skip or Undo writes on a block (PRD A1, A4, and section 7).
 *
 * - Done: once the block has started. The actual is defaultActual: the plan, its
 *   start pushed past an overrun keeping the planned end, ending now if it is still
 *   running.
 * - Partly: once started. The given minutes from where Done would start.
 * - Skip: at any time, with an optional reason. No actual times. A minimum chosen is
 *   let go.
 * - Undo: back to planned, without actual times or a skip reason. On a block not
 *   marked yet, it takes back "Start the minimum" instead.
 * - Start the minimum (PRD V3): the block stays planned and remembers the choice;
 *   Done on it then records Partly with the minimum noted, never a skip.
 *
 * `lane` is the actual lane around the block without the block itself.
 */
export function applyStatus(
  block: BlockShape,
  action: StatusAction,
  lane: readonly LaneSpan[],
  now: LocalMoment,
): { fields: StatusFields } | { problem: StatusProblem } {
  if (!hasPlan(block)) return { problem: "UNPLANNED" };
  const plan = planSpan(block);
  const minimum: true | undefined =
    block.minimumChosen === true ? true : undefined;
  const cleared = {
    actualStartMin: undefined,
    actualDurationMin: undefined,
    skipReason: undefined,
    minimumChosen: minimum,
  };
  switch (action.type) {
    case "skip":
      return {
        fields: {
          ...cleared,
          status: "skipped",
          skipReason: action.reason,
          minimumChosen: undefined,
        },
      };
    case "undo":
      return {
        fields: {
          ...cleared,
          status: "planned",
          // Unmarking keeps the choice; undoing on a block not marked drops it.
          minimumChosen: block.status === "planned" ? undefined : minimum,
        },
      };
    case "startMinimum":
      // Only before it is marked: on a done block it would erase what happened.
      if (block.status !== "planned") return { problem: "MARKED" };
      return {
        fields: { ...cleared, status: "planned", minimumChosen: true },
      };
    case "done": {
      if (!hasStarted(block, now)) return { problem: "NOT_STARTED" };
      const actual = defaultActual(plan, lane, now);
      if (actual === null) return { problem: "NO_ROOM" };
      return {
        fields: {
          ...cleared,
          // Finishing the minimum is partly done, with the minimum noted.
          status: minimum === true ? "partial" : "done",
          actualStartMin: actual.startMin,
          actualDurationMin: actual.durationMin,
        },
      };
    }
    case "partial": {
      if (!hasStarted(block, now)) return { problem: "NOT_STARTED" };
      if (!isValidDuration(action.minutes)) return { problem: "INVALID_TIME" };
      const start = actualStartFor(plan, lane);
      if (start === null) return { problem: "NO_ROOM" };
      const actual = {
        date: block.date,
        startMin: start,
        durationMin: action.minutes,
      };
      if (start + action.minutes > 2 * MINUTES_PER_DAY) {
        return { problem: "INVALID_TIME" };
      }
      if (lane.some((entry) => spansOverlap(actual, entry))) {
        return { problem: "NO_ROOM" };
      }
      return {
        fields: {
          ...cleared,
          status: "partial",
          actualStartMin: actual.startMin,
          actualDurationMin: actual.durationMin,
        },
      };
    }
  }
}

/**
 * Quick choices for Partly (PRD A1): a quarter, half and three quarters of the plan
 * on the 5-minute step, and, while the block runs, the time it has had so far. Each
 * at least 5 minutes and shorter than the plan, shortest first, without repeats.
 */
export function partlyChoices(
  plannedDurationMin: number,
  soFarMin?: number,
): number[] {
  const fractions = [0.25, 0.5, 0.75].map(
    (fraction) =>
      Math.round((plannedDurationMin * fraction) / MINUTE_STEP) * MINUTE_STEP,
  );
  const soFar =
    soFarMin === undefined
      ? []
      : [Math.floor(soFarMin / MINUTE_STEP) * MINUTE_STEP];
  return [...new Set([...soFar, ...fractions])]
    .filter((minutes) => minutes >= MINUTE_STEP && minutes < plannedDurationMin)
    .sort((a, b) => a - b);
}

/** An entry of the live actual lane; `live` marks the running block's growing bar. */
export type LiveEntry<B extends BlockTimes & { _id: unknown }> = LaneEntry<
  B["_id"]
> & { block: B; live: boolean };

/**
 * The actual lane as it stands at `now`: every recorded entry, and the running block
 * up to this minute (liveActual), so the growing bar and the totals count it before
 * it is marked (PRD U4, and section 7, pace rule 1).
 */
export function liveActualLane<B extends BlockTimes & { _id: unknown }>(
  blocks: readonly B[],
  now: LocalMoment,
): LiveEntry<B>[] {
  const lane: LiveEntry<B>[] = actualLaneOf(blocks).map((entry) => ({
    ...entry,
    live: false,
  }));
  const running = blocks.find((block) => isRunning(block, now));
  if (running !== undefined && hasPlan(running)) {
    const live = liveActual(planSpan(running), lane, now);
    if (live !== null) {
      lane.push({ ...live, id: running._id, block: running, live: true });
    }
  }
  return lane;
}
