import { MIN_PASSWORD_LENGTH, type ErrorCode } from "@shared/errors";

export type AuthMode = "signIn" | "signUp";

/** What the sign-in screen says when a sign-in or sign-up attempt fails. */
export function authErrorMessage(
  mode: AuthMode,
  code: ErrorCode | null,
): string {
  switch (code) {
    case "INVALID_EMAIL":
      return "Enter your email.";
    case "WEAK_PASSWORD":
      return `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`;
    case "SIGN_UP_CLOSED":
      return "Sign-up is closed for this address.";
    default:
      // The server does not say which part was wrong, and neither do we.
      return mode === "signIn"
        ? "That email and password do not match."
        : "The account could not be created. If it already exists, sign in instead.";
  }
}
