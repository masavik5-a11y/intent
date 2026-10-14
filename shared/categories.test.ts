import { describe, expect, test } from "vitest";
import { COLOR_KEYS, isColorKey } from "./categories";

describe("isColorKey", () => {
  test.each(COLOR_KEYS)("%s is a colour key", (key) => {
    expect(isColorKey(key)).toBe(true);
  });

  test.each(["", "Violet", "blue", "violet ", "--violet-tint"])(
    "%j is not a colour key",
    (value) => {
      expect(isColorKey(value)).toBe(false);
    },
  );
});
