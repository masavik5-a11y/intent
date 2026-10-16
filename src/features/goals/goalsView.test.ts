import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import {
  dueText,
  goalChipText,
  goalCreateArgs,
  goalDraftOf,
  goalDraftProblem,
  goalUpdateArgs,
  investedText,
  parseWeeklyTarget,
  sortGoals,
  targetCategories,
  weeklyTargetText,
} from "./goalsView";

const TODAY = "2026-10-14" as DateKey;

function goal(id: string, extra: Partial<Doc<"goals">> = {}): Doc<"goals"> {
  return {
    _id: id as Id<"goals">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    title: id,
    createdOn: "2026-10-01" as DateKey,
    status: "active",
    sortOrder: 0,
    ...extra,
  };
}

describe("sortGoals", () => {
  test("active by due date, undated after in their order, closed apart", () => {
    const goals = [
      goal("undated-late", { sortOrder: 3 }),
      goal("nov", { dueDate: "2026-11-21" as DateKey, sortOrder: 0 }),
      goal("done", { status: "done", sortOrder: 1 }),
      goal("oct", { dueDate: "2026-10-20" as DateKey, sortOrder: 2 }),
      goal("undated-early", { sortOrder: 1 }),
      goal("dropped", { status: "dropped", sortOrder: 0 }),
    ];
    const { active, closed } = sortGoals(goals);
    expect(active.map((item) => item._id)).toEqual([
      "oct",
      "nov",
      "undated-early",
      "undated-late",
    ]);
    expect(closed.map((item) => item._id)).toEqual(["dropped", "done"]);
  });
});

describe("the facts a goal shows", () => {
  test.each([
    ["2026-11-21", "Sat 21 Nov · 38 days left", "Launch · 38 days left"],
    ["2026-10-14", "Wed 14 Oct · due today", "Launch · due today"],
    ["2026-10-11", "Sun 11 Oct · 3 days over", "Launch · 3 days over"],
  ])("due %s", (due, text, chip) => {
    const item = goal("g", { title: "Launch", dueDate: due as DateKey });
    expect(dueText(item, TODAY)).toBe(text);
    expect(goalChipText(item, TODAY)).toBe(chip);
  });

  test("without a date: no due line, the chip is the title", () => {
    expect(dueText(goal("Read more"), TODAY)).toBeNull();
    expect(goalChipText(goal("Read more"), TODAY)).toBe("Read more");
  });

  test.each([
    [undefined, null],
    [{ minutes: 0, capped: false }, "No hours yet"],
    [{ minutes: 1230, capped: false }, "20h 30m invested"],
    [{ minutes: 2400, capped: true }, "40h+ invested"],
  ])("invested %j", (invested, text) => {
    expect(investedText(invested)).toBe(text);
  });
});

describe("the goal form", () => {
  test("problems in the form's words", () => {
    const ok = { title: "Launch", why: "", dueDate: "" };
    expect(goalDraftProblem(ok)).toBeNull();
    expect(goalDraftProblem({ ...ok, title: "  " })).toBe("Give it a name.");
    expect(goalDraftProblem({ ...ok, dueDate: "2026-02-30" })).toBe(
      "Choose a date, or leave it empty.",
    );
  });

  test("create sends what is filled in", () => {
    expect(
      goalCreateArgs({ title: "Launch", why: " ", dueDate: "" }, TODAY),
    ).toEqual({ title: "Launch", today: TODAY });
    expect(
      goalCreateArgs(
        { title: "Launch", why: "Asked twice.", dueDate: "2026-11-21" },
        TODAY,
      ),
    ).toEqual({
      title: "Launch",
      why: "Asked twice.",
      dueDate: "2026-11-21",
      today: TODAY,
    });
  });

  test("update sends only what changed, and null for what was emptied", () => {
    const item = goal("g", {
      title: "Launch",
      why: "Asked twice.",
      dueDate: "2026-11-21" as DateKey,
    });
    expect(goalUpdateArgs(item, goalDraftOf(item))).toEqual({ goalId: "g" });
    expect(
      goalUpdateArgs(item, { title: "Launch it", why: "", dueDate: "" }),
    ).toEqual({ goalId: "g", title: "Launch it", why: null, dueDate: null });
  });
});

describe("weekly targets", () => {
  test.each([
    ["15", 900],
    ["7.5", 450],
    ["7,5", 450],
    ["7h 30m", 450],
    ["90m", 90],
    ["", null],
    ["  ", null],
    ["0", undefined],
    ["169", undefined],
    ["7.51", undefined],
    ["lots", undefined],
  ])("%j is %j", (text, minutes) => {
    expect(parseWeeklyTarget(text)).toBe(minutes);
  });

  test.each([
    [undefined, ""],
    [900, "15"],
    [450, "7.5"],
    [455, "7h 35m"],
  ])("%j shows as %j", (minutes, text) => {
    expect(weeklyTargetText(minutes)).toBe(text);
  });

  test("drift and archived categories take no target", () => {
    const category = (
      id: string,
      kind: Doc<"categories">["kind"],
      archived = false,
    ): Doc<"categories"> => ({
      _id: id as Id<"categories">,
      _creationTime: 0,
      userId: "u" as Id<"users">,
      name: id,
      kind,
      colorKey: "violet",
      icon: "brain",
      sortOrder: 0,
      archived,
    });
    expect(
      targetCategories([
        category("deep", "intentional"),
        category("life", "maintenance"),
        category("drift", "drift"),
        category("old", "intentional", true),
      ]).map((item) => item._id),
    ).toEqual(["deep", "life"]);
  });
});
