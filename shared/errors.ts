// Stable error codes. The backend throws them inside a ConvexError as `{ code }`; the
// UI maps a code to a message (docs/ARCHITECTURE.md, section 5). Add a code here in the
// milestone that first throws it.

export const ERROR_CODES = [
  /** No session. */
  "UNAUTHENTICATED",
  /** Sign-up tried with an email that is not on the allow-list. */
  "SIGN_UP_CLOSED",
  /** Sign-up tried with a password shorter than MIN_PASSWORD_LENGTH. */
  "WEAK_PASSWORD",
  /** Sign-in or sign-up without a usable email. */
  "INVALID_EMAIL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// A type alias, not an interface: Convex accepts only plain object types as error data.
export type AppErrorData = { code: ErrorCode };

/** The shortest password an account may be created with. */
export const MIN_PASSWORD_LENGTH = 10;

/** The code inside a ConvexError's `data`, or null when the data is something else. */
export function errorCodeOf(data: unknown): ErrorCode | null {
  if (typeof data !== "object" || data === null || !("code" in data)) {
    return null;
  }
  const { code } = data;
  return ERROR_CODES.find((known) => known === code) ?? null;
}
