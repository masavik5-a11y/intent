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
