import { useId, useState } from "react";
import { Repeat } from "lucide-react";
import { ALL_WEEKDAYS, weekdayOrder } from "@shared/recurrence";
import {
  formatDayLabel,
  parseDateKey,
  weekdayOf,
  type DateKey,
} from "@shared/time";
import { Button } from "@/components/ui/button";
import type { Doc } from "@/lib/api";
import { Chip } from "@/features/status/Chip";
import { repeatsSentence, skippedLine, weekdayChip } from "./repeatView";

/** When a block should repeat: weekdays, and an end date or none. */
export interface RepeatChoice {
  weekdays: number[];
  endDate: DateKey | undefined;
}

/** What saving a repeat gives back: why it failed, or the dates left out. */
export type RepeatOutcome =
  { error: string } | { skipped: { date: DateKey; blockedBy: string }[] };

export interface RepeatProps {
  /** The rule this block is an occurrence of, if it repeats. */
  rule: Doc<"recurrences"> | undefined;
  /** It may start repeating: a plain block on today or a day to come. */
  canStart: boolean;
  /** Why the Repeat button waits (unsaved changes to the plan), or null. */
  blocked: string | null;
  weekStartsOn: number;
  onRepeat: (choice: RepeatChoice) => Promise<RepeatOutcome>;
}

/**
 * Repeat settings in block detail (PRD P3; DESIGN.md section 7): on which weekdays,
 * until when. Saved at once, apart from the form, like the status. A rule is made
 * from the block as saved, and the block becomes its first occurrence.
 */
export function RepeatSection({
  blockDate,
  rule,
  canStart,
  blocked,
  weekStartsOn,
  onRepeat,
}: RepeatProps & { blockDate: DateKey }) {
  const ids = useId();
  const [editing, setEditing] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>(() => [
    weekdayOf(blockDate),
  ]);
  const [endDate, setEndDate] = useState<DateKey | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function toggle(day: number) {
    setWeekdays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day],
    );
    setError(null);
  }

  async function save() {
    if (weekdays.length === 0) {
      setError("Choose at least one day.");
      return;
    }
    if (endDate !== undefined && endDate < blockDate) {
      setError(`The end can't be before ${formatDayLabel(blockDate)}.`);
      return;
    }
    setBusy(true);
    const outcome = await onRepeat({ weekdays, endDate });
    setBusy(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setEditing(false);
    setMessage(
      skippedLine(outcome.skipped) ??
        "Added for the next two weeks; later dates come by themselves.",
    );
  }

  if (rule === undefined && !canStart) return null;

  return (
    <section aria-label="Repeat" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Repeat aria-hidden="true" className="size-4 text-muted-foreground" />
        <p className="flex-1 text-sm">
          {rule === undefined ? "Does not repeat" : repeatsSentence(rule)}
        </p>
        {rule === undefined && !editing && (
          <Button
            type="button"
            variant="ghost"
            className="h-11 sm:h-8"
            onClick={() => {
              setEditing(true);
              setMessage(null);
            }}
          >
            Repeat…
          </Button>
        )}
      </div>

      {editing && (
        <div className="flex flex-col gap-3 rounded-block border px-3 py-3">
          <div
            role="group"
            aria-label="On these days"
            className="flex flex-wrap gap-1.5"
          >
            {weekdayOrder(weekStartsOn).map((day) => {
              const chip = weekdayChip(day);
              return (
                <Chip
                  key={day}
                  label={chip.name}
                  pressed={weekdays.includes(day)}
                  onClick={() => toggle(day)}
                >
                  <span className="inline-block w-4 text-center">
                    {chip.letter}
                  </span>
                </Chip>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip onClick={() => setWeekdays([...ALL_WEEKDAYS])}>
              Every day
            </Chip>
            <Chip onClick={() => setWeekdays([1, 2, 3, 4, 5])}>Weekdays</Chip>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-until`} className="text-sm font-medium">
              Until{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <input
              id={`${ids}-until`}
              type="date"
              min={blockDate}
              value={endDate ?? ""}
              onChange={(event) => {
                setEndDate(parseDateKey(event.target.value) ?? undefined);
                setError(null);
              }}
              // Inside block detail's form: Enter here must not save the block.
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9 md:text-sm dark:bg-input/30"
            />
          </div>
          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {blocked !== null && (
            <p className="text-sm text-muted-foreground">{blocked}</p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={busy || blocked !== null}
              className="h-11 sm:h-9"
              onClick={() => void save()}
            >
              Repeat
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 sm:h-9"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {message !== null && (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </section>
  );
}
