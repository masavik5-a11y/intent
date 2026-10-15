import { useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  MoonStar,
  Plus,
} from "lucide-react";
import { addDays, parseDateKey, type DateKey } from "@shared/time";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dayTitle } from "./dayView";

const ICON_BUTTON = cn(
  buttonVariants({ variant: "ghost", size: "icon" }),
  "size-11 sm:size-9",
);

/**
 * Date navigation (PRD T6): previous, next, today, and any date from a picker. On
 * wider screens it also holds the screen's one primary action, adding a block (on a
 * past day, logging what happened); the phone has that in its bottom bar.
 */
export function DayHeader({
  date,
  today,
  onAdd,
  planFrozen,
  onEditPlan,
  onLog,
  onReview,
  plan,
}: {
  date: DateKey;
  today: DateKey;
  onAdd: () => void;
  /**
   * A past day whose plan is frozen (PRD section 7, rule 4): the primary action logs
   * what happened, and "Edit plan" opens the plan for changes.
   */
  planFrozen: boolean;
  onEditPlan: () => void;
  onLog: () => void;
  /** Opens the evening review (PRD R1): on today, always within reach. */
  onReview?: (() => void) | undefined;
  /** "Plan tomorrow" on today (PRD P1), "Plan this day" on a day to come. */
  plan?: { date: DateKey; label: string } | undefined;
}) {
  const navigate = useNavigate();
  const pickerRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const picker = pickerRef.current;
    if (picker === null) return;
    // Chrome and Edge open the native calendar; elsewhere, focus is the fallback.
    try {
      picker.showPicker();
    } catch {
      picker.focus();
    }
  }

  return (
    <header className="flex items-center gap-1 border-b px-2 py-1.5 sm:px-4">
      <Link
        to="/day/$date"
        params={{ date: addDays(date, -1) }}
        aria-label="Previous day"
        className={ICON_BUTTON}
      >
        <ChevronLeft aria-hidden="true" />
      </Link>
      <h1 className="min-w-0 truncate px-1 text-base font-medium sm:text-lg">
        {dayTitle(date, today)}
      </h1>
      <Link
        to="/day/$date"
        params={{ date: addDays(date, 1) }}
        aria-label="Next day"
        className={ICON_BUTTON}
      >
        <ChevronRight aria-hidden="true" />
      </Link>
      <div className="flex-1" />
      {date !== today && (
        <Link
          to="/day/$date"
          params={{ date: today }}
          className={cn(buttonVariants({ variant: "outline" }), "h-11 sm:h-9")}
        >
          Today
        </Link>
      )}
      <span className="relative">
        <button
          type="button"
          aria-label="Go to a date"
          onClick={openPicker}
          className={ICON_BUTTON}
        >
          <CalendarDays aria-hidden="true" />
        </button>
        {/* The native picker, opened by the button beside it; never shown itself. */}
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={date}
          onChange={(event) => {
            const picked = parseDateKey(event.target.value);
            if (picked !== null) {
              void navigate({ to: "/day/$date", params: { date: picked } });
            }
          }}
          className="pointer-events-none absolute inset-0 opacity-0"
        />
      </span>
      {plan !== undefined && (
        <Link
          to="/plan/$date"
          params={{ date: plan.date }}
          aria-label={plan.label}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "ml-1 h-11 px-2.5 sm:h-9",
          )}
        >
          <CalendarPlus aria-hidden="true" />
          <span className="hidden sm:inline">{plan.label}</span>
        </Link>
      )}
      {onReview !== undefined && (
        <Button
          variant="ghost"
          className="ml-1 h-11 px-2.5 sm:h-9"
          aria-label="Review the day"
          onClick={onReview}
        >
          <MoonStar aria-hidden="true" />
          <span className="hidden sm:inline">Review the day</span>
        </Button>
      )}
      {planFrozen ? (
        <>
          <Button
            variant="ghost"
            className="ml-1 h-11 sm:h-9"
            onClick={onEditPlan}
          >
            Edit plan
          </Button>
          <Button className="ml-1 hidden h-9 sm:inline-flex" onClick={onLog}>
            <Plus aria-hidden="true" />
            Log what happened
          </Button>
        </>
      ) : (
        <Button className="ml-1 hidden h-9 sm:inline-flex" onClick={onAdd}>
          <Plus aria-hidden="true" />
          Add block
        </Button>
      )}
    </header>
  );
}
