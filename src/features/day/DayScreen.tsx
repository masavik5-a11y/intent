import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { hasPlan, type StatusAction } from "@shared/blocks";
import {
  CLICK_SNAP_MIN,
  gridDayOf,
  gridPosition,
  momentAt,
  slotStart,
} from "@shared/grid";
import { minuteFrom } from "@shared/lanes";
import { DEFAULT_SETTINGS } from "@shared/settings";
import type { DateKey, LocalMoment } from "@shared/time";
import { BlockDetailPanel } from "@/features/block-detail/BlockDetailPanel";
import type { BlockChanges } from "@/features/block-detail/BlockDetail";
import { api, type Doc, type Id } from "@/lib/api";
import { useSetStatus } from "@/lib/blockStatus";
import { saveErrorMessage } from "@/lib/errorMessages";
import { useNow } from "@/lib/now";
import { useIsPhone, useMediaQuery } from "@/lib/useMediaQuery";
import { DayGrid, type GridCard } from "./DayGrid";
import { DayHeader } from "./DayHeader";
import { NowPanel } from "@/features/now/NowPanel";
import { nowView } from "@/features/now/nowView";
import { cardName, cardTime, dayTense, itemAt, planLane } from "./dayView";
import { QuickAdd } from "./QuickAdd";
import { DEFAULT_DURATION_MIN, type NewBlockArgs } from "./QuickAddForm";
import { suggestedStart } from "./quickAddRules";

/** How long the now panel keeps the last marked block in view, with Undo. */
const MARKED_SHOWN_MIN = 10;

/** What quick add was opened for: a clicked grid position, or nothing in particular. */
export type AddRequest = { position: number | null };

interface DayScreenProps {
  date: DateKey;
  /** Quick add is open (it lives in the URL, so the back gesture closes it). */
  add: AddRequest | undefined;
  onOpenAdd: (position: number | null) => void;
  /** The block whose detail is open, also from the URL. */
  selectedBlockId: string | undefined;
  onSelectBlock: (blockId: Id<"blocks">) => void;
  /** Closes quick add or the block detail. */
  onCloseOverlay: () => void;
}

/** The day view (DESIGN.md section 2): header, the two-lane grid, quick add. */
export function DayScreen({
  date,
  add,
  onOpenAdd,
  selectedBlockId,
  onSelectBlock,
  onCloseOverlay,
}: DayScreenProps) {
  const settings = useQuery(api.settings.get);
  const blocks = useQuery(api.blocks.listForDay, { date });
  const categories = useQuery(api.categories.list);
  const activities = useQuery(api.activities.list);
  const createBlock = useMutation(api.blocks.create);
  const updateBlock = useMutation(api.blocks.update);
  const removeBlock = useMutation(api.blocks.remove);
  const setStatus = useSetStatus();
  const now = useNow();
  const [marked, setMarked] = useState<{
    id: Id<"blocks">;
    at: LocalMoment;
  } | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const isPhone = useIsPhone();
  const isWide = useMediaQuery("(min-width: 1024px)");

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
      time: cardTime(block, segment),
      name: cardName(block, segment, date),
      top: segment.top,
      height: segment.height,
      current: current?.block._id === block._id,
      selected: block._id === selectedBlockId,
      cutTop: segment.startsBefore,
      cutBottom: segment.endsAfter,
    };
  });

  /** Runs a change and closes the open panel; a failure becomes its message. */
  async function attempt(
    change: () => Promise<unknown>,
  ): Promise<string | null> {
    try {
      await change();
      onCloseOverlay();
      return null;
    } catch (error) {
      return saveErrorMessage(error);
    }
  }
  const saveBlock = (args: NewBlockArgs) => attempt(() => createBlock(args));

  /** Done, Partly, Skip or Undo. The screen changes at once; a refusal is shown. */
  function mark(blockId: Id<"blocks">, action: StatusAction) {
    setStatusError(null);
    if (action.type !== "undo") setMarked({ id: blockId, at: now });
    void setStatus(blockId, action).then(setStatusError);
  }
  const lastMarked =
    marked !== null &&
    minuteFrom(marked.at.date, now) - marked.at.minute < MARKED_SHOWN_MIN
      ? blocks?.find((block) => block._id === marked.id)
      : undefined;

  const selected = blocks
    ?.filter(hasPlan)
    .find((block) => block._id === selectedBlockId);
  // The now panel belongs to today (DESIGN.md section 2).
  const nowPanel =
    tense === "today" &&
    blocks !== undefined &&
    activities !== undefined &&
    categories !== undefined
      ? nowView(blocks, activities, categories, now)
      : null;

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
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <DayHeader date={date} today={today} onAdd={() => onOpenAdd(null)} />
        {!isWide && nowPanel !== null && (
          <div className="border-b">
            <NowPanel
              view={nowPanel}
              compact
              lastMarked={lastMarked}
              error={statusError}
              onAction={mark}
            />
          </div>
        )}
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
          settled={ready}
          onOpenCard={(key) => onSelectBlock(key as Id<"blocks">)}
        />
      </div>
      {isWide && selected === undefined && nowPanel !== null && (
        <aside className="w-[340px] shrink-0 overflow-y-auto border-l">
          <NowPanel
            view={nowPanel}
            compact={false}
            lastMarked={lastMarked}
            error={statusError}
            onAction={mark}
          />
        </aside>
      )}
      {selected !== undefined &&
        activities !== undefined &&
        categories !== undefined &&
        blocks !== undefined && (
          <BlockDetailPanel
            wide={isWide}
            block={selected}
            viewedDay={date}
            activities={activities}
            categories={categories}
            blocks={blocks}
            onSave={(changes: BlockChanges) =>
              attempt(() => updateBlock(changes))
            }
            onDelete={() =>
              attempt(() => removeBlock({ blockId: selected._id }))
            }
            now={now}
            statusError={statusError}
            onAction={(action) => mark(selected._id, action)}
            onCancel={onCloseOverlay}
          />
        )}
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
