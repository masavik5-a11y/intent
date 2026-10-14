// The one time model (docs/ARCHITECTURE.md, section 4).
//
// A block belongs to a local calendar day, a DateKey "YYYY-MM-DD", and stores integer
// minutes from that day's local midnight. Times are floating local time: no time zones
// and no timestamps. These are the only functions allowed to parse or format the values.
//
// Date objects appear here only as a calendar calculator, always in UTC so the result
// never depends on the machine's time zone. Nothing in this file reads the clock.

/** A local calendar day, "YYYY-MM-DD". Make one with parseDateKey or toDateKey. */
export type DateKey = string & { readonly __brand: "DateKey" };

/** 0 = Sunday … 6 = Saturday, the same numbering as Date and as recurrence rules. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CalendarDate {
  year: number;
  /** 1 to 12. */
  month: number;
  /** 1 to 31. */
  day: number;
}

/** A moment in floating local time: a day, and minutes from that day's midnight. */
export interface LocalMoment {
  date: DateKey;
  /** 0 to 1439. Not snapped to the 5-minute step: the clock is not. */
  minute: number;
}

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;

/** Every block time and duration is a multiple of this many minutes. */
export const MINUTE_STEP = 5;
export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_MIN = 1440;

const MIN_YEAR = 1000;
const MAX_YEAR = 9999;
const MS_PER_DAY = 86_400_000;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_LABEL_PATTERN = /^(\d{1,2}):(\d{2})$/;

const WEEKDAY_NAMES = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

// ---------------------------------------------------------------------------
// Calendar days
// ---------------------------------------------------------------------------

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isCalendarDate({ year, month, day }: CalendarDate): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= MIN_YEAR &&
    year <= MAX_YEAR &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** Builds a DateKey from calendar parts. Throws RangeError if the day does not exist. */
export function toDateKey(parts: CalendarDate): DateKey {
  if (!isCalendarDate(parts)) {
    throw new RangeError(
      `Not a calendar date: ${parts.year}-${parts.month}-${parts.day}`,
    );
  }
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}` as DateKey;
}

/** The DateKey for a string, or null when it is not a real day written as YYYY-MM-DD. */
export function parseDateKey(value: string): DateKey | null {
  const match = DATE_KEY_PATTERN.exec(value);
  if (match === null) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  return isCalendarDate(parts) ? (value as DateKey) : null;
}

export function isDateKey(value: string): value is DateKey {
  return parseDateKey(value) !== null;
}

export function dateKeyParts(date: DateKey): CalendarDate {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

function toUtcMs(date: DateKey): number {
  const { year, month, day } = dateKeyParts(date);
  return Date.UTC(year, month - 1, day);
}

/** The day `days` after `date` (before it, when negative). */
export function addDays(date: DateKey, days: number): DateKey {
  if (!Number.isInteger(days)) {
    throw new RangeError(`addDays needs a whole number of days, got ${days}`);
  }
  const shifted = new Date(toUtcMs(date) + days * MS_PER_DAY);
  return toDateKey({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

/** Whole days from `from` to `to`: positive when `to` is later. */
export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function weekdayOf(date: DateKey): Weekday {
  return new Date(toUtcMs(date)).getUTCDay() as Weekday;
}

/** "Tue 13 Oct", or "Tue 13 Oct 2026" with the year. */
export function formatDayLabel(
  date: DateKey,
  options: { withYear?: boolean } = {},
): string {
  const { year, month, day } = dateKeyParts(date);
  const label = `${WEEKDAY_NAMES[weekdayOf(date)]} ${day} ${MONTH_NAMES[month - 1]}`;
  return options.withYear === true ? `${label} ${year}` : label;
}

// ---------------------------------------------------------------------------
// Minutes
// ---------------------------------------------------------------------------

function isOnStep(value: number): boolean {
  return Number.isInteger(value) && value % MINUTE_STEP === 0;
}

/** A start minute: an integer multiple of 5 in [0, 1440). */
export function isValidMinute(value: number): boolean {
  return isOnStep(value) && value >= 0 && value < MINUTES_PER_DAY;
}

/** A duration: an integer multiple of 5 in [5, 1440]. */
export function isValidDuration(value: number): boolean {
  return (
    isOnStep(value) && value >= MIN_DURATION_MIN && value <= MAX_DURATION_MIN
  );
}

function assertWholeMinutes(value: number): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Minutes must be a whole number, got ${value}`);
  }
}

/**
 * Clock time for minutes from midnight, 24-hour: 450 -> "07:30". Minutes past the end
 * of the day wrap, so the end of a block that crosses midnight reads as a clock time:
 * 1500 -> "01:00".
 */
export function minutesToLabel(minute: number): string {
  assertWholeMinutes(minute);
  const inDay =
    ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(inDay / MINUTES_PER_HOUR);
  return `${pad(hours, 2)}:${pad(inDay % MINUTES_PER_HOUR, 2)}`;
}

/**
 * Minutes from midnight for "7:30" or "07:30", or null when the text is not a clock
 * time. The result is not snapped to the 5-minute step; check it with isValidMinute.
 */
export function parseTimeLabel(text: string): number | null {
  const match = TIME_LABEL_PATTERN.exec(text.trim());
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * MINUTES_PER_HOUR + minutes;
}

const MINUTES_ONLY = /^(\d{1,4})\s*(?:m|min|mins)?$/;
const CLOCK_LENGTH = /^(\d{1,2}):([0-5]\d)$/;
const HOURS_AND_MINUTES =
  /^(\d{1,2}(?:\.\d+)?)\s*h\s*(?:(\d{1,2})\s*(?:m|min|mins)?)?$/;

/**
 * Minutes for a typed length of time: "90", "90m", "45 min", "1h", "1h 30m", "1h30",
 * "1:30", "1.5h" or "1,5h". Null when the text is not one. The result is not checked
 * against the 5-minute step; use isValidDuration for that.
 */
export function parseDuration(text: string): number | null {
  const value = text.trim().toLowerCase().replace(",", ".");
  const minutesOnly = MINUTES_ONLY.exec(value);
  if (minutesOnly !== null) return Number(minutesOnly[1]);
  const clock = CLOCK_LENGTH.exec(value);
  if (clock !== null) {
    return Number(clock[1]) * MINUTES_PER_HOUR + Number(clock[2]);
  }
  const hours = HOURS_AND_MINUTES.exec(value);
  if (hours === null) return null;
  const [, hourText = "", minuteText] = hours;
  // "1.5h 10m" mixes two ways of writing it.
  if (minuteText !== undefined && hourText.includes(".")) return null;
  const total =
    Number(hourText) * MINUTES_PER_HOUR +
    (minuteText === undefined ? 0 : Number(minuteText));
  return Number.isInteger(total) ? total : null;
}

const CLOCK_DIGITS = /^(\d{1,2})(?:[:.h]?(\d{2}))?$/;

/**
 * Minutes from midnight for a time typed quickly, 24-hour: "9", "09", "930", "0930",
 * "9:30", "9.30", "21", "2130", "21:30". Null when it is not a clock time. Not snapped
 * to the 5-minute step.
 */
export function parseClockInput(text: string): number | null {
  // Without a separator the last two digits are the minutes: "930" is 9:30.
  const match = CLOCK_DIGITS.exec(text.trim());
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * MINUTES_PER_HOUR + minutes;
}

/** "11:00–12:30". The end wraps past midnight like minutesToLabel. */
export function formatTimeRange(startMin: number, durationMin: number): string {
  return `${minutesToLabel(startMin)}–${minutesToLabel(startMin + durationMin)}`;
}

/** A length of time: "45m", "1h", "1h 45m", "24h". */
export function formatDuration(minutes: number): string {
  assertWholeMinutes(minutes);
  if (minutes < 0) {
    throw new RangeError(`A duration cannot be negative, got ${minutes}`);
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
