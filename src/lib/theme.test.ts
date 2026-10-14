import { describe, expect, test } from "vitest";
import { resolveTheme } from "./theme";

describe("resolveTheme", () => {
  test.each([
    ["system", false, "light"],
    ["system", true, "dark"],
    ["light", true, "light"],
    ["light", false, "light"],
    ["dark", false, "dark"],
    ["dark", true, "dark"],
  ] as const)("%s with a dark system %s is %s", (choice, systemDark, theme) => {
    expect(resolveTheme(choice, systemDark)).toBe(theme);
  });
});
