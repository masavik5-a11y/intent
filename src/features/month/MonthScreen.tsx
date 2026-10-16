import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { gridDayOf } from "@shared/grid";
import { DEFAULT_SETTINGS } from "@shared/settings";
import {
  dateKeyParts,
  formatDayLabel,
  formatMonthLabel,
  type DateKey,
} from "@shared/time";
import { AdaptiveDialog } from "@/components/AdaptiveDialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { createLocally } from "@/lib/blockUpdate";
import { saveErrorMessage } from "@/lib/errorMessages";
import { useNow } from "@/lib/now";
import { useIsPhone } from "@/lib/useMediaQuery";
import { QuickAdd } from "@/features/day/QuickAdd";
import {
  DEFAULT_DURATION_MIN,
  type NewBlockArgs,
} from "@/features/day/QuickAddForm";
import { suggestedStart } from "@/features/day/quickAddRules";
import { useEnsureMaterialized } from "@/features/recurrence/useEnsureMaterialized";
import { shortcutsPaused } from "@/features/shortcuts/shortcuts";
import { MonthGrid } from "./MonthGrid";
import {
  addMonths,
  monthDays,
  monthLabels,
  monthStart,
  type MonthLabel,
} from "./monthView";

/**
 * The month (PRD P7; DESIGN.md section 7): where future events are found and added.
 * Pressing a day shows what it holds, with "Add block" and "Open day"; adding stays
 * on the month. ← and → go a month back or on.
 */
export function MonthScreen({
  date,
  selected,
  adding,
  onGoTo,
  onSelectDay,
  onAdd,
  onOpenDay,
  onClose,
}: {
  /** Any day of the month shown. */
  date: DateKey;
  /** The day pressed, whose panel is open. */
  selected: DateKey | undefined;
  /** Quick add is open for the selected day. */
  adding: boolean;
  onGoTo: (date: DateKey) => void;
  onSelectDay: (date: DateKey) => void;
  onAdd: () => void;
  onOpenDay: (date: DateKey) => void;
  /** Closes the day's panel or quick add, as the back gesture would. */
  onClose: () => void;
}) {
  const settings = useQuery(api.settings.get);
  const { gridStartMin, wakeMin, weekStartsOn } = settings ?? DEFAULT_SETTINGS;
  const days = monthDays(date, weekStartsOn);
  const first = days[0] ?? date;
  const last = days[days.length - 1] ?? date;
  const blocks = useQuery(api.blocks.listRange, { from: first, to: last });
  const categories = useQuery(api.categories.list);
  const activities = useQuery(api.activities.list);
  const dayBlocks = useQuery(
    api.blocks.listForDay,
    selected === undefined ? "skip" : { date: selected },
  );
  const createBlock = useMutation(api.blocks.create).withOptimisticUpdate(
    createLocally,
  );
  const now = useNow();
  const today = gridDayOf(now, gridStartMin);
  const isPhone = useIsPhone();
  const [error, setError] = useState<string | null>(null);
  useEnsureMaterialized(last);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || shortcutsPaused(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      onGoTo(addMonths(date, event.key === "ArrowRight" ? 1 : -1));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [date, onGoTo]);

  const labels: ReadonlyMap<DateKey, readonly MonthLabel[]> =
    blocks === undefined || categories === undefined
      ? new Map()
      : monthLabels(blocks, categories);
  const thisMonth = monthStart(date) === monthStart(today);
  const selectedLabels =
    selected === undefined ? [] : (labels.get(selected) ?? []);
  const repeating =
    selected === undefined || blocks === undefined
      ? 0
      : blocks.filter(
          (block) =>
            block.date === selected && block.recurrenceId !== undefined,
        ).length;

  function save(args: NewBlockArgs): Promise<null> {
    setError(null);
    onClose();
    createBlock(args).catch((failure: unknown) =>
      setError(saveErrorMessage(failure)),
    );
    return Promise.resolve(null);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-1 border-b px-2 py-1.5 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="size-11 sm:size-9"
          aria-label="Previous month"
          onClick={() => onGoTo(addMonths(date, -1))}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <h1 className="min-w-0 truncate px-1 text-base font-medium sm:text-lg">
          {formatMonthLabel(date)}
        </h1>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 sm:size-9"
          aria-label="Next month"
          onClick={() => onGoTo(addMonths(date, 1))}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
        <div className="flex-1" />
        {!thisMonth && (
          <Button
            variant="outline"
            className="h-11 sm:h-9"
            onClick={() => onGoTo(today)}
          >
            This month
          </Button>
        )}
      </header>
      {error !== null && (
        <p role="alert" className="border-b px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <MonthGrid
        days={days}
        month={dateKeyParts(date).month}
        today={today}
        weekStartsOn={weekStartsOn}
        labels={labels}
        isPhone={isPhone}
        onSelectDay={onSelectDay}
      />
      <AdaptiveDialog
        open={selected !== undefined && !adding}
        isPhone={isPhone}
        onClose={onClose}
        title={selected === undefined ? "" : formatDayLabel(selected)}
      >
        <div className="flex flex-col gap-4">
          {selectedLabels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing of its own planned yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {selectedLabels.map((label) => (
                <li
                  key={label.blockId}
                  data-color={label.colorKey}
                  className="rounded-block bg-key-tint px-2 py-1.5 text-sm text-key-ink"
                >
                  {label.text}
                </li>
              ))}
            </ul>
          )}
          {repeating > 0 && (
            <p className="text-sm text-muted-foreground">
              {repeating === 1
                ? "And 1 repeating block."
                : `And ${repeating} repeating blocks.`}
            </p>
          )}
          <div className="flex gap-2">
            <Button className="h-11 flex-1 sm:h-9" onClick={onAdd}>
              <Plus aria-hidden="true" />
              Add block
            </Button>
            <Button
              variant="outline"
              className="h-11 flex-1 sm:h-9"
              onClick={() => {
                if (selected !== undefined) onOpenDay(selected);
              }}
            >
              Open day
            </Button>
          </div>
        </div>
      </AdaptiveDialog>
      {selected !== undefined &&
        dayBlocks !== undefined &&
        activities !== undefined &&
        categories !== undefined && (
          <QuickAdd
            open={adding}
            isPhone={isPhone}
            onClose={onClose}
            day={selected}
            gridStartMin={gridStartMin}
            start={suggestedStart({
              day: selected,
              gridStartMin,
              wakeMin,
              now,
              isToday: selected === today,
              durationMin: DEFAULT_DURATION_MIN,
              blocks: dayBlocks,
            })}
            suggestStart={(durationMin) =>
              suggestedStart({
                day: selected,
                gridStartMin,
                wakeMin,
                now,
                isToday: selected === today,
                durationMin,
                blocks: dayBlocks,
              })
            }
            activities={activities}
            categories={categories}
            blocks={dayBlocks}
            onSave={save}
          />
        )}
    </div>
  );
}
