// The one time model (docs/ARCHITECTURE.md, section 4): a block belongs to a local
// calendar day and stores integer minutes from that day's local midnight.

export const MINUTES_PER_DAY = 1440;

/** Every block time and duration is a multiple of this many minutes. */
export const MINUTE_STEP = 5;

/** A start minute: an integer multiple of 5 in [0, 1440). */
export function isValidMinute(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 0 &&
    value < MINUTES_PER_DAY &&
    value % MINUTE_STEP === 0
  );
}
