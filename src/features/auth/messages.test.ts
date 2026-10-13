import { describe, expect, test } from "vitest";
import { authErrorMessage } from "./messages";

describe("authErrorMessage", () => {
  test.each([
    ["signIn", null, "That email and password do not match."],
    ["signIn", "UNAUTHENTICATED", "That email and password do not match."],
    [
      "signUp",
      null,
      "The account could not be created. If it already exists, sign in instead.",
    ],
    ["signUp", "SIGN_UP_CLOSED", "Sign-up is closed for this address."],
    ["signUp", "WEAK_PASSWORD", "Use at least 10 characters for the password."],
    ["signIn", "INVALID_EMAIL", "Enter your email."],
  ] as const)("%s failing with %s", (mode, code, expected) => {
    expect(authErrorMessage(mode, code)).toBe(expected);
  });

  test("never shouts", () => {
    for (const mode of ["signIn", "signUp"] as const) {
      for (const code of [null, "SIGN_UP_CLOSED", "WEAK_PASSWORD"] as const) {
        expect(authErrorMessage(mode, code)).not.toContain("!");
      }
    }
  });
});
