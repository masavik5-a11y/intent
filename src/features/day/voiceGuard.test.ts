import { describe, expect, test } from "vitest";

// DESIGN.md section 9: the interface never judges. Nothing the day, the now panel, the
// review, planning or block detail says mentions missed days, streaks or failure. This
// reads every string and every piece of JSX text in their sources (comments and names
// are code, not words on screen) and looks for the words that would.

const FORBIDDEN =
  /\b(miss(?:ed|ing)?|streaks?|fail(?:ed|ure|ing)?|wasted?|lazy|overdue|give up)\b/i;

const sources = import.meta.glob<string>(
  [
    "/src/features/{day,now,review,planning,block-detail,recurrence,goals,week,month,inbox,replan}/*.{ts,tsx}",
    "!**/*.test.*",
  ],
  { query: "?raw", import: "default", eager: true },
);

/** The words a source can put on screen: its string literals and its JSX text. */
function shownText(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const strings = [...code.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map(
    (match) => match[1] ?? match[2] ?? "",
  );
  const jsxText = [...code.matchAll(/>([^<>{}]+)</g)].map(
    (match) => match[1] ?? "",
  );
  return [...strings, ...jsxText].filter((text) => /[a-z]/i.test(text));
}

describe("the screens speak plainly and never judge (DESIGN.md section 9)", () => {
  test("the sources are all read", () => {
    expect(Object.keys(sources)).toEqual(
      expect.arrayContaining([
        "/src/features/day/WelcomeBack.tsx",
        "/src/features/review/ReviewSteps.tsx",
        "/src/features/planning/PlanScreen.tsx",
        "/src/features/block-detail/RepeatSection.tsx",
        "/src/features/goals/GoalList.tsx",
        "/src/features/week/WeekScreen.tsx",
      ]),
    );
  });

  test("no word about missed days, streaks or failure", () => {
    for (const [file, source] of Object.entries(sources)) {
      for (const text of shownText(source)) {
        expect(text, file).not.toMatch(FORBIDDEN);
      }
    }
  });

  test("the guard does catch such a word", () => {
    expect(shownText("<p>You missed 4 days</p>").join(" ")).toMatch(FORBIDDEN);
    expect(shownText('const label = "Streak: 0";').join(" ")).toMatch(
      FORBIDDEN,
    );
    // A name in the code is not on screen.
    expect(shownText("} catch (failure) {").join(" ")).not.toMatch(FORBIDDEN);
  });
});
