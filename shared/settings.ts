// Per-user preferences and their defaults (docs/ARCHITECTURE.md, section 5).

/** Values a new user starts with. First-run setup asks for the wake and sleep times. */
export const DEFAULT_SETTINGS = {
  /** The day grid starts at 05:00, so a normal day reads top to bottom. */
  gridStartMin: 5 * 60,
  /** Monday (PRD section 10). */
  weekStartsOn: 1,
  wakeMin: 7 * 60,
  sleepMin: 23 * 60,
} as const;

const TIME_ZONE_PATTERN = /^[A-Za-z][\w+-]*(?:\/[\w+-]+)*$/;
const MAX_TIME_ZONE_LENGTH = 64;

/**
 * Whether a string is shaped like an IANA time zone name ("Europe/Prague", "UTC",
 * "Etc/GMT+1"). Whether the zone exists is not checked: that needs Intl, which the
 * notification dispatcher uses in M4 (docs/ARCHITECTURE.md, section 15).
 */
export function isTimeZoneName(value: string): boolean {
  return value.length <= MAX_TIME_ZONE_LENGTH && TIME_ZONE_PATTERN.test(value);
}
