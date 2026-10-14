// Urgency, computed and never stored (docs/ARCHITECTURE.md, section 16): how much of a
// block is left, and later weekly pace and days left to a goal (M5).

import { spanBounds, type LaneSpan } from "./lanes";
import type { LocalMoment } from "./time";

export interface Countdown {
  /** Minutes until the planned end; 0 once it has passed. */
  minutesLeft: number;
  /** minutesLeft as a share of the planned length, 1 at the start, 0 at the end. */
  fractionLeft: number;
  /** Minutes past the planned end; 0 until then. */
  minutesOver: number;
}

/**
 * How much of a planned span is left at `now`: the draining bar on the now panel
 * (PRD U2). Before the span starts the whole of it is left.
 */
export function countdown(span: LaneSpan, now: LocalMoment): Countdown {
  const { start, end } = spanBounds(now.date, span);
  const elapsed = Math.min(Math.max(now.minute - start, 0), span.durationMin);
  const minutesLeft = span.durationMin - elapsed;
  return {
    minutesLeft,
    fractionLeft: span.durationMin === 0 ? 0 : minutesLeft / span.durationMin,
    minutesOver: Math.max(now.minute - end, 0),
  };
}
