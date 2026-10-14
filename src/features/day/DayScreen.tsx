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
import { summarizeDay } from "@shared/summary";
import { DEFAULT_SETTINGS } from "@shared/settings";
import { formatTimeRange, type DateKey, type LocalMoment } from "@shared/time";
import { SidePanel } from "@/components/SidePanel";
import { BlockDetail } from "@/features/block-detail/BlockDetail";
import { EntryDetail } from "@/features/block-detail/EntryDetail";
import { statusLine } from "@/features/status/statusLabels";
import { api, type BlockUpdate, type Doc, type Id } from "@/lib/api";
import { useSetStatus } from "@/lib/blockStatus";
import { saveErrorMessage } from "@/lib/errorMessages";
import { useNow } from "@/lib/now";
import { useIsPhone, useMediaQuery } from "@/lib/useMediaQuery";
import { DayGrid, type GridCard } from "./DayGrid";
import { DayHeader } from "./DayHeader";
import { NowPanel } from "@/features/now/NowPanel";
import { LogEntry } from "@/features/log/LogEntry";
import { NotFeelingIt } from "@/features/not-feeling/NotFeelingIt";
import type { NewEntryArgs } from "@/features/log/LogEntryForm";
import { defaultEntrySpan, logCategories } from "@/features/log/logRules";
import { nowView } from "@/features/now/nowView";
import {
  actualCardName,
  actualCardState,
  actualCardTime,
  actualLane,
  cardName,
  cardTime,
  dayTense,
  entryTitle,
  planCardState,
  planLane,
  untrackedStretches,
} from "./dayView";
import { DayTotals } from "./DayTotals";
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
  /** Logging an unplanned entry is open (also in the URL). */
  log: AddRequest | undefined;
  onOpenLog: (position: number | null) => void;
  /** The block "Not feeling it" is open for (also in the URL). */
  notFeelingId: string | undefined;
  onOpenNotFeeling: (blockId: Id<"blocks">) => void;
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
  log,
  onOpenLog,
  notFeelingId,
  onOpenNotFeeling,
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
  const logEntry = useMutation(api.blocks.logEntry);
  const setStatus = useSetStatus();
  const now = useNow();
  const [marked, setMarked] = useState<{
    id: Id<"blocks">;
    at: LocalMoment;
  } | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const isPhone = useIsPhone();
  const isWide = useMediaQuery("(min-width: 1024px)");

  // Until the first visit has created settings, the defaults stand in.
  const { gridStartMin, wakeMin, sleepMin } = settings ?? DEFAULT_SETTINGS;
  const today = gridDayOf(now, gridStartMin);
  const tense = dayTense(date, today);
  // Nothing has happened yet on a day still to come.
  const canLog = tense !== "future";
  // A past day's plan is frozen until "Edit plan" (PRD section 7, rule 4). Day screens
  // are keyed by date, so this resets on another day.
  const [planUnlocked, setPlanUnlocked] = useState(false);
  const planFrozen = tense === "past" && !planUnlocked;

  const nowPosition =
    tense === "today" ? gridPosition(date, gridStartMin, now) : null;

  const items =
    blocks === undefined ? [] : planLane(blocks, date, gridStartMin);
  const happened =
    blocks === undefined ? [] : actualLane(blocks, date, gridStartMin, now);
  const categoryOf = indexById(categories);
  const activityOf = indexById(activities);
  // Untracked time and the totals, live to the minute (PRD T8, U4).
  const untracked =
    blocks === undefined
      ? []
      : untrackedStretches(blocks, date, gridStartMin, now);
  const totals =
    blocks === undefined || categories === undefined || !canLog
      ? null
      : summarizeDay(
          blocks,
          (categoryId: Id<"categories">) => categoryOf.get(categoryId)?.kind,
          date,
          gridStartMin,
          now,
        );

  /** What every card shows of its block, in either lane. */
  const looksOf = (block: Doc<"blocks">) => {
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
      selected: block._id === selectedBlockId,
    };
  };
  const cards: GridCard[] = items.map(({ block, segment }) => ({
    ...looksOf(block),
    time: cardTime(block, segment),
    name: cardName(block, segment, date),
    top: segment.top,
    height: segment.height,
    state: planCardState(block, now),
    cutTop: segment.startsBefore,
    cutBottom: segment.endsAfter,
    openable: true,
  }));
  const actualCards: GridCard[] = happened.map((item) => ({
    ...looksOf(item.block),
    title: entryTitle(item.block, categoryOf.get(item.block.categoryId)),
    time: actualCardTime(item),
    name: actualCardName(item),
    top: item.segment.top,
    height: item.segment.height,
    state: actualCardState(item),
    cutTop: item.segment.startsBefore,
    cutBottom: item.segment.endsAfter,
    openable: true,
  }));

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
  const saveEntry = (args: NewEntryArgs) => attempt(() => logEntry(args));
  const saveChanges = (changes: BlockUpdate) =>
    attempt(() => updateBlock(changes));

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

  const selected = blocks?.find((block) => block._id === selectedBlockId);
  // The now panel belongs to today (DESIGN.md section 2).
  const nowPanel =
    tense === "today" &&
    blocks !== undefined &&
    activities !== undefined &&
    categories !== undefined
      ? nowView(blocks, activities, categories, now)
      : null;

  const feelingTargetId = nowPanel?.feelingTarget?.block._id ?? null;
  const feelingBlock =
    notFeelingId === undefined
      ? undefined
      : blocks?.filter(hasPlan).find((block) => block._id === notFeelingId);

  // N opens quick add, L logs what happened and X opens "Not feeling it" (DESIGN.md
  // section 8), except while typing or in a dialog.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (key !== "n" && key !== "l" && key !== "x") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target) || document.querySelector("[role=dialog]")) {
        return;
      }
      if (key === "l" && !canLog) return;
      if (key === "n" && planFrozen) return;
      if (key === "x" && feelingTargetId === null) return;
      event.preventDefault();
      if (key === "n") onOpenAdd(null);
      else if (key === "l") onOpenLog(null);
      else if (feelingTargetId !== null) onOpenNotFeeling(feelingTargetId);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    onOpenAdd,
    onOpenLog,
    onOpenNotFeeling,
    canLog,
    planFrozen,
    feelingTargetId,
  ]);

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
  const logSpan =
    log === undefined || !ready || !canLog
      ? null
      : defaultEntrySpan({
          day: date,
          gridStartMin,
          wakeMin,
          now,
          isToday: tense === "today",
          blocks,
          position: log.position,
        });
  const addStart =
    add === undefined || !ready || planFrozen
      ? null
      : add.position === null
        ? suggest(DEFAULT_DURATION_MIN)
        : momentAt(date, gridStartMin, slotStart(add.position, CLICK_SNAP_MIN));

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <DayHeader
          date={date}
          today={today}
          onAdd={() => onOpenAdd(null)}
          planFrozen={planFrozen}
          onEditPlan={() => setPlanUnlocked(true)}
          onLog={() => onOpenLog(null)}
        />
        {!isWide && nowPanel !== null && (
          <div className="border-b">
            <NowPanel
              view={nowPanel}
              compact
              lastMarked={lastMarked}
              error={statusError}
              onAction={mark}
              onLog={() => onOpenLog(null)}
              onNotFeeling={onOpenNotFeeling}
              totals={null}
            />
          </div>
        )}
        {totals !== null && (tense === "past" || !isWide) && (
          <div className="border-b px-4 py-2">
            <DayTotals totals={totals} variant="strip" />
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
          actualCards={actualCards}
          untracked={untracked}
          nowPosition={nowPosition}
          futureFrom={
            tense === "future" ? 0 : tense === "today" ? nowPosition : null
          }
          onEmptySlot={
            planFrozen
              ? undefined
              : (position) => onOpenAdd(slotStart(position, CLICK_SNAP_MIN))
          }
          onEmptyActualSlot={
            canLog
              ? (position) => onOpenLog(slotStart(position, CLICK_SNAP_MIN))
              : undefined
          }
          settled={ready}
          onOpenCard={(key) => onSelectBlock(key as Id<"blocks">)}
        />
      </div>
      {isWide &&
        selected === undefined &&
        feelingBlock === undefined &&
        nowPanel !== null && (
          <aside className="w-[340px] shrink-0 overflow-y-auto border-l">
            <NowPanel
              view={nowPanel}
              compact={false}
              lastMarked={lastMarked}
              error={statusError}
              onAction={mark}
              onLog={() => onOpenLog(null)}
              onNotFeeling={onOpenNotFeeling}
              totals={totals}
            />
          </aside>
        )}
      {selected !== undefined &&
        activities !== undefined &&
        categories !== undefined &&
        blocks !== undefined && (
          <SidePanel
            wide={isWide}
            title={
              hasPlan(selected)
                ? selected.title
                : entryTitle(selected, categoryOf.get(selected.categoryId))
            }
            subtitle={
              hasPlan(selected)
                ? formatTimeRange(
                    selected.plannedStartMin,
                    selected.plannedDurationMin,
                  )
                : statusLine(selected)
            }
            onCancel={onCloseOverlay}
          >
            {hasPlan(selected) ? (
              // Keyed, so choosing another block starts the form afresh.
              <BlockDetail
                key={selected._id}
                block={selected}
                viewedDay={date}
                activities={activities}
                categories={categories}
                blocks={blocks}
                onSave={saveChanges}
                onDelete={() =>
                  attempt(() => removeBlock({ blockId: selected._id }))
                }
                onCancel={onCloseOverlay}
                now={now}
                statusError={statusError}
                onAction={(action) => mark(selected._id, action)}
                dayPlanUnlocked={planUnlocked}
              />
            ) : (
              <EntryDetail
                key={selected._id}
                entry={selected}
                gridStartMin={gridStartMin}
                categories={categories}
                blocks={blocks}
                onSave={saveChanges}
                onDelete={() =>
                  attempt(() => removeBlock({ blockId: selected._id }))
                }
                onCancel={onCloseOverlay}
              />
            )}
          </SidePanel>
        )}
      {feelingBlock !== undefined && (
        <NotFeelingIt
          block={feelingBlock}
          activity={
            feelingBlock.activityId === undefined
              ? undefined
              : activityOf.get(feelingBlock.activityId)
          }
          wide={isWide}
          onStart={onCloseOverlay}
          onSkipOnPurpose={() => {
            mark(feelingBlock._id, { type: "skip" });
            onCloseOverlay();
          }}
          onStartMinimum={() => {
            mark(feelingBlock._id, { type: "startMinimum" });
            onCloseOverlay();
          }}
          onClose={onCloseOverlay}
        />
      )}
      {ready && (
        <LogEntry
          open={logSpan !== null}
          isPhone={isPhone}
          onClose={onCloseOverlay}
          day={date}
          gridStartMin={gridStartMin}
          start={logSpan?.start ?? { date, minute: wakeMin }}
          durationMin={logSpan?.durationMin ?? 30}
          categories={logCategories(categories)}
          blocks={blocks}
          onSave={saveEntry}
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
