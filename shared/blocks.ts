// Blocks and their intent (docs/PRD.md, section 4; docs/ARCHITECTURE.md, section 5).

import type { LaneEntry, LaneSpan } from "./lanes";
import {
  isValidDuration,
  isValidMinute,
  MINUTE_STEP,
  MINUTES_PER_DAY,
  type DateKey,
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

/** Everything about a block that its shape rules look at. */
export type BlockShape = BlockTimes & { skipReason?: SkipReason | undefined };

/**
 * What is wrong with a block's fields as they would be stored, or null when they keep
 * the invariants in docs/ARCHITECTURE.md, section 5 (1 to 4): plan or actual times or
 * both, never neither; start and duration set together; `planned` and `skipped`
 * without actual times, `done` and `partial` with them; an unplanned entry `done`;
 * minutes on the 5-minute step and in range; a skip reason only on a skipped block.
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
  if (block.skipReason !== undefined && block.status !== "skipped") {
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
