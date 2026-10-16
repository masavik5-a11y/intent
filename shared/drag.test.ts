import { describe, expect, test } from "vitest";
import { draggedSpan, dropSpan, sameSpan, type GridSpan } from "./drag";

// A grid from 05:00: position 240 is 09:00.
const OPEN = { minTop: 0, maxTop: 1435, maxBottom: 1440 };
const gym: GridSpan = { top: 240, height: 90 }; // 09:00–10:30
const lunch: GridSpan = { top: 420, height: 60 }; // 12:00–13:00
const edit: GridSpan = { top: 540, height: 120 }; // 14:00–16:00

describe("draggedSpan", () => {
  test.each<[string, "move" | "resize", number, GridSpan]>([
    [
      "a move snaps the start to 5 minutes",
      "move",
      33,
      { top: 275, height: 90 },
    ],
    ["and keeps the length", "move", -62, { top: 180, height: 90 }],
    ["a resize snaps the end", "resize", 13, { top: 240, height: 105 }],
    ["never shorter than 5 minutes", "resize", -200, { top: 240, height: 5 }],
    ["never above the grid", "move", -400, { top: 0, height: 90 }],
    ["never past its end", "move", 2000, { top: 1350, height: 90 }],
    ["a resize stops at the end", "resize", 5000, { top: 240, height: 1200 }],
  ])("%s", (_, mode, delta, span) => {
    expect(draggedSpan(gym, mode, delta, OPEN)).toEqual(span);
  });

  test("today's plan starts no earlier than now; an actual entry ends by now", () => {
    expect(draggedSpan(gym, "move", -60, { ...OPEN, minTop: 230 })).toEqual({
      top: 230,
      height: 90,
    });
    expect(draggedSpan(gym, "resize", 60, { ...OPEN, maxBottom: 350 })).toEqual(
      { top: 240, height: 110 },
    );
    expect(draggedSpan(gym, "move", 60, { ...OPEN, maxBottom: 350 })).toEqual({
      top: 260,
      height: 90,
    });
  });
});

describe("dropSpan never makes an overlap and moves nothing else", () => {
  const taken = [lunch, edit];

  test.each<[string, GridSpan, "move" | "resize", number, GridSpan]>([
    [
      "into free time, it goes there",
      gym,
      "move",
      60,
      { top: 300, height: 90 },
    ],
    [
      "onto lunch, it stops flush above it",
      gym,
      "move",
      120,
      { top: 330, height: 90 },
    ],
    [
      "past lunch into the free hour, it jumps over",
      { top: 240, height: 60 },
      "move",
      240,
      { top: 480, height: 60 },
    ],
    [
      "too long for the free hour, it slides back above lunch",
      gym,
      "move",
      240,
      { top: 330, height: 90 },
    ],
    [
      "resized into lunch, it ends where lunch begins",
      gym,
      "resize",
      300,
      { top: 240, height: 180 },
    ],
    [
      "moved up into what is before it, it stops at its end",
      { top: 480, height: 30 },
      "move",
      -45,
      { top: 480, height: 30 },
    ],
    [
      "moved up past lunch, it lands before it",
      { top: 480, height: 30 },
      "move",
      -120,
      { top: 360, height: 30 },
    ],
  ])("%s", (_, origin, mode, delta, landed) => {
    const result = dropSpan({
      origin,
      mode,
      deltaMin: delta,
      limits: OPEN,
      taken,
    });
    expect(result).toEqual(landed);
    for (const other of taken) {
      expect(
        result.top < other.top + other.height &&
          other.top < result.top + result.height,
      ).toBe(false);
    }
  });

  test("hemmed in on both sides, a block stays where it was", () => {
    const tight = { top: 480, height: 60 }; // 13:00–14:00, between lunch and edit
    expect(
      dropSpan({
        origin: tight,
        mode: "resize",
        deltaMin: 30,
        limits: OPEN,
        taken,
      }),
    ).toEqual(tight);
    expect(
      dropSpan({
        origin: tight,
        mode: "move",
        deltaMin: 15,
        limits: OPEN,
        taken,
      }),
    ).toEqual(tight);
  });

  test("a block from another day's grid counts too, at its own position", () => {
    // Last night's sleep runs into this grid until 07:00 (position 120).
    const sleepTail = { top: -360, height: 480 };
    expect(
      dropSpan({
        origin: gym,
        mode: "move",
        deltaMin: -200,
        limits: OPEN,
        taken: [sleepTail],
      }),
    ).toEqual({ top: 120, height: 90 });
  });

  test("sameSpan tells a drop that changed nothing", () => {
    expect(sameSpan(gym, { top: 240, height: 90 })).toBe(true);
    expect(sameSpan(gym, { top: 245, height: 90 })).toBe(false);
  });
});
