import { useId, useState, type FormEvent } from "react";
import { momentOnGrid } from "@shared/grid";
import { MAX_TITLE_LENGTH } from "@shared/text";
import {
  formatDayLabel,
  formatTimeRange,
  isValidDuration,
  type DateKey,
  type LocalMoment,
} from "@shared/time";
import { CategoryPicker } from "@/components/CategoryPicker";
import { DurationInput } from "@/components/DurationInput";
import { TimeInput } from "@/components/TimeInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Doc, Id } from "@/lib/api";
import { collidingEntry, entryOverlapMessage } from "@/lib/blockOverlap";

export interface NewEntryArgs {
  date: DateKey;
  title?: string;
  categoryId: Id<"categories">;
  actualStartMin: number;
  actualDurationMin: number;
}

interface LogEntryFormProps {
  /** The day whose grid the entry goes into. */
  day: DateKey;
  gridStartMin: number;
  start: LocalMoment;
  durationMin: number;
  /** In the order offered: Drift first (logCategories). */
  categories: readonly Doc<"categories">[];
  /** The blocks loaded for the day, for the overlap warning. */
  blocks: readonly Doc<"blocks">[];
  /** Resolves to an error message, or null when saved. */
  onSave: (args: NewEntryArgs) => Promise<string | null>;
}

/**
 * Something that happened without a plan (PRD A3). Drift is chosen and the time is
 * filled in, so Enter alone logs it; a title is optional.
 */
export function LogEntryForm({
  day,
  gridStartMin,
  start,
  durationMin: initialDuration,
  categories,
  blocks,
  onSave,
}: LogEntryFormProps) {
  const ids = useId();
  const [categoryId, setCategoryId] = useState<Id<"categories"> | null>(
    () => categories[0]?._id ?? null,
  );
  const [title, setTitle] = useState("");
  const [startMin, setStartMin] = useState(start.minute);
  const [durationMin, setDurationMin] = useState(initialDuration);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const moment = momentOnGrid(day, gridStartMin, startMin);
  const span = isValidDuration(durationMin)
    ? { date: moment.date, startMin: moment.minute, durationMin }
    : null;
  const blocking = span === null ? undefined : collidingEntry(span, blocks);
  const category = categories.find((item) => item._id === categoryId);
  const message =
    error ?? (blocking === undefined ? null : entryOverlapMessage(blocking));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (categoryId === null) {
      setError("Choose a category.");
      return;
    }
    if (span === null) {
      setError("Use a length from 5 minutes to 24 hours.");
      return;
    }
    if (blocking !== undefined) {
      setError(entryOverlapMessage(blocking));
      return;
    }
    const args: NewEntryArgs = {
      date: span.date,
      categoryId,
      actualStartMin: span.startMin,
      actualDurationMin: span.durationMin,
    };
    if (title.trim() !== "") args.title = title;
    setSaving(true);
    const failure = await onSave(args);
    setSaving(false);
    setError(failure);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <CategoryPicker
        categories={categories}
        value={categoryId}
        onChange={(item) => {
          setCategoryId(item._id);
          setError(null);
        }}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-what`}>What (optional)</Label>
        <Input
          id={`${ids}-what`}
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          autoFocus
          autoComplete="off"
          placeholder="Phone, a nap, a call…"
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
          className="h-11 sm:h-9"
        />
      </div>

      <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1.5">
        <Label htmlFor={`${ids}-start`}>Start</Label>
        <Label htmlFor={`${ids}-length`}>Length</Label>
        <TimeInput
          id={`${ids}-start`}
          value={startMin}
          onChange={(minute) => {
            setStartMin(minute);
            setError(null);
          }}
          className="h-11 w-24 sm:h-9"
        />
        <DurationInput
          id={`${ids}-length`}
          value={durationMin}
          onChange={(minutes) => {
            setDurationMin(minutes);
            setError(null);
          }}
        />
      </div>

      {span !== null && (
        <p className="text-sm text-muted-foreground">
          {title.trim() === ""
            ? (category?.name ?? "Entry")
            : `${category?.name ?? "Entry"} · ${title.trim()}`}
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
        Log it
      </Button>
    </form>
  );
}
