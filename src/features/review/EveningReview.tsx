import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { hasPlan, type StatusAction } from "@shared/blocks";
import type { DayTotals } from "@shared/summary";
import {
  addDays,
  formatDayLabel,
  type DateKey,
  type LocalMoment,
} from "@shared/time";
import { SidePanel } from "@/components/SidePanel";
import { Button } from "@/components/ui/button";
import { api, type Doc, type Id } from "@/lib/api";
import { saveErrorMessage } from "@/lib/errorMessages";
import { dayTitle } from "@/features/day/dayView";
import { logCategories } from "@/features/log/logRules";
import { MainFocusField } from "@/features/planning/MainFocusField";
import { focusPrompt } from "@/features/planning/planningView";
import {
  GapsStep,
  ReflectStep,
  ResolveStep,
  ReviewProgress,
  type GapLabel,
} from "./ReviewSteps";
import {
  closedLine,
  nextDayName,
  nextStep,
  planSummary,
  previousStep,
  quickGapCategories,
  reflectionChanges,
  reflectionDraftOf,
  reviewGaps,
  unresolvedBlocks,
  type ReflectionDraft,
  type ReviewGap,
  type ReviewStep,
} from "./reviewView";

interface EveningReviewProps {
  /** The day being reviewed. */
  date: DateKey;
  today: DateKey;
  step: ReviewStep;
  /** Moves to another step (it lives in the URL). */
  onStep: (step: ReviewStep) => void;
  onClose: () => void;
  /** Hands over to planning the next day (PRD P1). */
  onPlanNext: (date: DateKey) => void;
  wide: boolean;
  /** The blocks loaded for the day's view. */
  blocks: readonly Doc<"blocks">[];
  activities: readonly Doc<"activities">[];
  categories: readonly Doc<"categories">[];
  gridStartMin: number;
  now: LocalMoment;
  totals: DayTotals | null;
  /** The day's record: its answers so far. Null before anything is written. */
  day: Doc<"days"> | null;
  /** Done, Partly, Skip, Undo, as from the now panel. */
  onAction: (blockId: Id<"blocks">, action: StatusAction) => void;
  statusError: string | null;
}

/**
 * The evening review (PRD R1, R2; DESIGN.md section 7): resolve, fill gaps, reflect,
 * then tomorrow. Every step can be passed with Next. The side panel on desktop, so the
 * grid stays in view and editable; a sheet on the phone.
 */
export function EveningReview({
  date,
  today,
  step,
  onStep,
  onClose,
  onPlanNext,
  wide,
  blocks,
  activities,
  categories,
  gridStartMin,
  now,
  totals,
  day,
  onAction,
  statusError,
}: EveningReviewProps) {
  const logEntry = useMutation(api.blocks.logEntry);
  const saveReflection = useMutation(api.days.saveReflection);
  const closeReview = useMutation(api.days.closeReview);
  const next = addDays(date, 1);
  const nextBlocks = useQuery(
    api.blocks.listForDay,
    step === "tomorrow" ? { date: next } : "skip",
  );
  const nextDay = useQuery(
    api.days.get,
    step === "tomorrow" ? { date: next } : "skip",
  );
  const setMainFocus = useMutation(api.days.setMainFocus);
  const saveNextFocus = useCallback(
    (text: string) =>
      setMainFocus({
        date: next,
        mainFocus: text.trim() === "" ? null : text,
      }).then(() => undefined),
    [setMainFocus, next],
  );

  // The blocks to resolve as the review opened stay listed once marked, with Undo;
  // any that start meanwhile join them.
  const unresolved = unresolvedBlocks(blocks, date, gridStartMin, now);
  const [asked] = useState(
    () => new Set<string>(unresolved.map((block) => block._id)),
  );
  const resolveItems = blocks
    .filter(hasPlan)
    .filter(
      (block) =>
        asked.has(block._id) ||
        unresolved.some((item) => item._id === block._id),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.plannedStartMin - b.plannedStartMin,
    )
    .map((block) => ({
      block,
      activity: activities.find((item) => item._id === block.activityId),
      category: categories.find((item) => item._id === block.categoryId),
    }));

  const [leftAlone, setLeftAlone] = useState<ReadonlySet<string>>(new Set());
  const [gapErrors, setGapErrors] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const gaps = reviewGaps(blocks, date, gridStartMin, now).filter(
    (gap) => !leftAlone.has(gap.key),
  );

  const [draft, setDraft] = useState<ReflectionDraft>(() =>
    reflectionDraftOf(day),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function label(gap: ReviewGap, choice: GapLabel) {
    setGapErrors((current) => without(current, gap.key));
    try {
      await logEntry({
        date: gap.start.date,
        actualStartMin: gap.start.minute,
        actualDurationMin: gap.durationMin,
        ...choice,
      });
    } catch (failure) {
      setGapErrors((current) =>
        new Map(current).set(gap.key, saveErrorMessage(failure)),
      );
    }
  }

  /** Runs a save, then moves on; a failure stays on this step with its message. */
  async function attempt(save: () => Promise<unknown>, then: () => void) {
    setBusy(true);
    setError(null);
    try {
      await save();
      then();
    } catch (failure) {
      setError(saveErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function goNext() {
    if (step === "reflect") {
      const changes = reflectionChanges(day, draft);
      if (Object.keys(changes).length > 0) {
        void attempt(
          () => saveReflection({ date, ...changes }),
          () => onStep(nextStep(step)),
        );
        return;
      }
    }
    setError(null);
    onStep(nextStep(step));
  }

  const back = previousStep(step);
  // Planning a day that is already over makes no sense; reviewing yesterday hands
  // over to today.
  const canPlanNext = next >= today;

  return (
    <SidePanel
      wide={wide}
      title="Review the day"
      subtitle={formatDayLabel(date)}
      onCancel={onClose}
    >
      <ReviewProgress step={step} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6 sm:px-5">
        {step === "resolve" && (
          <ResolveStep items={resolveItems} onAction={onAction} />
        )}
        {step === "gaps" && (
          <GapsStep
            gaps={gaps}
            quick={quickGapCategories(categories)}
            categories={logCategories(categories)}
            activities={activities}
            errors={gapErrors}
            onLabel={(gap, choice) => void label(gap, choice)}
            onLeave={(gap) =>
              setLeftAlone((current) => new Set(current).add(gap.key))
            }
          />
        )}
        {step === "reflect" && (
          <ReflectStep draft={draft} onChange={setDraft} />
        )}
        {step === "tomorrow" && (
          <div className="flex flex-col gap-3">
            <h3 className="text-base font-medium">{dayTitle(next, today)}</h3>
            <p className="text-sm text-muted-foreground">
              {nextBlocks === undefined
                ? " "
                : planSummary(nextBlocks, next, gridStartMin)}
            </p>
            {canPlanNext && nextDay !== undefined && (
              <MainFocusField
                prompt={focusPrompt(next, today)}
                saved={nextDay?.mainFocus ?? ""}
                onSave={saveNextFocus}
              />
            )}
          </div>
        )}
        {step === "closed" && (
          <p className="text-base">
            {totals === null ? "Day closed." : closedLine(totals)}
          </p>
        )}
        {statusError !== null && step === "resolve" && (
          <p role="alert" className="text-sm text-destructive">
            {statusError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:px-5">
        {error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          {back !== null && step !== "closed" && (
            <Button
              type="button"
              variant="ghost"
              className="h-11 sm:h-9"
              onClick={() => {
                setError(null);
                onStep(back);
              }}
            >
              Back
            </Button>
          )}
          <div className="flex-1" />
          {step === "closed" ? (
            <Button type="button" className="h-11 sm:h-9" onClick={onClose}>
              Done
            </Button>
          ) : step === "tomorrow" ? (
            <>
              <Button
                type="button"
                variant={canPlanNext ? "outline" : "default"}
                disabled={busy}
                className="h-11 sm:h-9"
                onClick={() =>
                  void attempt(
                    () => closeReview({ date }),
                    () => onStep("closed"),
                  )
                }
              >
                Close the day
              </Button>
              {canPlanNext && (
                <Button
                  type="button"
                  disabled={busy}
                  className="h-11 sm:h-9"
                  onClick={() =>
                    void attempt(
                      () => closeReview({ date }),
                      () => onPlanNext(next),
                    )
                  }
                >
                  Plan {nextDayName(next, today)}
                </Button>
              )}
            </>
          ) : (
            <Button
              type="button"
              disabled={busy}
              className="h-11 sm:h-9"
              onClick={goNext}
            >
              Next
            </Button>
          )}
        </div>
      </div>
    </SidePanel>
  );
}

function without<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
  const copy = new Map(map);
  copy.delete(key);
  return copy;
}
