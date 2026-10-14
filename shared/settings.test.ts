import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, isTimeZoneName } from "./settings";
import { isValidMinute } from "./time";

describe("DEFAULT_SETTINGS", () => {
  test("its times are valid start minutes", () => {
    const { gridStartMin, wakeMin, sleepMin } = DEFAULT_SETTINGS;
    for (const minute of [gridStartMin, wakeMin, sleepMin]) {
      expect(isValidMinute(minute)).toBe(true);
    }
  });

  test("the week starts on Monday", () => {
    expect(DEFAULT_SETTINGS.weekStartsOn).toBe(1);
  });
});

describe("isTimeZoneName", () => {
  test.each([
    "Europe/Prague",
    "UTC",
    "America/Argentina/Buenos_Aires",
    "America/Port-au-Prince",
    "Etc/GMT+1",
    "Etc/GMT-14",
    "EST5EDT",
  ])("%j is shaped like a time zone", (zone) => {
    expect(isTimeZoneName(zone)).toBe(true);
  });

  test.each([
    "",
    "not a zone",
    "/Europe/Prague",
    "Europe/",
    "Europe//Prague",
    "Europe/Prague\n",
    "1Europe/Prague",
    "Europe/Prague<script>",
    "Europe/" + "x".repeat(60),
  ])("%j is not a time zone", (value) => {
    expect(isTimeZoneName(value)).toBe(false);
  });
});
