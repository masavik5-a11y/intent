import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import {
  entryDraftOf,
  entryProblem,
  entryStart,
  entryUpdateArgs,
} from "./entryDraft";

const TUE = "2026-10-13" as DateKey;
const WED = "2026-10-14" as DateKey;

const drift: Doc<"categories"> = {
  _id: "c-drift" as Id<"categories">,
  _creationTime: 0,
  userId: "u" as Id<"users">,
  name: "Drift",
  kind: "drift",
  colorKey: "red",
  icon: "cloud",
  sortOrder: 7,
  archived: false,
};
const body = { ...drift, _id: "c-body" as Id<"categories">, name: "Body" };

const phone: Doc<"blocks"> = {
  _id: "e1" as Id<"blocks">,
  _creationTime: 0,
  userId: "u" as Id<"users">,
  date: TUE,
  title: "Phone",
  categoryId: drift._id,
  status: "done",
  actualStartMin: 780, // 13:00
  actualDurationMin: 45,
};

describe("entryDraft", () => {
  test("holds the entry as it is; nothing changed sends only the id", () => {
    expect(entryDraftOf(phone)).toEqual({
      title: "Phone",
      categoryId: drift._id,
      startClockMin: 780,
      durationMin: 45,
      note: "",
    });
    expect(
      entryUpdateArgs(phone, entryDraftOf(phone), 300, [drift, body]),
    ).toEqual({ blockId: "e1" });
  });

  test("sends what changed; a blank title goes back to the category's name", () => {
    const draft = {
      ...entryDraftOf(phone),
      title: " ",
      categoryId: body._id,
      durationMin: 30,
      note: "Ran instead.",
    };
    expect(entryUpdateArgs(phone, draft, 300, [drift, body])).toEqual({
      blockId: "e1",
      title: "Body",
      categoryId: body._id,
      actualDurationMin: 30,
      note: "Ran instead.",
    });
  });

  test("a start after midnight moves it to the next calendar day", () => {
    const draft = { ...entryDraftOf(phone), startClockMin: 60 }; // 01:00
    expect(entryStart(phone, draft, 300)).toEqual({ date: WED, minute: 60 });
    expect(entryUpdateArgs(phone, draft, 300, [drift])).toEqual({
      blockId: "e1",
      date: WED,
      actualStartMin: 60,
    });
  });

  test("an entry after midnight stays on the grid it was on", () => {
    const late = { ...phone, date: WED, actualStartMin: 60 }; // Tue's grid
    const draft = { ...entryDraftOf(late), startClockMin: 1410 }; // 23:30
    expect(entryUpdateArgs(late, draft, 300, [drift])).toEqual({
      blockId: "e1",
      date: TUE,
      actualStartMin: 1410,
    });
  });

  test("moving an early-morning entry past the grid start moves it minutes, not a day", () => {
    // Wed 04:30 sits at the bottom of Tuesday's grid; 05:10 is forty minutes later.
    const early = {
      ...phone,
      date: WED,
      actualStartMin: 270,
      actualDurationMin: 60,
    };
    const draft = { ...entryDraftOf(early), startClockMin: 310 };
    expect(entryStart(early, draft, 300)).toEqual({ date: WED, minute: 310 });
    expect(entryUpdateArgs(early, draft, 300, [drift])).toEqual({
      blockId: "e1",
      actualStartMin: 310,
    });
  });

  test.each([
    [{ startClockMin: 782 }, "Use a start time in 5-minute steps."],
    [{ durationMin: 0 }, "Use a length from 5 minutes to 24 hours."],
    [{}, null],
  ])("problem with %o: %s", (change, message) => {
    expect(entryProblem({ ...entryDraftOf(phone), ...change })).toBe(message);
  });
});
