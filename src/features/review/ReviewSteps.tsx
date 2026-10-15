import { useId, useState, type ReactNode } from "react";
import type { StatusAction } from "@shared/blocks";
import { REFLECTION_FIELDS, SCALE_POINTS } from "@shared/days";
import { MAX_REFLECTION_LENGTH } from "@shared/text";
import { formatTimeRange } from "@shared/time";
import { AppIcon } from "@/components/AppIcon";
import { Field } from "@/components/Field";
import { Textarea } from "@/components/ui/textarea";
import type { Doc, Id, PlannedBlockDoc } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Chip } from "@/features/status/Chip";
import { StatusActions } from "@/features/status/StatusActions";
import { StatusSummary } from "@/features/status/StatusSummary";
import {
  gapLabel,
  REFLECTION_PROMPTS,
  REVIEW_STEP_LABELS,
  REVIEW_STEPS,
  type ReflectionDraft,
  type ReviewGap,
  type ReviewStep,
} from "./reviewView";

// The evening review's steps (DESIGN.md section 7, "Evening review"). Presentational:
// EveningReview owns the data and the saving.

/** "1 of 4 · Resolve", with four small bars. */
export function ReviewProgress({ step }: { step: ReviewStep }) {
  const index = REVIEW_STEPS.findIndex((item) => item === step);
  const current = index === -1 ? REVIEW_STEPS.length : index + 1;
  return (
    <div className="flex flex-col gap-1.5 px-4 pb-3 sm:px-5">
      <div aria-hidden="true" className="flex gap-1">
        {REVIEW_STEPS.map((item, at) => (
          <span
            key={item}
            className={cn(
              "h-1 flex-1 rounded-full",
              at < current ? "bg-foreground" : "bg-muted",
            )}
          />
        ))}
      </div>
      {index !== -1 && (
        <p className="text-xs text-muted-foreground">
          {current} of {REVIEW_STEPS.length} ·{" "}
          {REVIEW_STEP_LABELS[REVIEW_STEPS[index] ?? "resolve"]}
        </p>
      )}
    </div>
  );
}

export interface ResolveItem {
  block: PlannedBlockDoc;
  activity: Doc<"activities"> | undefined;
  category: Doc<"categories"> | undefined;
}

/**
 * Step 1: every block still "planned" gets Done, Partly or Skip, one tap each. A block
 * marked here stays in the list with what became of it and Undo.
 */
export function ResolveStep({
  items,
  onAction,
}: {
  items: readonly ResolveItem[];
  onAction: (blockId: Id<"blocks">, action: StatusAction) => void;
}) {
  if (items.length === 0) {
    return <StepIntro>Everything is marked.</StepIntro>;
  }
  return (
    <div className="flex flex-col gap-3">
      <StepIntro>What became of these?</StepIntro>
      <ul className="flex flex-col gap-3">
        {items.map(({ block, activity, category }) => (
          <li
            key={block._id}
            data-color={category?.colorKey}
            className="flex flex-col gap-2 rounded-block border px-3 py-2"
          >
            <p className="flex items-center gap-2 text-sm">
              <AppIcon
                name={activity?.icon ?? category?.icon}
                className="size-4 shrink-0 text-key-solid"
              />
              <span className="min-w-0 flex-1 truncate font-medium">
                {block.title}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatTimeRange(
                  block.plannedStartMin,
                  block.plannedDurationMin,
                )}
              </span>
            </p>
            {block.status === "planned" ? (
              <StatusActions
                key={block._id}
                plannedDurationMin={block.plannedDurationMin}
                started
                onAction={(action) => onAction(block._id, action)}
              />
            ) : (
              <StatusSummary
                block={block}
                onAction={(action) => onAction(block._id, action)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** How a gap is labelled: a category, or one of the activities. */
export type GapLabel =
  | { categoryId: Id<"categories"> }
  | { categoryId: Id<"categories">; activityId: Id<"activities"> };

/**
 * Step 2: untracked stretches of 30 minutes or more, each labelled with one tap (Drift
 * or Rest; "Something else" opens every category and the activities) or left as it
 * is. Untracked is not drift (PRD section 7, rule 8), so "Leave it" is a plain choice.
 */
export function GapsStep({
  gaps,
  quick,
  categories,
  activities,
  errors,
  onLabel,
  onLeave,
}: {
  gaps: readonly ReviewGap[];
  /** Offered at once: drift, then rest (quickGapCategories). */
  quick: readonly Doc<"categories">[];
  /** Every category, behind "Something else": Drift first (logCategories). */
  categories: readonly Doc<"categories">[];
  activities: readonly Doc<"activities">[];
  /** A failed save, by gap key. */
  errors: ReadonlyMap<string, string>;
  onLabel: (gap: ReviewGap, label: GapLabel) => void;
  onLeave: (gap: ReviewGap) => void;
}) {
  if (gaps.length === 0) {
    return <StepIntro>No gaps of 30 minutes or more.</StepIntro>;
  }
  const choosable = activities
    .filter((activity) => !activity.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="flex flex-col gap-3">
      <StepIntro>Where did this time go? Or leave it untracked.</StepIntro>
      <ul className="flex flex-col gap-3">
        {gaps.map((gap) => (
          <GapRow
            key={gap.key}
            gap={gap}
            quick={quick}
            categories={categories}
            activities={choosable}
            error={errors.get(gap.key)}
            onLabel={(label) => onLabel(gap, label)}
            onLeave={() => onLeave(gap)}
          />
        ))}
      </ul>
    </div>
  );
}

function GapRow({
  gap,
  quick,
  categories,
  activities,
  error,
  onLabel,
  onLeave,
}: {
  gap: ReviewGap;
  quick: readonly Doc<"categories">[];
  categories: readonly Doc<"categories">[];
  activities: readonly Doc<"activities">[];
  error: string | undefined;
  onLabel: (label: GapLabel) => void;
  onLeave: () => void;
}) {
  const ids = useId();
  const [more, setMore] = useState(false);
  const others = categories.filter(
    (category) => !quick.some((item) => item._id === category._id),
  );
  return (
    <li className="flex flex-col gap-2 rounded-block border px-3 py-2">
      <p className="text-sm font-medium tabular-nums">{gapLabel(gap)}</p>
      <div className="flex flex-wrap gap-1.5">
        {quick.map((category) => (
          <CategoryChip
            key={category._id}
            category={category}
            onClick={() => onLabel({ categoryId: category._id })}
          />
        ))}
        <Chip onClick={onLeave}>Leave it</Chip>
        <Chip pressed={more} onClick={() => setMore((open) => !open)}>
          Something else
        </Chip>
      </div>
      {more && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {others.map((category) => (
              <CategoryChip
                key={category._id}
                category={category}
                onClick={() => onLabel({ categoryId: category._id })}
              />
            ))}
          </div>
          {activities.length > 0 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor={`${ids}-activity`}
                className="text-sm text-muted-foreground"
              >
                An activity
              </label>
              <select
                id={`${ids}-activity`}
                value=""
                onChange={(event) => {
                  const activity = activities.find(
                    (item) => item._id === event.target.value,
                  );
                  if (activity !== undefined) {
                    onLabel({
                      categoryId: activity.categoryId,
                      activityId: activity._id,
                    });
                  }
                }}
                className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-8 md:text-sm dark:bg-input/30"
              >
                <option value="">Choose…</option>
                {activities.map((activity) => (
                  <option key={activity._id} value={activity._id}>
                    {activity.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      {error !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

/** A category to label a gap with, in its colour: one tap logs it. */
function CategoryChip({
  category,
  onClick,
}: {
  category: Doc<"categories">;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-color={category.colorKey}
      onClick={onClick}
      className="flex h-11 items-center gap-1.5 rounded-full bg-key-tint px-3 text-sm text-key-ink outline-none sm:h-8 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <AppIcon name={category.icon} className="size-4" />
      {category.name}
    </button>
  );
}

/** Step 3: three short prompts, then an optional rating and energy (PRD R2). */
export function ReflectStep({
  draft,
  onChange,
}: {
  draft: ReflectionDraft;
  onChange: (draft: ReflectionDraft) => void;
}) {
  const ids = useId();
  return (
    <div className="flex flex-col gap-4">
      {REFLECTION_FIELDS.map((field) => (
        <Field
          key={field}
          id={`${ids}-${field}`}
          label={REFLECTION_PROMPTS[field]}
        >
          <Textarea
            id={`${ids}-${field}`}
            value={draft[field]}
            maxLength={MAX_REFLECTION_LENGTH}
            rows={2}
            onChange={(event) =>
              onChange({ ...draft, [field]: event.target.value })
            }
            className="min-h-16"
          />
        </Field>
      ))}
      <ScaleChoice
        label="How was the day?"
        value={draft.rating}
        onChange={(rating) => onChange({ ...draft, rating })}
      />
      <ScaleChoice
        label="Energy"
        value={draft.energy}
        onChange={(energy) => onChange({ ...draft, energy })}
      />
    </div>
  );
}

/** 1 to 5, optional: tapping the chosen point again takes it back. */
function ScaleChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">
        {label}{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </legend>
      <div className="flex gap-1.5">
        {SCALE_POINTS.map((point) => (
          <Chip
            key={point}
            pressed={value === point}
            onClick={() => onChange(value === point ? null : point)}
          >
            {point}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

function StepIntro({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
