import { describe, expect, test } from "vitest";
import { isEmailAllowed, normalizeEmail } from "./allowedEmails";

describe("normalizeEmail", () => {
  test.each([
    ["me@example.com", "me@example.com"],
    ["  Me@Example.COM ", "me@example.com"],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
});

describe("isEmailAllowed", () => {
  test.each([
    ["me@example.com", "me@example.com"],
    ["ME@Example.com", "me@example.com"], // case does not matter
    [" me@example.com ", "me@example.com"],
    ["me@example.com", "Me@Example.com"],
    ["me@example.com", "other@example.com,me@example.com"],
    ["me@example.com", " other@example.com , me@example.com "],
    ["me@example.com", "me@example.com,"],
  ])("%j is allowed by %j", (email, list) => {
    expect(isEmailAllowed(email, list)).toBe(true);
  });

  test.each([
    ["me@example.com", undefined, "the variable is not set"],
    ["me@example.com", "", "the list is empty"],
    ["me@example.com", " , ", "the list has only separators"],
    ["me@example.com", "other@example.com", "another address"],
    ["me@example.com", "me@example.com.evil.test", "a longer address"],
    ["e@example.com", "me@example.com", "a suffix of an allowed address"],
    ["me@example.co", "me@example.com", "a prefix of an allowed address"],
    ["", "me@example.com", "no email"],
    ["", "", "no email and an empty list"],
    ["", ",", "no email and empty entries"],
    ["a@x.test,b@x.test", "a@x.test,b@x.test", "the whole list as the email"],
  ])("%j is not allowed by %j (%s)", (email, list, _reason) => {
    expect(isEmailAllowed(email, list)).toBe(false);
  });
});
