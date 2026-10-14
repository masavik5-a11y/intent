import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CLICK_SNAP_MIN,
  gridDayOf,
  gridPosition,
  momentAt,
  slotStart,
} from "@shared/grid";
import { DEFAULT_SETTINGS } from "@shared/settings";
import type { DateKey } from "@shared/time";
import { api, type Doc, type Id } from "@/lib/api";
import { saveErrorMessage } from "@/lib/errorMessages";
import { useNow } from "@/lib/now";
import { useIsPhone } from "@/lib/useMediaQuery";
import { DayGrid, type GridCard } from "./DayGrid";
import { DayHeader } from "./DayHeader";
import { dayTense, itemAt, planLane } from "./dayView";
import { QuickAdd } from "./QuickAdd";
import { DEFAULT_DURATION_MIN, type NewBlockArgs } from "./QuickAddForm";
import { suggestedStart } from "./quickAddRules";

/** What quick add was opened for: a clicked grid position, or nothing in particular. */
export type AddRequest = { position: number | null };

interface DayScreenProps {
  date: DateKey;
  /** Quick add is open (it lives in the URL, so the back gesture closes it). */
  add: AddRequest | undefined;
  onOpenAdd: (position: number | null) => void;
  /** Closes quick add or the block detail. */
  onCloseOverlay: () => void;
}

/** The day view (DESIGN.md section 2): header, the two-lane grid, quick add. */
export function DayScreen({
  date,
  add,
  onOpenAdd,
  onCloseOverlay,
}: DayScreenProps) {
  const settings = useQuery(api.settings.get);
  const blocks = useQuery(api.blocks.listForDay, { date });
  const categories = useQuery(api.categories.list);
  const activities = useQuery(api.activities.list);
  const createBlock = useMutation(api.blocks.create);
  const now = useNow();
  const isPhone = useIsPhone();

  // N opens quick add (DESIGN.md section 8), except while typing or in a dialog.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "n" && event.key !== "N") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target) || document.querySelector("[role=dialog]")) {
        return;
      }
      event.preventDefault();
      onOpenAdd(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenAdd]);

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

  async function saveBlock(args: NewBlockArgs): Promise<string | null> {
    try {
      await createBlock(args);
      onCloseOverlay();
      return null;
    } catch (error) {
      return saveErrorMessage(error);
    }
  }

  const ready =
    blocks !== undefined &&
    activities !== undefined &&
    categories !== undefined;
  const suggest = (durationMin: number) =>
    suggestedStart({
      day: date,
      gridStartMin,
      wakeMin,
      now,
      isToday: tense === "today",
      durationMin,
      blocks: blocks ?? [],
    });
  const addStart =
    add === undefined || !ready
      ? null
      : add.position === null
        ? suggest(DEFAULT_DURATION_MIN)
        : momentAt(date, gridStartMin, slotStart(add.position, CLICK_SNAP_MIN));

  return (
    <div className="flex h-full flex-col">
      <DayHeader date={date} today={today} onAdd={() => onOpenAdd(null)} />
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
        onEmptySlot={(position) =>
          onOpenAdd(slotStart(position, CLICK_SNAP_MIN))
        }
      />
      {ready && (
        <QuickAdd
          open={addStart !== null}
          isPhone={isPhone}
          onClose={onCloseOverlay}
          day={date}
          gridStartMin={gridStartMin}
          start={addStart ?? { date, minute: wakeMin }}
          suggestStart={add?.position === null ? suggest : undefined}
          activities={activities}
          categories={categories}
          blocks={blocks}
          onSave={saveBlock}
        />
      )}
    </div>
  );
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function indexById<T extends Doc<"categories"> | Doc<"activities">>(
  docs: readonly T[] | undefined,
): Map<Id<"categories"> | Id<"activities">, T> {
  return new Map((docs ?? []).map((doc) => [doc._id, doc]));
}
