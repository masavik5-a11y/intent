// Geometry of the day grid (docs/DESIGN.md, section 3). Pure, so the grid, quick add
// and later drag all agree to the pixel.
//
// The grid of day D shows 24 hours from gridStartMin on D: [D gridStart, D+1 gridStart).
// With the default 05:00 a normal day reads top to bottom, the night's sleep sits at the
// bottom, and its part after 05:00 is the tail at the top of the next day's grid. Every
// moment appears in exactly one day's grid. A grid position is minutes from the start of
// that window, 0 to 1440.

import type { LaneSpan } from "./lanes";
import { spanBounds } from "./lanes";
import {
  addDays,
  daysBetween,
  MINUTES_PER_DAY,
  type DateKey,
  type LocalMoment,
} from "./time";

/** Phone grid scale: it scrolls instead of fitting (DESIGN.md, section 3). */
export const PHONE_PX_PER_MIN = 1.5;

/** Fit never shrinks below this, so a 30-minute block stays readable. */
export const MIN_FIT_PX_PER_MIN = 0.5;
/** …and never grows above this on a tall screen. */
export const MAX_FIT_PX_PER_MIN = 2;

/** Click on an empty slot snaps to this many minutes. */
export const CLICK_SNAP_MIN = 15;

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/**
 * Where a moment sits in `day`'s grid, in minutes from the grid's start. Below 0 it
 * is in an earlier day's grid, from 1440 on in a later one.
 */
export function gridPosition(
  day: DateKey,
  gridStartMin: number,
  at: LocalMoment,
): number {
  return daysBetween(day, at.date) * MINUTES_PER_DAY + at.minute - gridStartMin;
}

/** The moment at a position in `day`'s grid: the inverse of gridPosition. */
export function momentAt(
  day: DateKey,
  gridStartMin: number,
  position: number,
): LocalMoment {
  const sinceMidnight = gridStartMin + position;
  const days = Math.floor(sinceMidnight / MINUTES_PER_DAY);
  return {
    date: addDays(day, days),
    minute: sinceMidnight - days * MINUTES_PER_DAY,
  };
}

/**
 * The moment a clock time means on `day`'s grid. The grid runs from its start time to
 * the same time next morning, so a time before the start belongs to the next calendar
 * day: on Tuesday's grid, 01:00 is Wednesday 01:00, at the bottom.
 */
export function momentOnGrid(
  day: DateKey,
  gridStartMin: number,
  minuteOfDay: number,
): LocalMoment {
  const position =
    (((minuteOfDay - gridStartMin) % MINUTES_PER_DAY) + MINUTES_PER_DAY) %
    MINUTES_PER_DAY;
  return momentAt(day, gridStartMin, position);
}

/** The day whose grid shows a moment: before gridStartMin, the grid of the day before. */
export function gridDayOf(at: LocalMoment, gridStartMin: number): DateKey {
  return at.minute < gridStartMin ? addDays(at.date, -1) : at.date;
}

/** The part of a span that `day`'s grid shows, in grid minutes. */
export interface GridSegment {
  top: number;
  height: number;
  /** The span began in an earlier grid: this is its tail. */
  startsBefore: boolean;
  /** The span goes on into a later grid. */
  endsAfter: boolean;
}

/** The part of `span` inside `day`'s grid, or null when the grid shows none of it. */
export function gridSegment(
  day: DateKey,
  gridStartMin: number,
  span: LaneSpan,
): GridSegment | null {
  const bounds = spanBounds(day, span);
  const start = bounds.start - gridStartMin;
  const end = bounds.end - gridStartMin;
  const top = Math.max(start, 0);
  const bottom = Math.min(end, MINUTES_PER_DAY);
  if (bottom <= top) return null;
  return {
    top,
    height: bottom - top,
    startsBefore: start < 0,
    endsAfter: end > MINUTES_PER_DAY,
  };
}

/** Minutes from waking to sleep; the whole day when the two are equal. */
export function wakingMinutes(wakeMin: number, sleepMin: number): number {
  return mod(sleepMin - wakeMin, MINUTES_PER_DAY) || MINUTES_PER_DAY;
}

/** The grid position of the wake time: where the Fit zoom scrolls to. */
export function wakePosition(gridStartMin: number, wakeMin: number): number {
  return mod(wakeMin - gridStartMin, MINUTES_PER_DAY);
}

/**
 * Fit zoom: the scale at which the waking part of the day fills `viewportPx` exactly,
 * kept between MIN_FIT_PX_PER_MIN and MAX_FIT_PX_PER_MIN.
 */
export function fitPxPerMin(
  viewportPx: number,
  wakeMin: number,
  sleepMin: number,
): number {
  const scale = viewportPx / wakingMinutes(wakeMin, sleepMin);
  return Math.min(MAX_FIT_PX_PER_MIN, Math.max(MIN_FIT_PX_PER_MIN, scale));
}

/**
 * Pixel box of a stretch of grid minutes. Both edges are rounded from minutes, so two
 * blocks that touch in time touch on screen too, with no gap or overlap.
 */
export function pxBox(
  top: number,
  height: number,
  pxPerMin: number,
): { top: number; height: number } {
  const topPx = Math.round(top * pxPerMin);
  const bottomPx = Math.round((top + height) * pxPerMin);
  return { top: topPx, height: bottomPx - topPx };
}

/** Grid minutes at a pixel offset from the grid's top. */
export function pxToMinutes(px: number, pxPerMin: number): number {
  return px / pxPerMin;
}

/** Rounds to the nearest multiple of `step` (dragging, typing a time). */
export function snapMinutes(minutes: number, step: number): number {
  return Math.round(minutes / step) * step;
}

/** The start of the `step`-minute slot that contains `minutes` (clicking a slot). */
export function slotStart(minutes: number, step: number): number {
  return Math.floor(minutes / step) * step;
}

// ---------------------------------------------------------------------------
// Zoom and compressed sleep (DESIGN.md section 3)
// ---------------------------------------------------------------------------

/** The desktop zoom levels: Fit fills the view with the waking day. */
export const ZOOM_LEVELS = ["fit", "comfortable", "detailed"] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

/** Pixels per minute of the fixed zoom levels. */
export const ZOOM_PX_PER_MIN: Record<Exclude<ZoomLevel, "fit">, number> = {
  comfortable: 1.25,
  detailed: 2,
};

/** A long sleep block is drawn this tall, whatever its length. */
export const SLEEP_FOLD_PX = 40;

/** A sleep block this long or longer is compressed; a nap is not. */
export const SLEEP_FOLD_MIN_MIN = 180;

/**
 * How grid minutes become pixels: `pxPerMin` everywhere except the folds, stretches
 * of the grid (long sleep) drawn SLEEP_FOLD_PX tall each. Folds are sorted, apart,
 * and inside the grid.
 */
export interface GridScale {
  pxPerMin: number;
  folds: readonly { top: number; height: number }[];
}

/**
 * The folds for some sleep stretches in grid minutes: each cut to the grid, those
 * that touch or overlap merged, and only those that drawing at SLEEP_FOLD_PX makes
 * shorter (at least SLEEP_FOLD_MIN_MIN long).
 */
export function sleepFolds(
  stretches: readonly { top: number; height: number }[],
  pxPerMin: number,
): GridScale["folds"] {
  const cut = stretches
    .map(({ top, height }) => {
      const start = Math.max(top, 0);
      const end = Math.min(top + height, MINUTES_PER_DAY);
      return { start, end };
    })
    .filter(({ start, end }) => end > start)
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const stretch of cut) {
    const last = merged[merged.length - 1];
    if (last !== undefined && stretch.start <= last.end) {
      last.end = Math.max(last.end, stretch.end);
    } else {
      merged.push({ ...stretch });
    }
  }
  return merged
    .filter(
      ({ start, end }) =>
        end - start >= SLEEP_FOLD_MIN_MIN &&
        (end - start) * pxPerMin > SLEEP_FOLD_PX,
    )
    .map(({ start, end }) => ({ top: start, height: end - start }));
}

/** The pixel offset of a grid position (minutes from the grid's start). */
export function minuteToPx(scale: GridScale, position: number): number {
  let px = 0;
  let cursor = 0;
  for (const fold of scale.folds) {
    if (position <= fold.top) break;
    px += (fold.top - cursor) * scale.pxPerMin;
    const end = fold.top + fold.height;
    if (position <= end) {
      return px + ((position - fold.top) / fold.height) * SLEEP_FOLD_PX;
    }
    px += SLEEP_FOLD_PX;
    cursor = end;
  }
  return px + (position - cursor) * scale.pxPerMin;
}

/** The grid position at a pixel offset: the inverse of minuteToPx. */
export function pxToMinute(scale: GridScale, px: number): number {
  let atPx = 0;
  let cursor = 0;
  for (const fold of scale.folds) {
    const foldPx = atPx + (fold.top - cursor) * scale.pxPerMin;
    if (px <= foldPx) break;
    if (px <= foldPx + SLEEP_FOLD_PX) {
      return fold.top + ((px - foldPx) / SLEEP_FOLD_PX) * fold.height;
    }
    atPx = foldPx + SLEEP_FOLD_PX;
    cursor = fold.top + fold.height;
  }
  return cursor + (px - atPx) / scale.pxPerMin;
}

/** The whole grid's height in pixels. */
export function gridHeightPx(scale: GridScale): number {
  return minuteToPx(scale, MINUTES_PER_DAY);
}

/**
 * Pixel box of a stretch of grid minutes. Both edges are rounded from minutes, so
 * blocks that touch in time touch on screen, folds included.
 */
export function scaledBox(
  scale: GridScale,
  top: number,
  height: number,
): { top: number; height: number } {
  const topPx = Math.round(minuteToPx(scale, top));
  const bottomPx = Math.round(minuteToPx(scale, top + height));
  return { top: topPx, height: bottomPx - topPx };
}

/** Whether a grid position lies inside a fold (its hour mark is not drawn). */
export function insideFold(scale: GridScale, position: number): boolean {
  return scale.folds.some(
    (fold) => position > fold.top && position < fold.top + fold.height,
  );
}
