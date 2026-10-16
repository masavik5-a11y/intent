import { useEffect } from "react";
import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { gridDayOf } from "@shared/grid";
import { DAYS_PER_WEEK, weekDays, weekStart } from "@shared/pace";
import { DEFAULT_SETTINGS } from "@shared/settings";
import { addDays, type DateKey } from "@shared/time";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useNow } from "@/lib/now";
import { useIsPhone } from "@/lib/useMediaQuery";
import { weekPaces, weekReadRange } from "@/features/goals/paceView";
import { useEnsureMaterialized } from "@/features/recurrence/useEnsureMaterialized";
import { shortcutsPaused } from "@/features/shortcuts/shortcuts";
import { WeekGrid } from "./WeekGrid";
import { weekColumns, weekTitle } from "./weekView";

/**
 * The week (PRD P6; DESIGN.md section 7): seven days, the plan of each and what
 * happened beside it on days that have begun, and in the header the pace of every
 * category with a weekly target (PRD U5). ← and → go a week back or on.
 */
export function WeekScreen({
  date,
  onGoTo,
  onOpenDay,
  onOpenBlock,
  onAdd,
}: {
  /** Any day of the week shown. */
  date: DateKey;
  onGoTo: (date: DateKey) => void;
  onOpenDay: (date: DateKey) => void;
  onOpenBlock: (date: DateKey, blockId: string) => void;
  onAdd: (date: DateKey, position: number) => void;
}) {
  const settings = useQuery(api.settings.get);
  const { gridStartMin, wakeMin, sleepMin, weekStartsOn } =
    settings ?? DEFAULT_SETTINGS;
  const first = weekStart(date, weekStartsOn);
  const blocks = useQuery(api.blocks.listRange, weekReadRange(first));
  const categories = useQuery(api.categories.list);
  const activities = useQuery(api.activities.list);
  const now = useNow();
  const today = gridDayOf(now, gridStartMin);
  const todayRecord = useQuery(api.days.get, { date: today });
  const isPhone = useIsPhone();
  // Repeating blocks reach every day shown (and the next morning's).
  useEnsureMaterialized(addDays(first, DAYS_PER_WEEK));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || shortcutsPaused(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      onGoTo(addDays(first, event.key === "ArrowRight" ? 7 : -7));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [first, onGoTo]);

  const days = weekDays(first, weekStartsOn);
  const { title, range } = weekTitle(days, today);
  const ready =
    blocks !== undefined &&
    categories !== undefined &&
    activities !== undefined;
  const paces =
    ready && todayRecord !== undefined
      ? weekPaces({
          blocks,
          categories,
          first,
          today,
          weekStartsOn,
          gridStartMin,
          now,
          todayReviewed: todayRecord?.reviewedAt !== undefined,
        })
      : [];

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-1 border-b px-2 py-1.5 sm:px-4">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-11 sm:size-9"
            aria-label="Previous week"
            onClick={() => onGoTo(addDays(first, -7))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <h1 className="min-w-0 truncate px-1 text-base font-medium sm:text-lg">
            {title === range ? range : `${title} · ${range}`}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 sm:size-9"
            aria-label="Next week"
            onClick={() => onGoTo(addDays(first, 7))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <div className="flex-1" />
          {title !== "This week" && (
            <Button
              variant="outline"
              className="h-11 sm:h-9"
              onClick={() => onGoTo(today)}
            >
              This week
            </Button>
          )}
        </div>
        {paces.length > 0 && (
          // Pace per target, plain facts (PRD U5, pace rule 5).
          <ul aria-label="Pace" className="flex flex-col gap-0.5 px-2 pb-1">
            {paces.map(({ category, text }) => (
              <li
                key={category._id}
                data-color={category.colorKey}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full bg-key-solid"
                />
                <span className="min-w-0">{text}</span>
              </li>
            ))}
          </ul>
        )}
      </header>
      {ready && (
        <WeekGrid
          columns={weekColumns({
            blocks,
            categories,
            activities,
            first,
            weekStartsOn,
            gridStartMin,
            now,
            today,
          })}
          gridStartMin={gridStartMin}
          wakeMin={wakeMin}
          sleepMin={sleepMin}
          isPhone={isPhone}
          onOpenDay={onOpenDay}
          onOpenCard={onOpenBlock}
          onEmptySlot={onAdd}
        />
      )}
    </div>
  );
}
