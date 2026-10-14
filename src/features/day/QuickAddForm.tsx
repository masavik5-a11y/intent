import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_TITLE_LENGTH } from "@shared/text";
import {
  formatDayLabel,
  formatDuration,
  formatTimeRange,
  isValidDuration,
  type DateKey,
  type LocalMoment,
} from "@shared/time";
import { AppIcon } from "@/components/AppIcon";
import { CategoryPicker } from "@/components/CategoryPicker";
import { DurationInput } from "@/components/DurationInput";
import { TimeInput } from "@/components/TimeInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Doc, Id } from "@/lib/api";
import { cn } from "@/lib/utils";
import { collidingBlock, overlapMessage } from "@/lib/blockOverlap";
import { matchActivities, momentOnGrid } from "./quickAddRules";

/** A new block's length until an activity says otherwise. */
export const DEFAULT_DURATION_MIN = 60;

export interface NewBlockArgs {
  date: DateKey;
  plannedStartMin: number;
  plannedDurationMin: number;
  activityId?: Id<"activities">;
  title?: string;
  categoryId?: Id<"categories">;
}

interface QuickAddFormProps {
  /** The day whose grid the block goes into. */
  day: DateKey;
  gridStartMin: number;
  start: LocalMoment;
  /**
   * A fitting start for a given length, when the time was suggested rather than
   * clicked: picking a longer activity then moves the start to where it fits.
   */
  suggestStart?: (durationMin: number) => LocalMoment;
  activities: readonly Doc<"activities">[];
  categories: readonly Doc<"categories">[];
  /** The blocks loaded for the day, for the overlap warning. */
  blocks: readonly Doc<"blocks">[];
  /** Resolves to an error message, or null when saved. */
  onSave: (args: NewBlockArgs) => Promise<string | null>;
}

/**
 * Plan a block in a few keystrokes: type part of an activity's name and press Enter,
 * or type a new title and pick its category. The time is prefilled.
 */
export function QuickAddForm({
  day,
  gridStartMin,
  start,
  suggestStart,
  activities,
  categories,
  blocks,
  onSave,
}: QuickAddFormProps) {
  const ids = useId();
  const [text, setText] = useState("");
  const [activity, setActivity] = useState<Doc<"activities"> | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [categoryId, setCategoryId] = useState<Id<"categories"> | null>(
    () => categories.find((category) => !category.archived)?._id ?? null,
  );
  const [startMin, setStartMin] = useState(start.minute);
  const [startTouched, setStartTouched] = useState(false);
  const [durationMin, setDurationMin] = useState(DEFAULT_DURATION_MIN);
  const [durationTouched, setDurationTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggestions =
    activity === null ? matchActivities(activities, text) : [];
  const moment = momentOnGrid(day, gridStartMin, startMin);
  const span = isValidDuration(durationMin)
    ? { date: moment.date, startMin: moment.minute, durationMin }
    : null;
  const blocking = span === null ? undefined : collidingBlock(span, blocks);
  const category = categories.find((item) => item._id === categoryId);
  // A problem from the last attempt, else the overlap as it is now.
  const message =
    error ?? (blocking === undefined ? null : overlapMessage(blocking));

  /**
   * Takes an activity: its name, its usual length, and, when the time was only a
   * suggestion, a start where that length fits. Returns the start to save with.
   */
  function choose(chosen: Doc<"activities">): LocalMoment {
    setActivity(chosen);
    setText(chosen.name);
    setError(null);
    const minutes = durationTouched ? durationMin : chosen.defaultDurationMin;
    setDurationMin(minutes);
    if (startTouched || suggestStart === undefined) return moment;
    const fitting = suggestStart(minutes).minute;
    setStartMin(fitting);
    return momentOnGrid(day, gridStartMin, fitting);
  }

  function handleText(next: string) {
    setText(next);
    setHighlight(0);
    if (activity !== null && next !== activity.name) setActivity(null);
    setError(null);
  }

  /** Arrows move through the suggestions; Enter takes the highlighted one and saves. */
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0 || text.trim() === "") return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight(
        (current) => (current + step + suggestions.length) % suggestions.length,
      );
    } else if (event.key === "Enter") {
      const chosen = suggestions[highlight];
      if (chosen === undefined) return;
      event.preventDefault();
      const at = choose(chosen);
      void save(
        chosen,
        at,
        durationTouched ? durationMin : chosen.defaultDurationMin,
      );
    }
  }

  async function save(
    chosen: Doc<"activities"> | null,
    at: LocalMoment,
    minutes: number,
  ): Promise<void> {
    if (chosen === null && text.trim() === "") {
      setError("Type what it is, or pick an activity.");
      return;
    }
    if (chosen === null && categoryId === null) {
      setError("Choose a category.");
      return;
    }
    if (!isValidDuration(minutes)) {
      setError("Use a length from 5 minutes to 24 hours.");
      return;
    }
    const candidate = {
      date: at.date,
      startMin: at.minute,
      durationMin: minutes,
    };
    const inTheWay = collidingBlock(candidate, blocks);
    if (inTheWay !== undefined) {
      setError(overlapMessage(inTheWay));
      return;
    }
    const args: NewBlockArgs = {
      date: candidate.date,
      plannedStartMin: candidate.startMin,
      plannedDurationMin: candidate.durationMin,
    };
    if (chosen !== null) args.activityId = chosen._id;
    else {
      args.title = text;
      if (categoryId !== null) args.categoryId = categoryId;
    }
    setSaving(true);
    const failure = await onSave(args);
    setSaving(false);
    setError(failure);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(activity, moment, durationMin);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-what`}>What</Label>
        <Input
          id={`${ids}-what`}
          value={text}
          maxLength={MAX_TITLE_LENGTH}
          autoFocus
          autoComplete="off"
          placeholder="An activity, or a new title"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={`${ids}-suggestions`}
          aria-activedescendant={
            suggestions.length > 0 && text.trim() !== ""
              ? `${ids}-option-${highlight}`
              : undefined
          }
          onChange={(event) => handleText(event.target.value)}
          onKeyDown={handleKeyDown}
          className="h-11 sm:h-9"
        />
        {suggestions.length > 0 && (
          <ul
            id={`${ids}-suggestions`}
            role="listbox"
            aria-label="Activities"
            className="flex max-h-56 flex-col gap-0.5 overflow-y-auto"
          >
            {suggestions.map((item, index) => {
              const itemCategory = categories.find(
                (candidate) => candidate._id === item.categoryId,
              );
              const highlighted = text.trim() !== "" && index === highlight;
              return (
                <li
                  key={item._id}
                  id={`${ids}-option-${index}`}
                  role="option"
                  aria-selected={highlighted}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    data-color={itemCategory?.colorKey}
                    onClick={() => choose(item)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2 rounded-block px-2 text-left text-sm outline-none sm:min-h-9",
                      highlighted
                        ? "bg-key-tint text-key-ink"
                        : "hover:bg-muted",
                    )}
                  >
                    <AppIcon
                      name={item.icon ?? itemCategory?.icon}
                      className="size-4 text-key-solid"
                    />
                    <span className="flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDuration(item.defaultDurationMin)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {activity === null && text.trim() !== "" && (
        <CategoryPicker
          categories={categories}
          value={categoryId}
          onChange={(item) => setCategoryId(item._id)}
        />
      )}

      <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1.5">
        <Label htmlFor={`${ids}-start`}>Start</Label>
        <Label htmlFor={`${ids}-length`}>Length</Label>
        <TimeInput
          id={`${ids}-start`}
          value={startMin}
          onChange={(minute) => {
            setStartMin(minute);
            setStartTouched(true);
            setError(null);
          }}
          className="h-11 w-24 sm:h-9"
        />
        <DurationInput
          id={`${ids}-length`}
          value={durationMin}
          onChange={(minutes) => {
            setDurationMin(minutes);
            setDurationTouched(true);
            setError(null);
          }}
        />
      </div>

      {span !== null && (
        <p className="text-sm text-muted-foreground">
          {activity?.name ?? (text.trim() || "New block")}
          {category !== undefined && activity === null && ` · ${category.name}`}
          {" · "}
          {formatTimeRange(span.startMin, span.durationMin)}
          {span.date !== day &&
            ` · after midnight, ${formatDayLabel(span.date)}`}
        </p>
      )}
      {message !== null && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}

      <Button type="submit" disabled={saving} className="h-11 sm:h-9">
        Add block
      </Button>
    </form>
  );
}
