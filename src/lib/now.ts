import { MINUTES_PER_HOUR, toDateKey, type LocalMoment } from "@shared/time";

/** The day and minute a Date falls on in the device's own time zone. */
export function toLocalMoment(instant: Date): LocalMoment {
  return {
    date: toDateKey({
      year: instant.getFullYear(),
      month: instant.getMonth() + 1,
      day: instant.getDate(),
    }),
    minute: instant.getHours() * MINUTES_PER_HOUR + instant.getMinutes(),
  };
}

/**
 * The device's current local day and minute. This is the only place in src/ that
 * reads the clock (docs/ARCHITECTURE.md, section 4); ESLint rejects it elsewhere.
 */
export function readNow(): LocalMoment {
  return toLocalMoment(new Date());
}
