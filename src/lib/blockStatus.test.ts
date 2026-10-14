import { describe, expect, test } from "vitest";
import type { OptimisticLocalStore } from "convex/browser";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "./api";
import { setStatusLocally, withStatus } from "./blockStatus";

const TUE = "2026-10-13" as DateKey;
const WED = "2026-10-14" as DateKey;

function block(
  id: string,
  startMin: number,
  durationMin: number,
  extra: Partial<Doc<"blocks">> = {},
): Doc<"blocks"> {
  return {
    _id: id as Id<"blocks">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    date: TUE,
    title: id,
    categoryId: "c" as Id<"categories">,
    plannedStartMin: startMin,
    plannedDurationMin: durationMin,
    status: "planned",
    ...extra,
  };
}

type Day = { args: { date: DateKey }; value: Doc<"blocks">[] | undefined };

/**
 * Just enough of Convex's local store for blocks.listForDay. The real interface is
 * generic over every query; this one only ever holds days.
 */
function fakeStore(days: Day[]) {
  const store = {
    getAllQueries: () => days,
    setQuery: (
      _query: unknown,
      args: { date: DateKey },
      value: Day["value"],
    ) => {
      const day = days.find((item) => item.args.date === args.date);
      if (day !== undefined) day.value = value;
    },
    getQuery: () => undefined,
  };
  // The cast narrows Convex's generic interface to the one query used here.
  return { days, store: store as unknown as OptimisticLocalStore };
}

const evening = { date: TUE, minute: 1080 };

describe("setStatusLocally", () => {
  test("marks the block in every loaded day that holds it", () => {
    const lunch = block("lunch", 720, 60, {
      status: "done",
      actualStartMin: 720,
      actualDurationMin: 75,
    });
    const write = block("write", 780, 60);
    const { days, store } = fakeStore([
      { args: { date: TUE }, value: [lunch, write] },
      { args: { date: WED }, value: [lunch, write] },
      { args: { date: "2026-10-20" as DateKey }, value: [] },
    ]);
    setStatusLocally(store, {
      blockId: write._id,
      action: { type: "done" },
      now: evening,
    });
    for (const day of days.slice(0, 2)) {
      expect(day.value?.[1]).toMatchObject({
        status: "done",
        actualStartMin: 795, // after lunch's overrun, as the server does it
        actualDurationMin: 45,
      });
    }
    expect(days[2]?.value).toEqual([]);
  });

  test("leaves the day alone when the server would refuse", () => {
    const write = block("write", 780, 60);
    const { days, store } = fakeStore([
      { args: { date: TUE }, value: [write] },
    ]);
    setStatusLocally(store, {
      blockId: write._id,
      action: { type: "done" },
      now: { date: TUE, minute: 700 }, // before it starts
    });
    expect(days[0]?.value?.[0]).toBe(write);
  });

  test("skips days still loading", () => {
    const { days, store } = fakeStore([
      { args: { date: TUE }, value: undefined },
    ]);
    setStatusLocally(store, {
      blockId: "x" as Id<"blocks">,
      action: { type: "undo" },
      now: evening,
    });
    expect(days[0]?.value).toBeUndefined();
  });
});

describe("withStatus", () => {
  test("Undo removes actual times and a reason rather than leaving them blank", () => {
    const done = block("gym", 660, 90, {
      status: "skipped",
      skipReason: "tired",
    });
    const next = withStatus(done, {
      status: "planned",
      actualStartMin: undefined,
      actualDurationMin: undefined,
      skipReason: undefined,
      minimumChosen: undefined,
    });
    expect(next.status).toBe("planned");
    expect("skipReason" in next).toBe(false);
    expect("actualStartMin" in next).toBe(false);
  });
});
