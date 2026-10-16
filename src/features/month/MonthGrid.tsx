import { weekdayOrder } from "@shared/recurrence";
import { dateKeyParts, formatDayLabel, type DateKey } from "@shared/time";
import { cn } from "@/lib/utils";
import { shownLabels, type MonthLabel } from "./monthView";

/** Labels or dots a day shows before "+2 more". */
const SHOWN = 3;

const WEEKDAY_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/**
 * A month as a calendar (PRD P7; DESIGN.md section 7): six weeks, each day with its
 * own blocks as short labels on the desktop and coloured dots on the phone. Days of
 * the months around it are quieter. Pressing a day selects it.
 */
export function MonthGrid({
  days,
  month,
  today,
  weekStartsOn,
  labels,
  isPhone,
  onSelectDay,
}: {
  days: readonly DateKey[];
  /** 1 to 12: the month shown, so the days around it can be quieter. */
  month: number;
  today: DateKey;
  weekStartsOn: number;
  labels: ReadonlyMap<DateKey, readonly MonthLabel[]>;
  isPhone: boolean;
  onSelectDay: (date: DateKey) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b text-xs text-muted-foreground">
        {weekdayOrder(weekStartsOn).map((weekday) => (
          <div key={weekday} className="px-2 py-1.5 text-center sm:text-left">
            {WEEKDAY_SHORT[weekday]}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((date) => {
          const parts = dateKeyParts(date);
          const inMonth = parts.month === month;
          const all = labels.get(date) ?? [];
          const { labels: visible, more } = shownLabels(all, SHOWN);
          const name = [
            formatDayLabel(date),
            all.length === 0
              ? "nothing of its own planned"
              : all.map((label) => label.text).join(", "),
          ].join(", ");
          return (
            <button
              key={date}
              type="button"
              aria-label={name}
              aria-current={date === today ? "date" : undefined}
              onClick={() => onSelectDay(date)}
              className={cn(
                "flex min-h-14 min-w-0 flex-col gap-0.5 overflow-hidden border-r border-b p-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:p-1.5",
                !inMonth && "bg-muted/40 text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center self-center rounded-full text-xs sm:self-start",
                  date === today && "bg-foreground font-medium text-background",
                )}
              >
                {parts.day}
              </span>
              {isPhone ? (
                <span className="flex flex-wrap justify-center gap-0.5">
                  {visible.map((label) => (
                    <span
                      key={label.blockId}
                      data-color={label.colorKey}
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-key-solid"
                    />
                  ))}
                  {more > 0 && (
                    <span aria-hidden="true" className="text-xs leading-none">
                      +
                    </span>
                  )}
                </span>
              ) : (
                <>
                  {visible.map((label) => (
                    <span
                      key={label.blockId}
                      data-color={label.colorKey}
                      className="truncate rounded-sm bg-key-tint px-1 text-xs text-key-ink"
                    >
                      {label.text}
                    </span>
                  ))}
                  {more > 0 && (
                    <span className="px-1 text-xs text-muted-foreground">
                      +{more} more
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
