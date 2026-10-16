import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, Copy, Plus } from "lucide-react";
import type { StatusAction } from "@shared/blocks";
import {
  CLICK_SNAP_MIN,
  gridDayOf,
  gridPosition,
  momentAt,
  slotStart,
} from "@shared/grid";
import { copyablePlan } from "@shared/planning";
import { DEFAULT_SETTINGS } from "@shared/settings";
import { addDays, formatDayLabel, type DateKey } from "@shared/time";
import { Button, buttonVariants } from "@/components/ui/button";
import { BlockPanel } from "@/features/block-detail/BlockPanel";
import type { AddRequest } from "@/features/day/DayScreen";
import { DayGrid } from "@/features/day/DayGrid";
import { dayTense, sleepStretches } from "@/features/day/dayView";
import { planCards } from "@/features/day/gridCards";
import { useBlockDrag } from "@/features/day/useBlockDrag";
import { createLocally } from "@/lib/blockUpdate";
import { dayCommand, shortcutsPaused } from "@/features/shortcuts/shortcuts";
import { QuickAdd } from "@/features/day/QuickAdd";
import {
  DEFAULT_DURATION_MIN,
  type NewBlockArgs,
} from "@/features/day/QuickAddForm";
import { suggestedStart } from "@/features/day/quickAddRules";
import { useEnsureMaterialized } from "@/features/recurrence/useEnsureMaterialized";
import { api, type Id } from "@/lib/api";
import { useSetStatus } from "@/lib/blockStatus";
import { saveErrorMessage } from "@/lib/errorMessages";
import { useNow } from "@/lib/now";
import { setGridZoom, useGridZoom } from "@/lib/gridZoom";
import { useIsPhone, useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { CopyFromDate } from "./CopyFromDate";
import { MainFocusField } from "./MainFocusField";
import {
  copyPreview,
  copyResultLine,
  copySources,
  focusPrompt,
  planTitle,
} from "./planningView";

interface PlanScreenProps {
  /** The day being planned, usually tomorrow. */
  date: DateKey;
  /** Quick add is open (in the URL, so the back gesture closes it). */
  add: AddRequest | undefined;
  onOpenAdd: (position: number | null) => void;
  selectedBlockId: string | undefined;
  onSelectBlock: (blockId: Id<"blocks">) => void;
  /** "Copy from a date" is open (also in the URL). */
  copyOpen: boolean;
  onOpenCopy: () => void;
  onCloseOverlay: () => void;
}

const ICON_BUTTON = cn(
  buttonVariants({ variant: "ghost", size: "icon" }),
  "size-11 sm:size-9",
);

/**
 * Plan tomorrow (PRD P1, P2, P5; DESIGN.md section 7): the day's plan lane alone, with
 * its repeating blocks already there, the main focus, adding blocks and "Copy from a
 * date". Reached from the review and from today.
 */
export function PlanScreen({
  date,
  add,
  onOpenAdd,
  selectedBlockId,
  onSelectBlock,
  copyOpen,
  onOpenCopy,
  onCloseOverlay,
}: PlanScreenProps) {
  const settings = useQuery(api.settings.get);
  const blocks = useQuery(api.blocks.listForDay, { date });
  const categories = useQuery(api.categories.list);
  const activities = useQuery(api.activities.list);
  const day = useQuery(api.days.get, { date });
  // The view reads the day after too (blocks before the grid's start).
  useEnsureMaterialized(addDays(date, 1));
  const createBlock = useMutation(api.blocks.create).withOptimisticUpdate(
    createLocally,
  );
  const setMainFocus = useMutation(api.days.setMainFocus);
  const copyPlan = useMutation(api.blocks.copyPlan);
  const setStatus = useSetStatus();
  const now = useNow();
  const zoom = useGridZoom();
  const isPhone = useIsPhone();
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState<DateKey | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyResult, setCopyResult] = useState<string | null>(null);
  const sourceBlocks = useQuery(
    api.blocks.listForDay,
    copyOpen && copyFrom !== null ? { date: copyFrom } : "skip",
  );

  const { gridStartMin, wakeMin, sleepMin } = settings ?? DEFAULT_SETTINGS;
  const today = gridDayOf(now, gridStartMin);
  const isToday = dayTense(date, today) === "today";
  const ready =
    blocks !== undefined &&
    activities !== undefined &&
    categories !== undefined;

  // Planning ahead: blocks still ahead move by dragging, like on the day (PRD T9).
  const blockDrag = useBlockDrag({
    blocks,
    day: date,
    gridStartMin,
    now,
    tense: isToday ? "today" : "future",
    planUnlocked: false,
    onError: setStatusError,
  });
  const cards =
    blocks === undefined
      ? []
      : blockDrag.withDrag(
          planCards({
            blocks,
            date,
            gridStartMin,
            now,
            categories: categories ?? [],
            activities: activities ?? [],
            selectedId: selectedBlockId,
          }),
          "plan",
        );

  const saveFocus = useCallback(
    (text: string) =>
      setMainFocus({
        date,
        mainFocus: text.trim() === "" ? null : text,
      }).then(() => undefined),
    [setMainFocus, date],
  );

  /** Closes quick add at once; the block shows before the server answers. */
  function saveBlock(args: NewBlockArgs): Promise<null> {
    setStatusError(null);
    onCloseOverlay();
    createBlock(args).catch((error: unknown) =>
      setStatusError(saveErrorMessage(error)),
    );
    return Promise.resolve(null);
  }

  async function copy() {
    if (copyFrom === null) return;
    setCopying(true);
    setCopyError(null);
    try {
      const result = await copyPlan({ from: copyFrom, to: date });
      setCopyResult(copyResultLine(result));
      onCloseOverlay();
    } catch (error) {
      setCopyError(saveErrorMessage(error));
    } finally {
      setCopying(false);
    }
  }

  function mark(blockId: Id<"blocks">, action: StatusAction) {
    setStatusError(null);
    void setStatus(blockId, action).then(setStatusError);
  }

  // N opens quick add, as on the day (DESIGN.md section 8).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || shortcutsPaused(event.target)) return;
      if (dayCommand(event) !== "add") return;
      event.preventDefault();
      onOpenAdd(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenAdd]);

  const suggest = (durationMin: number) =>
    suggestedStart({
      day: date,
      gridStartMin,
      wakeMin,
      now,
      isToday,
      durationMin,
      blocks: blocks ?? [],
    });
  const addStart =
    add === undefined || !ready
      ? null
      : add.position === null
        ? suggest(DEFAULT_DURATION_MIN)
        : momentAt(date, gridStartMin, slotStart(add.position, CLICK_SNAP_MIN));
  const selected = blocks?.find((block) => block._id === selectedBlockId);
  const sources = copySources(date, today);
  const chosenSource = copyFrom ?? sources[0]?.date ?? null;
  // The first offered day is chosen as the dialog opens.
  if (copyOpen && copyFrom === null && chosenSource !== null) {
    setCopyFrom(chosenSource);
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-1 border-b px-2 py-1.5 sm:px-4">
          <Link to="/" aria-label="Back to today" className={ICON_BUTTON}>
            <ChevronLeft aria-hidden="true" />
          </Link>
          <div className="flex min-w-0 flex-col px-1">
            <h1 className="truncate text-base font-medium sm:text-lg">
              {planTitle(date, today)}
            </h1>
            <p className="text-xs text-muted-foreground">
              {formatDayLabel(date)}
            </p>
          </div>
          <div className="flex-1" />
          <Button
            variant="ghost"
            className="h-11 min-w-11 px-2.5 sm:h-9 sm:min-w-0"
            aria-label="Copy from a date"
            onClick={onOpenCopy}
          >
            <Copy aria-hidden="true" />
            <span className="hidden sm:inline">Copy from a date</span>
          </Button>
          <Button
            className="ml-1 hidden h-9 sm:inline-flex"
            onClick={() => onOpenAdd(null)}
          >
            <Plus aria-hidden="true" />
            Add block
          </Button>
          <Link
            to="/"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "ml-1 h-11 sm:h-9",
            )}
          >
            Done
          </Link>
        </header>
        <div className="flex flex-col gap-2 border-b px-4 py-3">
          {day !== undefined && (
            <MainFocusField
              prompt={focusPrompt(date, today)}
              saved={day?.mainFocus ?? ""}
              onSave={saveFocus}
            />
          )}
          {copyResult !== null && (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {copyResult}
            </p>
          )}
          {statusError !== null && selected === undefined && (
            <p role="alert" className="text-sm text-destructive">
              {statusError}
            </p>
          )}
          {blocks !== undefined && cards.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing planned yet. Start with one block, or copy a day.
            </p>
          )}
        </div>
        <DayGrid
          dayKey={date}
          gridStartMin={gridStartMin}
          wakeMin={wakeMin}
          sleepMin={sleepMin}
          isPhone={isPhone}
          cards={cards}
          actualCards={[]}
          untracked={[]}
          nowPosition={isToday ? gridPosition(date, gridStartMin, now) : null}
          futureFrom={null}
          onEmptySlot={(position) =>
            onOpenAdd(slotStart(position, CLICK_SNAP_MIN))
          }
          settled={ready && day !== undefined}
          onOpenCard={(key) => onSelectBlock(key as Id<"blocks">)}
          onDrag={blockDrag.onDrag}
          zoom={zoom}
          onZoom={setGridZoom}
          sleep={
            blocks === undefined || categories === undefined
              ? []
              : sleepStretches(blocks, categories, date, gridStartMin)
          }
          planOnly
        />
      </div>
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
            onSaveError={setStatusError}
            onAction={(action) => mark(selected._id, action)}
            dayPlanUnlocked={false}
            onClose={onCloseOverlay}
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
      <CopyFromDate
        open={copyOpen}
        isPhone={isPhone}
        onClose={onCloseOverlay}
        to={date}
        from={chosenSource}
        onChoose={(from) => {
          setCopyFrom(from === date ? null : from);
          setCopyError(null);
        }}
        sources={sources}
        preview={
          sourceBlocks === undefined || chosenSource === null
            ? null
            : copyPreview(sourceBlocks, chosenSource, gridStartMin)
        }
        canCopy={
          sourceBlocks !== undefined &&
          chosenSource !== null &&
          chosenSource !== date &&
          copyablePlan(sourceBlocks, chosenSource, gridStartMin).length > 0
        }
        busy={copying}
        error={copyError}
        onCopy={() => void copy()}
      />
    </div>
  );
}
