import { useQuery } from "convex/react";
import { gridDayOf, gridPosition } from "@shared/grid";
import { DEFAULT_SETTINGS } from "@shared/settings";
import type { DateKey } from "@shared/time";
import { api, type Doc, type Id } from "@/lib/api";
import { useNow } from "@/lib/now";
import { useIsPhone } from "@/lib/useMediaQuery";
import { DayGrid, type GridCard } from "./DayGrid";
import { DayHeader } from "./DayHeader";
import { dayTense, itemAt, planLane } from "./dayView";

/** The day view (DESIGN.md section 2): header and the two-lane grid. */
export function DayScreen({ date }: { date: DateKey }) {
  const settings = useQuery(api.settings.get);
  const blocks = useQuery(api.blocks.listForDay, { date });
  const categories = useQuery(api.categories.list);
  const activities = useQuery(api.activities.list);
  const now = useNow();
  const isPhone = useIsPhone();

  // Until the first visit has created settings, the defaults stand in.
  const { gridStartMin, wakeMin, sleepMin } = settings ?? DEFAULT_SETTINGS;
  const today = gridDayOf(now, gridStartMin);
  const tense = dayTense(date, today);
  const nowPosition =
    tense === "today" ? gridPosition(date, gridStartMin, now) : null;

  const items =
    blocks === undefined ? [] : planLane(blocks, date, gridStartMin);
  const current = nowPosition === null ? undefined : itemAt(items, nowPosition);
  const categoryOf = indexById(categories);
  const activityOf = indexById(activities);

  const cards: GridCard[] = items.map(({ block, segment }) => {
    const category = categoryOf.get(block.categoryId);
    const activity =
      block.activityId === undefined
        ? undefined
        : activityOf.get(block.activityId);
    return {
      key: block._id,
      title: block.title,
      focus: block.focus,
      icon: activity?.icon ?? category?.icon,
      colorKey: category?.colorKey ?? "gray",
      startMin: block.plannedStartMin,
      durationMin: block.plannedDurationMin,
      top: segment.top,
      height: segment.height,
      current: current?.block._id === block._id,
      cutTop: segment.startsBefore,
      cutBottom: segment.endsAfter,
    };
  });

  return (
    <div className="flex h-full flex-col">
      <DayHeader date={date} today={today} />
      {blocks !== undefined && items.length === 0 && (
        <p className="border-b px-4 py-2 text-sm text-muted-foreground">
          {tense === "past"
            ? "Nothing was planned for this day."
            : "Nothing planned yet. Start with one block."}
        </p>
      )}
      <DayGrid
        dayKey={date}
        gridStartMin={gridStartMin}
        wakeMin={wakeMin}
        sleepMin={sleepMin}
        isPhone={isPhone}
        cards={cards}
        nowPosition={nowPosition}
        futureFrom={
          tense === "future" ? 0 : tense === "today" ? nowPosition : null
        }
      />
    </div>
  );
}

function indexById<T extends Doc<"categories"> | Doc<"activities">>(
  docs: readonly T[] | undefined,
): Map<Id<"categories"> | Id<"activities">, T> {
  return new Map((docs ?? []).map((doc) => [doc._id, doc]));
}
