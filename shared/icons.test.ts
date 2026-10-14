import { describe, expect, test } from "vitest";
import { ICON_NAMES, isIconName } from "./icons";

describe("ICON_NAMES", () => {
  test("has no duplicates", () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  test.each(ICON_NAMES)("%s is a kebab-case lucide name", (name) => {
    expect(name).toMatch(/^[a-z]+(?:-[a-z0-9]+)*$/);
  });
});

describe("isIconName", () => {
  test("accepts a listed name", () => {
    expect(isIconName("dumbbell")).toBe(true);
  });

  test.each(["", "Dumbbell", "home", "flower2", "dumbbell "])(
    "rejects %j",
    (value) => {
      expect(isIconName(value)).toBe(false);
    },
  );
});
