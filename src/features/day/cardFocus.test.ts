import { describe, expect, test } from "vitest";
import { nextCardIndex, shortcutApplies, shortcutTarget } from "./cardFocus";

// Cards at 09:00, 12:00, 14:00 (running, now inside it) and 17:00, in pixels.
const cards = [
  { top: 100, bottom: 200 },
  { top: 300, bottom: 350 },
  { top: 400, bottom: 480 },
  { top: 520, bottom: 590 },
];
const NOW = 420;

describe("nextCardIndex (↑ and ↓)", () => {
  test.each<[string, number | null, 1 | -1, number | null]>([
    ["↓ with nothing selected takes the block running now", null, 1, 2],
    [
      "↑ with nothing selected takes the last one started before now",
      null,
      -1,
      2,
    ],
    ["↓ from a selected card goes to the next", 1, 1, 2],
    ["↑ from a selected card goes to the one before", 1, -1, 0],
    ["↓ stops at the last", 3, 1, 3],
    ["↑ stops at the first", 0, -1, 0],
  ])("%s", (_, current, direction, index) => {
    expect(nextCardIndex(cards, current, direction, NOW)).toBe(index);
  });

  test("past every card, ↓ takes the last; before them all, ↑ takes the first", () => {
    expect(nextCardIndex(cards, null, 1, 900)).toBe(3);
    expect(nextCardIndex(cards, null, -1, 50)).toBe(0);
    expect(nextCardIndex([], null, 1, 0)).toBeNull();
  });
});

describe("shortcutTarget (D, P, S, U)", () => {
  const base = {
    focused: null,
    current: "edit",
    toMark: null,
    lastMarked: "lunch",
  };
  test.each<
    [string, Parameters<typeof shortcutTarget<string>>[0], string | null]
  >([
    [
      "the selected block first",
      { ...base, command: "done", focused: "gym" },
      "gym",
    ],
    ["else the current block", { ...base, command: "skip" }, "edit"],
    ["Undo takes back the last mark", { ...base, command: "undo" }, "lunch"],
    [
      "between blocks, the one waiting to be marked",
      { ...base, command: "done", current: null, toMark: "lunch" },
      "lunch",
    ],
    [
      "nothing to act on",
      {
        command: "partly",
        focused: null,
        current: null,
        toMark: null,
        lastMarked: null,
      },
      null,
    ],
  ])("%s", (_, input, target) => {
    expect(shortcutTarget(input)).toBe(target);
  });
});

describe("shortcutApplies", () => {
  const planned = { status: "planned", plannedStartMin: 540 };
  const done = { status: "done", plannedStartMin: 540 };
  test.each<[string, "done" | "partly" | "skip" | "undo", object, boolean]>([
    ["Done on a block not marked", "done", planned, true],
    ["Skip on a done block would erase what happened: no", "skip", done, false],
    ["Partly on a done block: no", "partly", done, false],
    ["Undo on a done block", "undo", done, true],
    ["Undo on a block not marked: nothing to undo", "undo", planned, false],
    [
      "Undo takes back the minimum",
      "undo",
      { ...planned, minimumChosen: true },
      true,
    ],
    ["an unplanned entry is not marked", "undo", { status: "done" }, false],
  ])("%s", (_, command, block, applies) => {
    expect(shortcutApplies(command, block as never)).toBe(applies);
  });
});
