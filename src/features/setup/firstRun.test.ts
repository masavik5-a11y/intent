import { describe, expect, test } from "vitest";
import type { Doc, Id } from "@/lib/api";
import { starterActivities, starterCreateArgs } from "./firstRun";

function category(name: string, sortOrder: number, archived = false) {
  return {
    _id: `c-${name}` as Id<"categories">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    name,
    kind: "intentional",
    colorKey: "violet",
    icon: "brain",
    sortOrder,
    archived,
  } satisfies Doc<"categories">;
}

const categories = [
  category("Old", 0, true),
  category("Deep work", 1),
  category("Body", 2),
  category("Mind", 3),
];

describe("starterActivities", () => {
  test("three empty cards in the first three categories in use", () => {
    expect(starterActivities(categories)).toEqual([
      { name: "", categoryId: "c-Deep work", why: "", costOfSkipping: "" },
      { name: "", categoryId: "c-Body", why: "", costOfSkipping: "" },
      { name: "", categoryId: "c-Mind", why: "", costOfSkipping: "" },
    ]);
  });

  test("fewer categories: the first one fills in", () => {
    const cards = starterActivities([category("Body", 0)]);
    expect(cards.map((card) => card.categoryId)).toEqual([
      "c-Body",
      "c-Body",
      "c-Body",
    ]);
  });
});

describe("starterCreateArgs", () => {
  test("creates the named cards only, with countdown for deep work", () => {
    const [deep, body, mind] = starterActivities(categories);
    if (deep === undefined || body === undefined || mind === undefined) {
      throw new Error("three cards expected");
    }
    const args = starterCreateArgs(
      [
        {
          ...deep,
          name: "Script the reel",
          why: "One reel a week.",
          costOfSkipping: "  ",
        },
        { ...body, name: "  " },
        { ...mind, name: "Meditation", costOfSkipping: "A louder head." },
      ],
      categories,
    );
    expect(args).toEqual([
      {
        name: "Script the reel",
        categoryId: "c-Deep work",
        defaultDurationMin: 60,
        notify: true,
        pressure: true,
        why: "One reel a week.",
      },
      {
        name: "Meditation",
        categoryId: "c-Mind",
        defaultDurationMin: 60,
        notify: true,
        pressure: false,
        costOfSkipping: "A louder head.",
      },
    ]);
  });
});
