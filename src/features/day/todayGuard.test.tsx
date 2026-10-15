import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { summarizeDay } from "@shared/summary";
import type { DateKey, LocalMoment } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import { NowPanel } from "@/features/now/NowPanel";
import { nowView } from "@/features/now/nowView";
import { DayGrid, type GridCard } from "./DayGrid";
import { DayTotals } from "./DayTotals";
import {
  actualCardName,
  actualCardState,
  actualCardTime,
  actualLane,
  cardName,
  cardTime,
  planCardState,
  planLane,
  untrackedStretches,
} from "./dayView";

// PRD V4: the anti-vision and the cost of skipping never appear on the Today screen
// by default. They are shown only when "Not feeling it" is opened. This renders what
// the Today screen renders, with every place such text could come from filled in,
// and looks for it in the HTML. Notifications are held to the same rule in M4.

const COST = "COST-OF-SKIPPING-MUST-NOT-SHOW";
const BLOCK_COST = "BLOCK-COST-MUST-NOT-SHOW";

const TUE = "2026-10-13" as DateKey;

const deep: Doc<"categories"> = {
  _id: "c-deep" as Id<"categories">,
  _creationTime: 0,
  userId: "u" as Id<"users">,
  name: "Deep work",
  kind: "intentional",
  colorKey: "violet",
  icon: "brain",
  sortOrder: 0,
  archived: false,
};

const write: Doc<"activities"> = {
  _id: "a-write" as Id<"activities">,
  _creationTime: 0,
  userId: "u" as Id<"users">,
  name: "Write",
  categoryId: deep._id,
  defaultDurationMin: 60,
  notify: true,
  pressure: true,
  archived: false,
  why: "The why may show.",
  how: "The how may show.",
  ifThen: "The if-then may show.",
  minimumVersion: "The minimum may show.",
  doneWhen: "The finish line may show.",
  costOfSkipping: COST,
};

function block(
  id: string,
  start: number,
  length: number,
  extra: Partial<Doc<"blocks">> = {},
): Doc<"blocks"> {
  return {
    _id: id as Id<"blocks">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    date: TUE,
    title: id,
    activityId: write._id,
    categoryId: deep._id,
    plannedStartMin: start,
    plannedDurationMin: length,
    status: "planned",
    costOfSkipping: BLOCK_COST,
    ...extra,
  };
}

const blocks = [
  block("Earlier", 540, 60, {
    status: "done",
    actualStartMin: 540,
    actualDurationMin: 60,
  }),
  block("Running", 780, 60, { minimumChosen: true }),
  block("Next", 900, 60),
  block("Skipped", 1000, 30, { status: "skipped", skipReason: "tired" }),
];

function render(now: LocalMoment): string {
  const view = nowView(blocks, [write], [deep], now);
  const totals = summarizeDay(
    blocks,
    () => "intentional" as const,
    TUE,
    300,
    now,
  );
  const look = (item: Doc<"blocks">) => ({
    key: item._id,
    title: item.title,
    focus: item.focus,
    icon: "brain",
    colorKey: "violet",
    selected: false,
    openable: true,
    hasNote: item.note !== undefined,
  });
  const cards: GridCard[] = planLane(blocks, TUE, 300).map((item) => ({
    ...look(item.block),
    time: cardTime(item.block, item.segment),
    name: cardName(item.block, item.segment, TUE),
    top: item.segment.top,
    height: item.segment.height,
    state: planCardState(item.block, now),
    cutTop: item.segment.startsBefore,
    cutBottom: item.segment.endsAfter,
  }));
  const actualCards: GridCard[] = actualLane(blocks, TUE, 300, now).map(
    (item) => ({
      ...look(item.block),
      time: actualCardTime(item),
      name: actualCardName(item),
      top: item.segment.top,
      height: item.segment.height,
      state: actualCardState(item),
      cutTop: item.segment.startsBefore,
      cutBottom: item.segment.endsAfter,
    }),
  );
  const panel = (compact: boolean) => (
    <NowPanel
      view={view}
      compact={compact}
      lastMarked={blocks[3]}
      error={null}
      onAction={() => undefined}
      onLog={() => undefined}
      onNotFeeling={() => undefined}
      onReview={() => undefined}
      mainFocus="Script the reel, start to end."
      totals={totals}
    />
  );
  return renderToStaticMarkup(
    <>
      {panel(false)}
      {panel(true)}
      <DayTotals totals={totals} variant="strip" />
      <DayGrid
        dayKey={TUE}
        gridStartMin={300}
        wakeMin={420}
        sleepMin={1380}
        isPhone={false}
        cards={cards}
        actualCards={actualCards}
        untracked={untrackedStretches(blocks, TUE, 300, now)}
        nowPosition={now.minute - 300}
        futureFrom={now.minute - 300}
        settled
      />
    </>,
  );
}

describe("the Today screen keeps the hard words for when you ask (PRD V4)", () => {
  test.each<[string, LocalMoment, string]>([
    ["during a block", { date: TUE, minute: 800 }, "The why may show."],
    ["between blocks", { date: TUE, minute: 860 }, "Free until 15:00"],
  ])("%s, no cost of skipping anywhere", (_, now, shown) => {
    const html = render(now);
    // The rendering is real: what may show does.
    expect(html).toContain(shown);
    expect(html).toContain("Not feeling it");
    // Today's focus (PRD P5) and the evening offer (R1) show in the panel and card.
    expect(html.split("Script the reel, start to end.")).toHaveLength(3);
    expect(html).toContain("Review the day");
    expect(html).not.toContain(COST);
    expect(html).not.toContain(BLOCK_COST);
  });

  test("the Today screen's own code never reads the compass", () => {
    // The anti-vision lives in the compass. Only the "Not feeling it" view, mounted
    // when it is opened, may query it (src/features/not-feeling/NotFeelingIt.tsx).
    const sources = import.meta.glob<string>(
      ["/src/features/{day,now,review,planning}/*.{ts,tsx}", "!**/*.test.*"],
      { query: "?raw", import: "default", eager: true },
    );
    expect(Object.keys(sources)).toContain("/src/features/day/DayScreen.tsx");
    expect(Object.keys(sources)).toContain(
      "/src/features/review/EveningReview.tsx",
    );
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/api\.compass/);
      expect(source, file).not.toMatch(/antiVision/);
    }
  });
});
