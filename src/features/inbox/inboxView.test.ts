import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import { captureArgs, capturedText, scheduleChoices } from "./inboxView";

const gym: Doc<"activities"> = {
  _id: "a-gym" as Id<"activities">,
  _creationTime: 0,
  userId: "u" as Id<"users">,
  name: "Gym",
  categoryId: "c" as Id<"categories">,
  defaultDurationMin: 90,
  notify: true,
  pressure: false,
  archived: false,
};

describe("captureArgs", () => {
  test("a capture that names an activity points at it", () => {
    expect(captureArgs(" gym ", [gym])).toEqual({
      title: " gym ",
      activityId: "a-gym",
    });
  });
  test("anything else is just its words", () => {
    expect(captureArgs("Call the venue", [gym])).toEqual({
      title: "Call the venue",
    });
    expect(captureArgs("Gym", [{ ...gym, archived: true }])).toEqual({
      title: "Gym",
    });
  });
});

describe("scheduling words", () => {
  test("today and tomorrow first", () => {
    expect(scheduleChoices("2026-10-16" as DateKey)).toEqual([
      { label: "Today", date: "2026-10-16" },
      { label: "Tomorrow", date: "2026-10-17" },
    ]);
  });
  test("when it was captured", () => {
    expect(capturedText("2026-10-16" as DateKey)).toBe("Captured Fri 16 Oct");
  });
});
