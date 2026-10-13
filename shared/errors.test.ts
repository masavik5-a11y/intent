import { describe, expect, test } from "vitest";
import { errorCodeOf } from "./errors";

describe("errorCodeOf", () => {
  test.each([
    [{ code: "UNAUTHENTICATED" }, "UNAUTHENTICATED"],
    [{ code: "SIGN_UP_CLOSED", extra: 1 }, "SIGN_UP_CLOSED"],
    [{ code: "WEAK_PASSWORD" }, "WEAK_PASSWORD"],
  ])("%o -> %s", (data, expected) => {
    expect(errorCodeOf(data)).toBe(expected);
  });

  test.each([
    [undefined],
    [null],
    ["UNAUTHENTICATED"],
    [42],
    [{}],
    [{ code: "SOMETHING_ELSE" }],
    [{ code: 7 }],
    [{ message: "UNAUTHENTICATED" }],
  ])("%o is not a known code", (data) => {
    expect(errorCodeOf(data)).toBeNull();
  });
});
