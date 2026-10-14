import { useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, parseDateKey, type DateKey } from "@shared/time";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dayTitle } from "./dayView";

const ICON_BUTTON = cn(
  buttonVariants({ variant: "ghost", size: "icon" }),
  "size-11 sm:size-9",
);

/** Date navigation (PRD T6): previous, next, today, and any date from a picker. */
export function DayHeader({ date, today }: { date: DateKey; today: DateKey }) {
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
        {/* The native picker, opened by the button above; never shown itself. */}
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
    </header>
  );
}
