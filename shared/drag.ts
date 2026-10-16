// Dragging a block to move or resize it (PRD T9; DESIGN.md section 3). Pure, in grid
// positions (minutes from the start of the day's grid, shared/grid.ts), so the screen
// only turns pixels into minutes and the result into a block's times.
//
// The rules: times snap to 5 minutes; a block is at least 5 minutes and at most a day
// long; it stays inside the limits the edit rule gives it; and it never lands on
// another block of its lane. A drop where it would collide slides back toward where
// it came from until it fits, so nothing else ever moves.

import { MAX_DURATION_MIN, MIN_DURATION_MIN, MINUTE_STEP } from "./time";

/** Moving keeps the length and shifts the start; resizing keeps the start. */
export type DragMode = "move" | "resize";

/** A stretch of a day's grid, in minutes from the grid's start. */
export interface GridSpan {
  top: number;
  height: number;
}

/**
 * Where a dragged block may go, in grid positions: its start from `minTop` to
 * `maxTop`, its end at most `maxBottom`. On today, for example, a plan starts no
 * earlier than now and an actual entry ends no later than now.
 */
export interface DragLimits {
  minTop: number;
  maxTop: number;
  maxBottom: number;
}

function snap(minutes: number): number {
  return Math.round(minutes / MINUTE_STEP) * MINUTE_STEP;
}

/** The span a drag of `deltaMin` minutes asks for, snapped and kept in the limits. */
export function draggedSpan(
  origin: GridSpan,
  mode: DragMode,
  deltaMin: number,
  limits: DragLimits,
): GridSpan {
  if (mode === "move") {
    const highest = Math.min(limits.maxTop, limits.maxBottom - origin.height);
    const top = Math.min(
      Math.max(snap(origin.top + deltaMin), limits.minTop),
      highest,
    );
    return { top, height: origin.height };
  }
  const longest = Math.min(MAX_DURATION_MIN, limits.maxBottom - origin.top);
  const height = Math.min(
    Math.max(snap(origin.height + deltaMin), MIN_DURATION_MIN),
    longest,
  );
  return { top: origin.top, height };
}

function collides(span: GridSpan, taken: readonly GridSpan[]): boolean {
  return taken.some(
    (other) =>
      span.top < other.top + other.height && other.top < span.top + span.height,
  );
}

/**
 * Where a dragged block lands: the span the drag asks for when it is free, otherwise
 * the nearest one back toward `origin`, 5 minutes at a time, that touches nothing in
 * `taken` (the lane's other blocks, in this grid's positions). It can jump past a
 * block into free time beyond, but never onto one. When nothing between fits, the
 * block stays at `origin`.
 */
export function dropSpan({
  origin,
  mode,
  deltaMin,
  limits,
  taken,
}: {
  origin: GridSpan;
  mode: DragMode;
  deltaMin: number;
  limits: DragLimits;
  taken: readonly GridSpan[];
}): GridSpan {
  const wanted = draggedSpan(origin, mode, deltaMin, limits);
  const from = mode === "move" ? wanted.top : wanted.height;
  const to = mode === "move" ? origin.top : origin.height;
  const step = from > to ? -MINUTE_STEP : MINUTE_STEP;
  for (let value = from; step > 0 ? value <= to : value >= to; value += step) {
    const span =
      mode === "move"
        ? { top: value, height: origin.height }
        : { top: origin.top, height: value };
    if (!collides(span, taken)) return span;
  }
  return origin;
}

/** Whether a drop changes anything. */
export function sameSpan(a: GridSpan, b: GridSpan): boolean {
  return a.top === b.top && a.height === b.height;
}
