import { describe, expect, test } from "vitest";
import { ANTI_VISION, lastEditedText, VISION } from "./compassCopy";

describe("lastEditedText", () => {
  test("names the day the compass was last saved", () => {
    // Midday UTC is the same calendar day in nearly every time zone.
    expect(lastEditedText(Date.parse("2026-10-14T12:00:00Z"))).toBe(
      "Last edited Wed 14 Oct 2026",
    );
  });
});

describe("writing prompts", () => {
  test("three questions each, in the user's own voice", () => {
    for (const part of [VISION, ANTI_VISION]) {
      expect(part.prompts).toHaveLength(3);
      for (const prompt of part.prompts) expect(prompt).toMatch(/\?$/);
    }
  });
});
