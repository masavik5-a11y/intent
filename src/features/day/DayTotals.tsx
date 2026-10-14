import type { DayTotals as Totals } from "@shared/summary";
import { totalsItems } from "./dayView";

/**
 * The day's three totals (PRD T8): on purpose, drift, untracked, updated every minute.
 * `panel` is the now panel's block of three figures; `strip` is one quiet line above
 * the grid, for the phone and for days that are over.
 */
export function DayTotals({
  totals,
  variant,
}: {
  totals: Totals;
  variant: "panel" | "strip";
}) {
  const items = totalsItems(totals);
  if (variant === "strip") {
    return (
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
        {items.map((item) => (
          <span key={item.label} className="whitespace-nowrap">
            {item.label}{" "}
            <span className="font-medium text-foreground tabular-nums">
              {item.value}
            </span>
          </span>
        ))}
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="text-base font-medium tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
