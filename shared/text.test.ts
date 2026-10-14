import { describe, expect, test } from "vitest";
import { cleanName, cleanText } from "./text";

describe("cleanText", () => {
  test.each([
    ["Energy for the camera.", "Energy for the camera."],
    ["  padded  ", "padded"],
    ["line one\nline two", "line one\nline two"],
    ["", undefined],
    ["   \n\t ", undefined],
    ["12345", "12345"],
  ])("%j -> %j", (value, expected) => {
    expect(cleanText(value, 100)).toBe(expected);
  });

  test("is null over the limit, counted after trimming", () => {
    expect(cleanText("123456", 5)).toBeNull();
    expect(cleanText("  12345  ", 5)).toBe("12345");
  });
});

describe("cleanName", () => {
  test.each([
    ["Gym", "Gym"],
    ["  Run  ", "Run"],
    ["12345", "12345"],
  ])("%j -> %j", (value, expected) => {
    expect(cleanName(value, 5)).toBe(expected);
  });

  test.each(["", "   ", "123456", " 123456 "])("%j is not a name", (value) => {
    expect(cleanName(value, 5)).toBeNull();
  });
});
