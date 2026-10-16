import { useId, useState, type FormEvent } from "react";
import {
  editTarget,
  hasStarted,
  type IntentField,
  type StatusAction,
} from "@shared/blocks";
import {
  MAX_FOCUS_LENGTH,
  MAX_INTENT_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
} from "@shared/text";
import {
  formatDayLabel,
  formatTimeRange,
  isValidDuration,
  MINUTES_PER_DAY,
  type DateKey,
  type LocalMoment,
} from "@shared/time";
import { CategoryPicker } from "@/components/CategoryPicker";
import { DurationInput } from "@/components/DurationInput";
import { Field } from "@/components/Field";
import { TimeInput } from "@/components/TimeInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BlockUpdate, Doc, PlannedBlockDoc } from "@/lib/api";
import {
  collidingBlock,
  collidingEntry,
  entryOverlapMessage,
  overlapMessage,
} from "@/lib/blockOverlap";
import { COST_OF_SKIPPING_HINT, INTENT_PROMPTS } from "@/lib/intentPrompts";
import { cn } from "@/lib/utils";
import { StatusActions } from "@/features/status/StatusActions";
import { StatusSummary } from "@/features/status/StatusSummary";
import {
  RepeatSection,
  type RepeatOutcome,
  type RepeatProps,
} from "./RepeatSection";
import { skippedLine } from "./repeatView";
import {
  actualProblem,
  actualStartOf,
  draftOf,
  draftProblem,
  inheritedIntent,
  planChanged,
  splitForFollowing,
  updateArgs,
  type BlockDraft,
} from "./blockDraft";

interface BlockDetailProps {
  /** Block detail edits a plan; an unplanned entry gets its own form (M2). */
  block: PlannedBlockDoc;
  /** The day being viewed; a block from another day says which day it is on. */
  viewedDay: DateKey;
  activities: readonly Doc<"activities">[];
  categories: readonly Doc<"categories">[];
  /** The blocks loaded around the day, for the overlap warning. */
  blocks: readonly Doc<"blocks">[];
  /** Each resolves to an error message, or null when it worked. */
  onSave: (changes: BlockUpdate) => Promise<string | null>;
  onDelete: () => Promise<string | null>;
  onCancel: () => void;
  /** The device's minute: whether the block has started, so Done can be offered. */
  now: LocalMoment;
  /** Done, Partly, Skip, Undo: saved at once, apart from the form. */
  onAction: (action: StatusAction) => void;
  /** Opened with P: Partly's lengths show at once. */
  partlyOpen?: boolean;
  /** "Move to tomorrow" (PRD T11); resolves to an error message or null. */
  onMoveToTomorrow?: (() => Promise<string | null>) | undefined;
  /** Why the last of those did not save. */
  statusError: string | null;
  /** "Edit plan" was chosen for the whole (past) day. */
  dayPlanUnlocked: boolean;
  /** Its repeat settings (PRD P3). */
  repeat: Omit<RepeatProps, "blocked">;
  /**
   * Set on an occurrence of a repeating block, not changed by hand: changing its plan
   * or deleting it before it starts asks "This one" or "This and following" (decided
   * 2026-10-15). Null otherwise.
   */
  following: {
    /** The plan to the rule from this day on; the rest to this block alone. */
    onSave: (
      plan: ReturnType<typeof splitForFollowing>["plan"],
      rest: BlockUpdate | null,
    ) => Promise<RepeatOutcome>;
    onDelete: () => Promise<string | null>;
  } | null;
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
  now,
  onAction,
  partlyOpen = false,
  onMoveToTomorrow,
  statusError,
  dayPlanUnlocked,
  repeat,
  following,
}: BlockDetailProps) {
  const ids = useId();
  const [draft, setDraft] = useState(() => draftOf(block));
  // When what happened changes while the form is open (Undo then Partly here, or a
  // mark from the other device), the typed actual times describe the old mark: drop
  // them, so the fields show the new one and Save does not write the old one back.
  const actualKey = `${block.actualStartMin}/${block.actualDurationMin}`;
  const [seenActual, setSeenActual] = useState(actualKey);
  if (actualKey !== seenActual) {
    setSeenActual(actualKey);
    setDraft((current) => ({
      ...current,
      actualClockMin: null,
      actualDurationMin: null,
    }));
  }
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // "This one" or "This and following", asked on Save of a repeating block's plan.
  const [askScope, setAskScope] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [planUnlockedHere, setPlanUnlockedHere] = useState(false);
  // The past is edited as actual: a started block's plan is frozen behind "Edit plan".
  const planFrozen =
    editTarget(block, now) === "actual" &&
    !dayPlanUnlocked &&
    !planUnlockedHere;

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
  // What happened: shown once the block has actual times, even if they arrived
  // after the form opened (marked done right here).
  const hasActualTimes =
    block.actualStartMin !== undefined && block.actualDurationMin !== undefined;
  const actualClock =
    draft.actualClockMin ?? (block.actualStartMin ?? 0) % MINUTES_PER_DAY;
  const actualLength = draft.actualDurationMin ?? block.actualDurationMin ?? 0;
  const actualStart = actualStartOf(block, {
    ...draft,
    actualClockMin: actualClock,
  });
  const entryInTheWay =
    hasActualTimes &&
    typeof actualStart === "number" &&
    isValidDuration(actualLength)
      ? collidingEntry(
          {
            id: block._id,
            date: block.date,
            startMin: actualStart,
            durationMin: actualLength,
          },
          blocks,
        )
      : undefined;
  const overlap =
    blocking !== undefined
      ? overlapMessage(blocking)
      : entryInTheWay !== undefined
        ? entryOverlapMessage(entryInTheWay)
        : null;
  const message = error ?? overlap;

  function set<K extends keyof BlockDraft>(key: K, value: BlockDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
    setAskScope(false);
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
      (hasActualTimes ? actualProblem(block, draft) : null) ??
      overlap;
    if (problem !== null) {
      setError(problem);
      return;
    }
    // A repeating block's plan, still ahead: this one, or this and following. Once
    // it has started, or on a past day, only this one changes (PRD section 7, rule 4).
    if (following !== null && !planFrozen && planChanged(block, draft)) {
      setAskScope(true);
      return;
    }
    await saveThisOne();
  }

  async function saveThisOne() {
    setAskScope(false);
    setBusy(true);
    setError(await onSave(updateArgs(block, draft)));
    setBusy(false);
  }

  async function saveFollowing() {
    if (following === null) return;
    setAskScope(false);
    setBusy(true);
    const { plan, rest } = splitForFollowing(updateArgs(block, draft));
    const outcome = await following.onSave(plan, rest);
    setBusy(false);
    if ("error" in outcome) setError(outcome.error);
    else setInfo(skippedLine(outcome.skipped));
  }

  async function deleteFollowing() {
    if (following === null) return;
    setBusy(true);
    setError(await following.onDelete());
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
        <section
          aria-label="What happened"
          className="flex flex-col gap-2 rounded-block bg-muted/60 px-3 py-2"
        >
          {block.status === "planned" ? (
            <>
              <p className="text-sm">
                {hasStarted(block, now) ? "Not marked yet" : "Still ahead"}
              </p>
              <StatusActions
                plannedDurationMin={block.plannedDurationMin}
                started={hasStarted(block, now)}
                initialPartly={partlyOpen}
                onAction={onAction}
              />
              {onMoveToTomorrow !== undefined && (
                <MoveToTomorrow
                  started={hasStarted(block, now)}
                  onMove={onMoveToTomorrow}
                />
              )}
            </>
          ) : (
            <StatusSummary block={block} onAction={onAction} />
          )}
          {hasActualTimes && (
            <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1.5 pt-1">
              <label
                htmlFor={`${ids}-actual-start`}
                className="text-sm font-medium"
              >
                Started
              </label>
              <label
                htmlFor={`${ids}-actual-length`}
                className="text-sm font-medium"
              >
                For
              </label>
              <TimeInput
                id={`${ids}-actual-start`}
                value={actualClock}
                onChange={(minute) => set("actualClockMin", minute)}
                className="h-11 w-24 sm:h-9"
              />
              <DurationInput
                id={`${ids}-actual-length`}
                value={actualLength}
                onChange={(minutes) => set("actualDurationMin", minutes)}
              />
            </div>
          )}
          {(block.status !== "planned" || hasStarted(block, now)) && (
            <Field id={`${ids}-note`} label="Note">
              <Input
                id={`${ids}-note`}
                value={draft.note}
                maxLength={MAX_NOTE_LENGTH}
                autoComplete="off"
                placeholder="One line, if something is worth remembering"
                onChange={(event) => set("note", event.target.value)}
                className="h-11 bg-background sm:h-9"
              />
            </Field>
          )}
          {statusError !== null && (
            <p role="alert" className="text-sm text-destructive">
              {statusError}
            </p>
          )}
        </section>

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

        {planFrozen ? (
          // PRD section 7, rule 4: once a block has started, what changes is what
          // happened (above); the plan stays as it was unless asked for.
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm">
              <span className="text-muted-foreground">Planned </span>
              {formatTimeRange(block.plannedStartMin, block.plannedDurationMin)}
              {block.date !== viewedDay &&
                ` · starts ${formatDayLabel(block.date)}`}
            </p>
            <Button
              type="button"
              variant="ghost"
              className="h-11 sm:h-8"
              onClick={() => setPlanUnlockedHere(true)}
            >
              Edit plan
            </Button>
          </div>
        ) : (
          <>
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
                {formatTimeRange(
                  draft.plannedStartMin,
                  draft.plannedDurationMin,
                )}
                {block.date !== viewedDay &&
                  ` · starts ${formatDayLabel(block.date)}`}
              </p>
            )}
          </>
        )}

        <RepeatSection
          {...repeat}
          blockDate={block.date}
          // A rule is made from the block as saved.
          blocked={
            planChanged(block, draft) ? "Save your changes first." : null
          }
        />

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
        {info !== null && (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {info}
          </p>
        )}
        {askScope ? (
          <ScopeQuestion
            question="Change only this one, or this and the following?"
            busy={busy}
            onThisOne={() => void saveThisOne()}
            onFollowing={() => void saveFollowing()}
            onBack={() => setAskScope(false)}
            back="Back"
          />
        ) : confirmDelete ? (
          following !== null && !hasStarted(block, now) ? (
            <ScopeQuestion
              question="Delete only this one, or this and the following?"
              busy={busy}
              destructive
              onThisOne={() => void handleDelete()}
              onFollowing={() => void deleteFollowing()}
              onBack={() => setConfirmDelete(false)}
              back="Keep it"
            />
          ) : (
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
          )
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

/**
 * "This one" or "This and following" for a repeating block (decided 2026-10-15), in
 * place of the form's buttons until it is answered.
 */
function ScopeQuestion({
  question,
  busy,
  destructive = false,
  onThisOne,
  onFollowing,
  onBack,
  back,
}: {
  question: string;
  busy: boolean;
  destructive?: boolean;
  onThisOne: () => void;
  onFollowing: () => void;
  onBack: () => void;
  back: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">{question}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-11 sm:h-9"
          onClick={onBack}
        >
          {back}
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          className="h-11 sm:h-9"
          onClick={onThisOne}
        >
          This one
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          disabled={busy}
          className="h-11 sm:h-9"
          onClick={onFollowing}
        >
          This and following
        </Button>
      </div>
    </div>
  );
}

/**
 * "Move to tomorrow" (PRD T11): a block still ahead goes to the same time tomorrow,
 * or the first free time after it; one that has begun stays today as skipped and its
 * plan goes to tomorrow.
 */
function MoveToTomorrow({
  started,
  onMove,
}: {
  started: boolean;
  onMove: () => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onMove().then((failure) => {
            setBusy(false);
            setError(failure);
          });
        }}
        className="flex min-h-11 items-center self-start rounded-sm text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-8"
      >
        {started ? "Skip today, plan it tomorrow" : "Move to tomorrow"}
      </button>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
