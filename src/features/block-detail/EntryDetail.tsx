import { useId, useState, type FormEvent } from "react";
import { MAX_NOTE_LENGTH, MAX_TITLE_LENGTH } from "@shared/text";
import { formatDayLabel, formatTimeRange, isValidDuration } from "@shared/time";
import { CategoryPicker } from "@/components/CategoryPicker";
import { DurationInput } from "@/components/DurationInput";
import { Field } from "@/components/Field";
import { TimeInput } from "@/components/TimeInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BlockUpdate, Doc } from "@/lib/api";
import { collidingEntry, entryOverlapMessage } from "@/lib/blockOverlap";
import {
  entryDraftOf,
  entryProblem,
  entryStart,
  entryUpdateArgs,
  type EntryDraft,
} from "./entryDraft";

interface EntryDetailProps {
  /** An unplanned entry: actual times, no plan. */
  entry: Doc<"blocks">;
  gridStartMin: number;
  categories: readonly Doc<"categories">[];
  /** The blocks loaded around the day, for the overlap warning. */
  blocks: readonly Doc<"blocks">[];
  /** Each resolves to an error message, or null when it worked. */
  onSave: (changes: BlockUpdate) => Promise<string | null>;
  onDelete: () => Promise<string | null>;
  onCancel: () => void;
}

/**
 * An unplanned entry (PRD A2, A3, A5): what it was, its category, when, and a note.
 * It has no plan and no intent, so there is less here than in block detail.
 */
export function EntryDetail({
  entry,
  gridStartMin,
  categories,
  blocks,
  onSave,
  onDelete,
  onCancel,
}: EntryDetailProps) {
  const ids = useId();
  const [draft, setDraft] = useState(() => entryDraftOf(entry));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const start = entryStart(entry, draft, gridStartMin);
  const inTheWay = isValidDuration(draft.durationMin)
    ? collidingEntry(
        {
          id: entry._id,
          date: start.date,
          startMin: start.minute,
          durationMin: draft.durationMin,
        },
        blocks,
      )
    : undefined;
  const message =
    error ?? (inTheWay === undefined ? null : entryOverlapMessage(inTheWay));

  function set<K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem =
      entryProblem(draft) ??
      (inTheWay === undefined ? null : entryOverlapMessage(inTheWay));
    if (problem !== null) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(
      await onSave(entryUpdateArgs(entry, draft, gridStartMin, categories)),
    );
    setBusy(false);
  }

  async function handleDelete() {
    setBusy(true);
    setError(await onDelete());
    setBusy(false);
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6 sm:px-5">
        <Field id={`${ids}-title`} label="What">
          <Input
            id={`${ids}-title`}
            value={draft.title}
            maxLength={MAX_TITLE_LENGTH}
            autoComplete="off"
            onChange={(event) => set("title", event.target.value)}
            className="h-11 sm:h-9"
          />
        </Field>

        <CategoryPicker
          categories={categories}
          value={draft.categoryId}
          onChange={(category) => set("categoryId", category._id)}
        />

        <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1.5">
          <label htmlFor={`${ids}-start`} className="text-sm font-medium">
            Started
          </label>
          <label htmlFor={`${ids}-length`} className="text-sm font-medium">
            For
          </label>
          <TimeInput
            id={`${ids}-start`}
            value={draft.startClockMin}
            onChange={(minute) => set("startClockMin", minute)}
            className="h-11 w-24 sm:h-9"
          />
          <DurationInput
            id={`${ids}-length`}
            value={draft.durationMin}
            onChange={(minutes) => set("durationMin", minutes)}
          />
        </div>
        {isValidDuration(draft.durationMin) && (
          <p className="-mt-2 text-sm text-muted-foreground">
            {formatTimeRange(start.minute, draft.durationMin)}
            {start.date !== entry.date &&
              ` · moves to ${formatDayLabel(start.date)}`}
          </p>
        )}

        <Field id={`${ids}-note`} label="Note">
          <Input
            id={`${ids}-note`}
            value={draft.note}
            maxLength={MAX_NOTE_LENGTH}
            autoComplete="off"
            placeholder="One line, if something is worth remembering"
            onChange={(event) => set("note", event.target.value)}
            className="h-11 sm:h-9"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:px-5">
        {message !== null && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm">Delete this entry?</p>
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-9"
              onClick={() => setConfirmDelete(false)}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              className="h-11 sm:h-9"
              onClick={() => void handleDelete()}
            >
              Delete
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-11 sm:h-9"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
            <div className="flex-1" />
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-9"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="h-11 sm:h-9">
              Save
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
