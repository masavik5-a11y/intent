/** Emails are stored and compared trimmed and lower-cased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Whether `email` is on the allow-list, a comma-separated string (the ALLOWED_EMAILS
 * environment variable). An unset or empty list allows nobody: sign-up fails closed.
 */
export function isEmailAllowed(
  email: string,
  allowedEmails: string | undefined,
): boolean {
  if (allowedEmails === undefined) return false;
  const candidate = normalizeEmail(email);
  if (candidate === "") return false;
  return allowedEmails.split(",").map(normalizeEmail).includes(candidate);
}
