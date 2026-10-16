import { useState } from "react";
import type { DateKey, LocalMoment } from "@shared/time";
import { AdaptiveDialog } from "@/components/AdaptiveDialog";
import { Button } from "@/components/ui/button";
import type { Doc } from "@/lib/api";
import { Chip } from "@/features/status/Chip";
import { previewShift, SHIFT_CHOICES, shiftLabel } from "./replanView";

/**
 * "Shift the rest of today" (PRD T11): the blocks still ahead move together by the
 * chosen minutes. What would move, or what is in the way, is said before Shift.
 */
export function ShiftDialog({
  open,
  isPhone,
  onClose,
  blocks,
  categories,
  day,
  gridStartMin,
  now,
  onShift,
}: {
  open: boolean;
  isPhone: boolean;
  onClose: () => void;
  /** The blocks loaded for the day (the day before to the day after). */
  blocks: readonly Doc<"blocks">[];
  categories: readonly Doc<"categories">[];
  day: DateKey;
  gridStartMin: number;
  now: LocalMoment;
  /** Resolves to an error message, or null when shifted. */
  onShift: (minutes: number) => Promise<string | null>;
}) {
  return (
    <AdaptiveDialog
      open={open}
      isPhone={isPhone}
      onClose={onClose}
      title="Shift the rest of today"
      description="Everything still ahead moves together; nothing else does."
    >
      <ShiftForm
        blocks={blocks}
        categories={categories}
        day={day}
        gridStartMin={gridStartMin}
        now={now}
        onShift={onShift}
      />
    </AdaptiveDialog>
  );
}

function ShiftForm({
  blocks,
  categories,
  day,
  gridStartMin,
  now,
  onShift,
}: {
  blocks: readonly Doc<"blocks">[];
  categories: readonly Doc<"categories">[];
  day: DateKey;
  gridStartMin: number;
  now: LocalMoment;
  onShift: (minutes: number) => Promise<string | null>;
}) {
  const [minutes, setMinutes] = useState<number>(SHIFT_CHOICES[1]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = previewShift(
    blocks,
    categories,
    day,
    gridStartMin,
    now,
    minutes,
  );

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="By" className="flex flex-wrap gap-1.5">
        {SHIFT_CHOICES.map((choice) => (
          <Chip
            key={choice}
            pressed={choice === minutes}
            onClick={() => {
              setMinutes(choice);
              setError(null);
            }}
          >
            {shiftLabel(choice)}
          </Chip>
        ))}
      </div>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {preview.text}
      </p>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        className="h-11 sm:h-9"
        disabled={!preview.canShift || busy}
        onClick={() => {
          setBusy(true);
          void onShift(minutes).then((failure) => {
            setBusy(false);
            setError(failure);
          });
        }}
      >
        Shift {shiftLabel(minutes)}
      </Button>
    </div>
  );
}
