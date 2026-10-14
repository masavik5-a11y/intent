import { useId, useState } from "react";
import { partlyChoices, type StatusAction } from "@shared/blocks";
import { formatDuration } from "@shared/time";
import { DurationInput } from "@/components/DurationInput";
import { Button } from "@/components/ui/button";
import { Chip } from "./Chip";

/**
 * Done, Partly and Skip for a block not marked yet (PRD A1). Done is one tap. Partly
 * opens a few quick lengths and a typed one. Skip records at once; its optional reason
 * is asked afterwards (StatusSummary). Before a block starts only Skip is offered.
 */
export function StatusActions({
  plannedDurationMin,
  started,
  soFarMin,
  onAction,
}: {
  plannedDurationMin: number;
  /** Done and Partly come once the block has begun (PRD section 7, rule 5). */
  started: boolean;
  /** While it runs, the time it has had so far: one of Partly's choices. */
  soFarMin?: number;
  onAction: (action: StatusAction) => void;
}) {
  const ids = useId();
  const [partly, setPartly] = useState(false);
  const [typing, setTyping] = useState(false);
  const choices = partlyChoices(plannedDurationMin, soFarMin);
  const [typed, setTyped] = useState(
    () => choices[Math.floor(choices.length / 2)] ?? plannedDurationMin,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {started && (
          <>
            <Button
              type="button"
              className="h-11 flex-1 sm:h-9"
              onClick={() => onAction({ type: "done" })}
            >
              Done
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-expanded={partly}
              className="h-11 flex-1 sm:h-9"
              onClick={() => setPartly((open) => !open)}
            >
              Partly
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 sm:h-9"
          onClick={() => onAction({ type: "skip" })}
        >
          Skip
        </Button>
      </div>

      {started && partly && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            How long did you give it, of {formatDuration(plannedDurationMin)}?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {choices.map((minutes) => (
              <Chip
                key={minutes}
                onClick={() => onAction({ type: "partial", minutes })}
              >
                {formatDuration(minutes)}
              </Chip>
            ))}
            <Chip pressed={typing} onClick={() => setTyping((open) => !open)}>
              Other length
            </Chip>
          </div>
          {typing && (
            // Not a form: this sits inside block detail's form. Enter saves the
            // length here instead of submitting that one.
            <div
              className="flex flex-col gap-2"
              onKeyDown={(event) => {
                // Only from the text field: Enter on a preset length chip must
                // choose that length, not save the one typed before.
                if (
                  event.key !== "Enter" ||
                  !(event.target instanceof HTMLInputElement)
                ) {
                  return;
                }
                event.preventDefault();
                onAction({ type: "partial", minutes: typed });
              }}
            >
              <label htmlFor={`${ids}-partly`} className="sr-only">
                Length
              </label>
              <DurationInput
                id={`${ids}-partly`}
                value={typed}
                onChange={setTyped}
              />
              <Button
                type="button"
                className="h-11 self-start sm:h-9"
                onClick={() => onAction({ type: "partial", minutes: typed })}
              >
                Save {formatDuration(typed)}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
