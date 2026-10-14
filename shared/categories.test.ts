import { describe, expect, test } from "vitest";
import {
  COLOR_KEYS,
  DEFAULT_CATEGORIES,
  isColorKey,
  pressureByDefault,
} from "./categories";
import { isIconName } from "./icons";

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

describe("DEFAULT_CATEGORIES", () => {
  test("are the categories from DESIGN.md, in order", () => {
    expect(
      DEFAULT_CATEGORIES.map(({ name, kind, colorKey, icon }) => [
        name,
        kind,
        colorKey,
        icon,
      ]),
    ).toEqual([
      ["Deep work", "intentional", "violet", "brain"],
      ["Body", "intentional", "teal", "dumbbell"],
      ["Mind", "intentional", "coral", "flower-2"],
      ["Rest on purpose", "intentional", "pink", "coffee"],
      ["Events", "intentional", "amber", "party-popper"],
      ["Life", "maintenance", "gray", "house"],
      ["Sleep", "maintenance", "slate", "moon"],
      ["Drift", "drift", "red", "cloud"],
    ]);
  });

  test("use known icons and distinct colours", () => {
    for (const category of DEFAULT_CATEGORIES) {
      expect(isIconName(category.icon)).toBe(true);
    }
    const colours = DEFAULT_CATEGORIES.map((category) => category.colorKey);
    expect(new Set(colours).size).toBe(colours.length);
  });
});

describe("pressureByDefault", () => {
  test.each([
    ["Deep work", true],
    [" deep work ", true],
    ["Body", false],
    ["Mind", false],
    ["Sleep", false],
    ["Rest on purpose", false],
  ])("%j: %s", (name, expected) => {
    expect(pressureByDefault({ name })).toBe(expected);
  });

  test("no category: off", () => {
    expect(pressureByDefault(undefined)).toBe(false);
  });
});
