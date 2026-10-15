import type { DateKey, LocalMoment } from "@shared/time";
import type { Doc } from "@/lib/api";
import type { GridCard } from "./DayGrid";
import { cardName, cardTime, planCardState, planLane } from "./dayView";

// The cards a day grid draws, from the blocks and what they belong to. Shared by the
// day view and the plan screen.

/** What every card shows of its block, in either lane. */
export function cardLooks(
  block: Doc<"blocks">,
  categories: readonly Doc<"categories">[],
  activities: readonly Doc<"activities">[],
  selectedId: string | undefined,
): Pick<
  GridCard,
  "key" | "title" | "focus" | "icon" | "colorKey" | "selected" | "hasNote"
> {
  const category = categories.find((item) => item._id === block.categoryId);
  const activity =
    block.activityId === undefined
      ? undefined
      : activities.find((item) => item._id === block.activityId);
  return {
    key: block._id,
    title: block.title,
    focus: block.focus,
    icon: activity?.icon ?? category?.icon,
    colorKey: category?.colorKey ?? "gray",
    selected: block._id === selectedId,
    hasNote: block.note !== undefined,
  };
}

/** The plan lane's cards for `date`'s grid at `now`. */
export function planCards({
  blocks,
  date,
  gridStartMin,
  now,
  categories,
  activities,
  selectedId,
}: {
  blocks: readonly Doc<"blocks">[];
  date: DateKey;
  gridStartMin: number;
  now: LocalMoment;
  categories: readonly Doc<"categories">[];
  activities: readonly Doc<"activities">[];
  selectedId: string | undefined;
}): GridCard[] {
  return planLane(blocks, date, gridStartMin).map(({ block, segment }) => ({
    ...cardLooks(block, categories, activities, selectedId),
    time: cardTime(block, segment),
    name: cardName(block, segment, date),
    top: segment.top,
    height: segment.height,
    state: planCardState(block, now),
    cutTop: segment.startsBefore,
    cutBottom: segment.endsAfter,
    openable: true,
  }));
}
