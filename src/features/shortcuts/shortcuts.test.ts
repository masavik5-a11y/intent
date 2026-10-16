import { describe, expect, test } from "vitest";
import { appCommand, dayCommand, SHORTCUT_GROUPS } from "./shortcuts";

const press = (
  key: string,
  extra: Partial<Parameters<typeof dayCommand>[0]> = {},
) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
});

describe("keyboard shortcuts (DESIGN.md section 8)", () => {
  test.each([
    ["ArrowLeft", "previousDay"],
    ["ArrowRight", "nextDay"],
    ["n", "add"],
    ["L", "log"],
    ["ArrowUp", "previousBlock"],
    ["ArrowDown", "nextBlock"],
    ["Enter", "open"],
    ["d", "done"],
    ["p", "partly"],
    ["s", "skip"],
    ["u", "undo"],
    ["x", "notFeeling"],
    ["r", "review"],
    ["q", null],
  ])("%s on the day: %s", (key, command) => {
    expect(dayCommand(press(key))).toBe(command);
  });

  test("with Ctrl, Cmd or Alt held a key is the browser's", () => {
    expect(dayCommand(press("d", { ctrlKey: true }))).toBeNull();
    expect(dayCommand(press("r", { metaKey: true }))).toBeNull();
    expect(appCommand(press("t", { altKey: true }))).toBeNull();
  });

  test("T and ? work anywhere", () => {
    expect(appCommand(press("t"))).toBe("today");
    expect(appCommand(press("T"))).toBe("today");
    expect(appCommand(press("?"))).toBe("help");
    expect(appCommand(press("n"))).toBeNull();
  });

  test("the overlay lists every key of DESIGN.md section 8", () => {
    const listed = SHORTCUT_GROUPS.flatMap((group) =>
      group.rows.flatMap((row) => row.keys),
    );
    for (const key of [
      "T",
      "←",
      "→",
      "N",
      "L",
      "↑",
      "↓",
      "Enter",
      "D",
      "P",
      "S",
      "U",
      "X",
      "R",
      "Esc",
      "?",
    ]) {
      expect(listed).toContain(key);
    }
  });
});
