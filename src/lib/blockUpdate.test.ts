import { describe, expect, test } from "vitest";
import type { OptimisticLocalStore } from "convex/browser";
import { getFunctionName } from "convex/server";
import type { DateKey } from "@shared/time";
import { api, type Doc, type Id } from "./api";
import {
  createdBlock,
  loggedEntry,
  removeLocally,
  updateLocally,
  withUpdate,
} from "./blockUpdate";

const THU = "2026-10-15" as DateKey;
const FRI = "2026-10-16" as DateKey;
const SAT = "2026-10-17" as DateKey;
const SUN = "2026-10-18" as DateKey;

function block(id: string, date: DateKey, extra: Partial<Doc<"blocks">> = {}) {
  return {
    _id: id as Id<"blocks">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    date,
    title: id,
    categoryId: "c" as Id<"categories">,
    plannedStartMin: 1020,
    plannedDurationMin: 90,
    status: "planned",
    ...extra,
  } satisfies Doc<"blocks">;
}

/** A local store holding some listForDay and listRange results. */
function store(
  queries: {
    name: string;
    args: Record<string, unknown>;
    value: Doc<"blocks">[];
  }[],
) {
  const all = [...queries];
  const local = {
    getAllQueries: (ref: unknown) =>
      all
        .filter((query) => query.name === getFunctionName(ref as never))
        .map(({ args, value }) => ({ args, value })),
    setQuery: (ref: unknown, args: unknown, value: Doc<"blocks">[]) => {
      const query = all.find(
        (item) =>
          item.name === getFunctionName(ref as never) &&
          JSON.stringify(item.args) === JSON.stringify(args),
      );
      if (query !== undefined) query.value = value;
    },
    getQuery: () => undefined,
  };
  return { local: local as unknown as OptimisticLocalStore, all };
}

describe("withUpdate", () => {
  test("sets what is given and clears what is null", () => {
    const gym = block("Gym", FRI, { focus: "Push day", note: "Heavy." });
    expect(
      withUpdate(gym, {
        blockId: gym._id,
        plannedStartMin: 960,
        focus: null,
        title: undefined,
      }),
    ).toEqual({
      ...block("Gym", FRI, { note: "Heavy." }),
      plannedStartMin: 960,
    });
  });
});

describe("updateLocally", () => {
  test("moves a block in every loaded list, and between days when its date changes", () => {
    const gym = block("Gym", FRI);
    const lunch = block("Lunch", FRI, { plannedStartMin: 720 });
    const { local, all } = store([
      {
        name: getFunctionName(api.blocks.listForDay),
        args: { date: THU },
        value: [gym, lunch],
      },
      {
        name: getFunctionName(api.blocks.listForDay),
        args: { date: SUN },
        value: [],
      },
      {
        name: getFunctionName(api.blocks.listRange),
        args: { from: THU, to: SAT },
        value: [gym],
      },
    ]);
    updateLocally(local, { blockId: gym._id, date: SAT, plannedStartMin: 30 });
    const [thursday, sunday, range] = all;
    // Thursday's view holds Wed to Fri: Gym has left it, Lunch stays.
    expect(thursday?.value.map((item) => item._id)).toEqual(["Lunch"]);
    // Sunday's view holds Sat to Mon: Gym has come into it.
    expect(sunday?.value).toEqual([{ ...gym, date: SAT, plannedStartMin: 30 }]);
    expect(range?.value).toEqual([{ ...gym, date: SAT, plannedStartMin: 30 }]);
  });

  test("a block no list holds changes nothing", () => {
    const { local, all } = store([
      {
        name: getFunctionName(api.blocks.listForDay),
        args: { date: FRI },
        value: [],
      },
    ]);
    updateLocally(local, { blockId: "x" as Id<"blocks">, plannedStartMin: 30 });
    expect(all[0]?.value).toEqual([]);
  });
});

describe("the new block shows before the server answers (ARCHITECTURE.md section 8)", () => {
  const gym = {
    _id: "a-gym" as Id<"activities">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    name: "Gym",
    categoryId: "c-body" as Id<"categories">,
    defaultDurationMin: 90,
    notify: true,
    pressure: false,
    archived: false,
  } satisfies Doc<"activities">;

  test("from an activity, it takes the activity's name and category", () => {
    expect(
      createdBlock(
        {
          date: FRI,
          activityId: gym._id,
          plannedStartMin: 1020,
          plannedDurationMin: 90,
          focus: " Push day ",
          doneWhen: "  ",
        },
        gym,
        "pending-1" as Id<"blocks">,
      ),
    ).toEqual({
      _id: "pending-1",
      _creationTime: 0,
      userId: "u",
      date: FRI,
      title: "Gym",
      categoryId: "c-body",
      activityId: "a-gym",
      focus: "Push day",
      plannedStartMin: 1020,
      plannedDurationMin: 90,
      status: "planned",
    });
  });

  test("without a title or a category to show, nothing is shown early", () => {
    expect(
      createdBlock(
        { date: FRI, plannedStartMin: 600, plannedDurationMin: 30 },
        undefined,
        "pending-2" as Id<"blocks">,
      ),
    ).toBeNull();
  });

  test("a logged entry is titled by what was typed, else the activity, else the category", () => {
    const drift = {
      _id: "c-drift" as Id<"categories">,
      _creationTime: 0,
      userId: "u" as Id<"users">,
      name: "Drift",
      kind: "drift",
      colorKey: "red",
      icon: "cloud",
      sortOrder: 7,
      archived: false,
    } satisfies Doc<"categories">;
    const args = {
      date: FRI,
      categoryId: drift._id,
      actualStartMin: 780,
      actualDurationMin: 30,
    };
    const id = "pending-3" as Id<"blocks">;
    expect(loggedEntry(args, undefined, drift, id)).toMatchObject({
      title: "Drift",
      status: "done",
      actualStartMin: 780,
      actualDurationMin: 30,
    });
    expect(
      loggedEntry({ ...args, title: " phone " }, undefined, drift, id)?.title,
    ).toBe("phone");
    expect(loggedEntry(args, gym, drift, id)?.title).toBe("Gym");
  });

  test("a deleted block leaves every loaded list", () => {
    const gymBlock = block("Gym", FRI);
    const { local, all } = store([
      {
        name: getFunctionName(api.blocks.listForDay),
        args: { date: FRI },
        value: [gymBlock],
      },
      {
        name: getFunctionName(api.blocks.listRange),
        args: { from: THU, to: SUN },
        value: [gymBlock],
      },
    ]);
    removeLocally(local, { blockId: gymBlock._id });
    expect(all.map((query) => query.value)).toEqual([[], []]);
  });
});
