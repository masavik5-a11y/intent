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
import { addDays, type DateKey, type LocalMoment } from "@shared/time";
import { BlockPanel } from "@/features/block-detail/BlockPanel";
import { useEnsureMaterialized } from "@/features/recurrence/useEnsureMaterialized";
import { api, type Doc, type Id } from "@/lib/api";
import { useSetStatus } from "@/lib/blockStatus";
import { saveErrorMessage } from "@/lib/errorMessages";
import { useNow } from "@/lib/now";
import { dismissWelcome, welcomeDismissedOn } from "@/lib/welcomeDismissal";
import { useIsPhone, useMediaQuery } from "@/lib/useMediaQuery";
import { DayGrid, type GridCard } from "./DayGrid";
import { DayHeader } from "./DayHeader";
import { NowPanel } from "@/features/now/NowPanel";
import { LogEntry } from "@/features/log/LogEntry";
import { NotFeelingIt } from "@/features/not-feeling/NotFeelingIt";
import type { NewEntryArgs } from "@/features/log/LogEntryForm";
import { defaultEntrySpan, logCategories } from "@/features/log/logRules";
import { nowView } from "@/features/now/nowView";
import { EveningReview } from "@/features/review/EveningReview";
import {
  reviewNotes,
  reviewOffered,
  type ReviewStep,
} from "@/features/review/reviewView";
import {
  actualCardName,
  actualCardState,
  actualCardTime,
  actualLane,
  dayNotes,
  dayTense,
  entryTitle,
  planLane,
  untrackedStretches,
} from "./dayView";
import { cardLooks, planCards } from "./gridCards";
import { DayNotes } from "./DayNotes";
import { DayReview } from "./DayReview";
import { WelcomeBack } from "./WelcomeBack";
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
  /** The evening review is open at this step (also in the URL). */
  review: ReviewStep | undefined;
  onOpenReview: () => void;
  onReviewStep: (step: ReviewStep) => void;
  /** The review hands over to planning this day (PRD P1). */
  onPlanDay: (date: DateKey) => void;
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
  review,
  onOpenReview,
  onReviewStep,
  onPlanDay,
}: DayScreenProps) {
  const settings = useQuery(api.settings.get);
  const blocks = useQuery(api.blocks.listForDay, { date });
  const categories = useQuery(api.categories.list);
  const activities = useQuery(api.activities.list);
  const day = useQuery(api.days.get, { date });
  // The view reads the day after too (blocks before the grid's start).
  useEnsureMaterialized(addDays(date, 1));
  const createBlock = useMutation(api.blocks.create);
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
  // After days away, today opens with "Welcome back. Plan today?" (decided
  // 2026-10-15); "Not now" puts it away for the day on this device.
  const returning = useQuery(
    api.days.returning,
    tense === "today" ? { today: date } : "skip",
  );
  const [welcomeDismissed, setWelcomeDismissed] = useState(() =>
    welcomeDismissedOn(date),
  );
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

  const cards: GridCard[] =
    blocks === undefined
      ? []
      : planCards({
          blocks,
          date,
          gridStartMin,
          now,
          categories: categories ?? [],
          activities: activities ?? [],
          selectedId: selectedBlockId,
        });
  const actualCards: GridCard[] = happened.map((item) => ({
    ...cardLooks(
      item.block,
      categories ?? [],
      activities ?? [],
      selectedBlockId,
    ),
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

  // The evening review: R or "Review the day" on any day that has begun, and offered
  // by the now panel in the evening until the day is reviewed (PRD R1).
  const canReview = tense !== "future";
  const reviewed = day?.reviewedAt !== undefined;
  const offerReview =
    nowPanel !== null &&
    day !== undefined &&
    !reviewed &&
    blocks !== undefined &&
    reviewOffered({ blocks, date, gridStartMin, sleepMin, now });
  const reviewOpen = review !== undefined && canReview;
  // Only while its block is not marked: once it is (here, in block detail or on the
  // other device), the view closes rather than offer actions on what happened.
  const feelingBlock =
    notFeelingId === undefined
      ? undefined
      : blocks
          ?.filter(hasPlan)
          .find(
            (block) => block._id === notFeelingId && block.status === "planned",
          );

  // N opens quick add, L logs what happened and X opens "Not feeling it" (DESIGN.md
  // section 8), except while typing or in a dialog.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (key !== "n" && key !== "l" && key !== "x" && key !== "r") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target) || document.querySelector("[role=dialog]")) {
        return;
      }
      if (key === "l" && !canLog) return;
      if (key === "n" && planFrozen) return;
      if (key === "x" && feelingTargetId === null) return;
      if (key === "r" && (!canReview || reviewOpen)) return;
      event.preventDefault();
      if (key === "r") onOpenReview();
      else if (key === "n") onOpenAdd(null);
      else if (key === "l") onOpenLog(null);
      else if (feelingTargetId !== null) onOpenNotFeeling(feelingTargetId);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    onOpenAdd,
    onOpenLog,
    onOpenNotFeeling,
    onOpenReview,
    canLog,
    canReview,
    reviewOpen,
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
  // On a past day whose plan is frozen, the phone's + logs what happened instead of
  // adding to the plan (the header's primary action there does the same).
  const logRequest = log ?? (planFrozen ? add : undefined);
  const logSpan =
    logRequest === undefined || !ready || !canLog
      ? null
      : defaultEntrySpan({
          day: date,
          gridStartMin,
          wakeMin,
          now,
          isToday: tense === "today",
          blocks,
          position: logRequest.position,
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
          onReview={tense === "today" ? onOpenReview : undefined}
          plan={
            tense === "today"
              ? { date: addDays(today, 1), label: "Plan tomorrow" }
              : tense === "future"
                ? { date, label: "Plan this day" }
                : undefined
          }
        />
        {tense === "today" && returning === true && !welcomeDismissed && (
          <WelcomeBack
            today={date}
            onDismiss={() => {
              dismissWelcome(date);
              setWelcomeDismissed(true);
            }}
          />
        )}
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
              onReview={offerReview ? onOpenReview : undefined}
              mainFocus={day?.mainFocus}
              totals={null}
            />
          </div>
        )}
        {totals !== null && (tense === "past" || !isWide) && (
          <div className="flex flex-col gap-2 border-b px-4 py-2">
            <DayTotals totals={totals} variant="strip" />
            {/* Looking back at a past day: its review and its notes (PRD R3). */}
            {tense === "past" && day !== undefined && (
              <DayReview
                notes={reviewNotes(day)}
                reviewed={reviewed}
                onReview={reviewOpen ? undefined : onOpenReview}
              />
            )}
            {tense === "past" && blocks !== undefined && (
              <DayNotes
                notes={dayNotes(blocks, date, gridStartMin)}
                onOpen={onSelectBlock}
              />
            )}
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
          settled={ready && day !== undefined}
          onOpenCard={(key) => onSelectBlock(key as Id<"blocks">)}
        />
      </div>
      {isWide &&
        selected === undefined &&
        feelingBlock === undefined &&
        !reviewOpen &&
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
              onReview={offerReview ? onOpenReview : undefined}
              mainFocus={day?.mainFocus}
              totals={totals}
            />
          </aside>
        )}
      {selected !== undefined &&
        activities !== undefined &&
        categories !== undefined &&
        blocks !== undefined && (
          <BlockPanel
            block={selected}
            viewedDay={date}
            wide={isWide}
            activities={activities}
            categories={categories}
            blocks={blocks}
            gridStartMin={gridStartMin}
            now={now}
            statusError={statusError}
            onAction={(action) => mark(selected._id, action)}
            dayPlanUnlocked={planUnlocked}
            onClose={onCloseOverlay}
          />
        )}
      {reviewOpen &&
        review !== undefined &&
        selected === undefined &&
        ready &&
        day !== undefined && (
          <EveningReview
            date={date}
            today={today}
            step={review}
            onStep={onReviewStep}
            onClose={onCloseOverlay}
            onPlanNext={onPlanDay}
            wide={isWide}
            blocks={blocks}
            activities={activities}
            categories={categories}
            gridStartMin={gridStartMin}
            now={now}
            totals={totals}
            day={day}
            onAction={mark}
            statusError={statusError}
          />
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
