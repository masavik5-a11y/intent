import { useState } from "react";
import { snapMinutes } from "@shared/grid";
import {
  formatDuration,
  isValidDuration,
  MINUTE_STEP,
  parseDuration,
} from "@shared/time";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESETS = [15, 30, 45, 60, 90, 120, 180] as const;

/** The minutes typed text stands for, snapped to the 5-minute step, or null. */
function readDuration(text: string): number | null {
  const parsed = parseDuration(text);
  if (parsed === null) return null;
  const snapped = snapMinutes(parsed, MINUTE_STEP);
  return isValidDuration(snapped) ? snapped : null;
}

/**
 * A length of time: typed ("1h 30m", "90", "1:30") or picked from a few presets.
 * Typed text is snapped to 5 minutes; text that is not a length reverts on blur.
 */
export function DurationInput({
  id,
  value,
  onChange,
  describedBy,
}: {
  id: string;
  value: number;
  onChange: (minutes: number) => void;
  describedBy?: string;
}) {
  const [text, setText] = useState(() => formatDuration(value));
  const [shown, setShown] = useState(value);
  // A new value from outside (a preset, another draft) replaces the text.
  if (value !== shown) {
    setShown(value);
    setText(formatDuration(value));
  }
  const invalid = readDuration(text) === null;

  function handleText(next: string) {
    setText(next);
    const minutes = readDuration(next);
    if (minutes !== null) {
      setShown(minutes);
      onChange(minutes);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        value={text}
        inputMode="text"
        autoComplete="off"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(event) => handleText(event.target.value)}
        onBlur={() => setText(formatDuration(value))}
        className="h-11 sm:h-9"
      />
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            aria-pressed={minutes === value}
            onClick={() => onChange(minutes)}
            className={cn(
              "h-8 rounded-full border px-3 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              minutes === value
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:bg-muted",
            )}
          >
            {formatDuration(minutes)}
          </button>
        ))}
      </div>
    </div>
  );
}
