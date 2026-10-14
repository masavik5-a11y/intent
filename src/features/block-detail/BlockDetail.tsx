import { useId, useState, type FormEvent } from "react";
import type { IntentField } from "@shared/blocks";
import {
  MAX_FOCUS_LENGTH,
  MAX_INTENT_LENGTH,
  MAX_TITLE_LENGTH,
} from "@shared/text";
import {
  formatDayLabel,
  formatTimeRange,
  isValidDuration,
  type DateKey,
} from "@shared/time";
import { CategoryPicker } from "@/components/CategoryPicker";
import { DurationInput } from "@/components/DurationInput";
import { Field } from "@/components/Field";
import { TimeInput } from "@/components/TimeInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Doc } from "@/lib/api";
import { collidingBlock, overlapMessage } from "@/lib/blockOverlap";
import { COST_OF_SKIPPING_HINT, INTENT_PROMPTS } from "@/lib/intentPrompts";
import { cn } from "@/lib/utils";
import {
  draftOf,
  draftProblem,
  inheritedIntent,
  updateArgs,
  type BlockDraft,
} from "./blockDraft";

export type BlockChanges = ReturnType<typeof updateArgs>;

interface BlockDetailProps {
  block: Doc<"blocks">;
  /** The day being viewed; a block from another day says which day it is on. */
  viewedDay: DateKey;
  activities: readonly Doc<"activities">[];
  categories: readonly Doc<"categories">[];
  /** The blocks loaded around the day, for the overlap warning. */
  blocks: readonly Doc<"blocks">[];
  /** Each resolves to an error message, or null when it worked. */
  onSave: (changes: BlockChanges) => Promise<string | null>;
  onDelete: () => Promise<string | null>;
  onCancel: () => void;
}

/**
 * Everything about one block (DESIGN.md section 7, "Block detail"). Intent the block
 * inherits from its activity shows greyed in the empty field; typing makes it the
 * block's own for that day, and "Use … 's" hands it back to the activity.
 */
export function BlockDetail({
  block,
  viewedDay,
  activities,
  categories,
  blocks,
  onSave,
  onDelete,
  onCancel,
}: BlockDetailProps) {
  const ids = useId();
  const [draft, setDraft] = useState(() => draftOf(block));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activity = activities.find((item) => item._id === draft.activityId);
  const inherited = inheritedIntent(activity);
  const choosableActivities = activities.filter(
    (item) => !item.archived || item._id === draft.activityId,
  );
  const blocking = isValidDuration(draft.plannedDurationMin)
    ? collidingBlock(
        {
          id: block._id,
          date: block.date,
          startMin: draft.plannedStartMin,
          durationMin: draft.plannedDurationMin,
        },
        blocks,
      )
    : undefined;
  const message =
    error ?? (blocking === undefined ? null : overlapMessage(blocking));

  function set<K extends keyof BlockDraft>(key: K, value: BlockDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function chooseActivity(activityId: string) {
    const chosen = activities.find((item) => item._id === activityId);
    setDraft((current) => ({
      ...current,
      activityId: chosen?._id ?? null,
      // A block follows its activity into the activity's category.
      categoryId: chosen?.categoryId ?? current.categoryId,
    }));
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem =
      draftProblem(draft) ??
      (blocking === undefined ? null : overlapMessage(blocking));
    if (problem !== null) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(await onSave(updateArgs(block, draft)));
    setBusy(false);
  }

  async function handleDelete() {
    setBusy(true);
    setError(await onDelete());
    setBusy(false);
  }

  const intentArea = (
    field: IntentField,
    options: { voice?: boolean; hint?: string } = {},
  ) => {
    const id = `${ids}-${field}`;
    const fromActivity = inherited[field];
    const own = draft[field];
    return (
      <Field
        id={id}
        label={INTENT_PROMPTS[field]}
        hint={options.hint}
        aside={
          fromActivity === null ||
          activity === undefined ? undefined : own.trim() === "" ? (
            <span className="text-xs text-muted-foreground">
              From {activity.name}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => set(field, "")}
              className="rounded-sm text-xs text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Use {activity.name}'s
            </button>
          )
        }
      >
        <Textarea
          id={id}
          value={own}
          maxLength={MAX_INTENT_LENGTH}
          rows={2}
          // The inherited text, greyed, until this block gets its own.
          placeholder={fromActivity ?? undefined}
          aria-describedby={
            options.hint === undefined ? undefined : `${id}-hint`
          }
          onChange={(event) => set(field, event.target.value)}
          className={cn(
            "min-h-16",
            options.voice === true && "font-voice text-lg md:text-lg",
          )}
        />
      </Field>
    );
  };

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

        <Field id={`${ids}-activity`} label="Activity">
          <select
            id={`${ids}-activity`}
            value={draft.activityId ?? ""}
            onChange={(event) => chooseActivity(event.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9 md:text-sm dark:bg-input/30"
          >
            <option value="">No activity</option>
            {choosableActivities.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>

        <CategoryPicker
          categories={categories}
          value={draft.categoryId}
          onChange={(category) => set("categoryId", category._id)}
        />

        <Field id={`${ids}-focus`} label="What exactly today">
          <Input
            id={`${ids}-focus`}
            value={draft.focus}
            maxLength={MAX_FOCUS_LENGTH}
            autoComplete="off"
            placeholder="Push day, the hook, chapter 3…"
            onChange={(event) => set("focus", event.target.value)}
            className="h-11 sm:h-9"
          />
        </Field>

        {intentArea("doneWhen")}

        <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1.5">
          <label htmlFor={`${ids}-start`} className="text-sm font-medium">
            Start
          </label>
          <label htmlFor={`${ids}-length`} className="text-sm font-medium">
            Length
          </label>
          <TimeInput
            id={`${ids}-start`}
            value={draft.plannedStartMin}
            onChange={(minute) => set("plannedStartMin", minute)}
            className="h-11 w-24 sm:h-9"
          />
          <DurationInput
            id={`${ids}-length`}
            value={draft.plannedDurationMin}
            onChange={(minutes) => set("plannedDurationMin", minutes)}
          />
        </div>
        {isValidDuration(draft.plannedDurationMin) && (
          <p className="-mt-2 text-sm text-muted-foreground">
            {formatTimeRange(draft.plannedStartMin, draft.plannedDurationMin)}
            {block.date !== viewedDay &&
              ` · starts ${formatDayLabel(block.date)}`}
          </p>
        )}

        <section className="flex flex-col gap-4">
          <h3 className="text-lg font-medium">Intent</h3>
          {intentArea("why", { voice: true })}
          {intentArea("how")}
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-lg font-medium">For hard days</h3>
          {intentArea("ifThen")}
          {intentArea("minimumVersion")}
          {intentArea("costOfSkipping", { hint: COST_OF_SKIPPING_HINT })}
        </section>
      </div>

      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:px-5">
        {message !== null && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm">Delete this block?</p>
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
