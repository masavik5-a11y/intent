import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { ERROR_CODES } from "@shared/errors";
import { saveErrorMessage } from "./errorMessages";

describe("saveErrorMessage", () => {
  test("names an overlap plainly", () => {
    expect(saveErrorMessage(new ConvexError({ code: "OVERLAP" }))).toBe(
      "That overlaps another block. One thing at a time: move or shorten one of them.",
    );
  });

  test("anything that is not an app error reads as a failed save", () => {
    const fallback = "That did not save. Check the connection and try again.";
    expect(saveErrorMessage(new Error("network"))).toBe(fallback);
    expect(saveErrorMessage(new ConvexError({ code: "SOMETHING_NEW" }))).toBe(
      fallback,
    );
  });

  test.each(ERROR_CODES)("%s has one calm sentence", (code) => {
    const message = saveErrorMessage(new ConvexError({ code }));
    expect(message).toMatch(/^[A-Z].*\.$/);
    expect(message).not.toContain("!");
  });
});
