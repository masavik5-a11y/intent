import { useState } from "react";
import { snapMinutes } from "@shared/grid";
import {
  isValidMinute,
  MINUTE_STEP,
  MINUTES_PER_DAY,
  minutesToLabel,
  parseClockInput,
} from "@shared/time";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** The minute typed text stands for, snapped to 5 minutes, or null. */
function readTime(text: string): number | null {
  const parsed = parseClockInput(text);
  if (parsed === null) return null;
  const snapped = snapMinutes(parsed, MINUTE_STEP) % MINUTES_PER_DAY;
  return isValidMinute(snapped) ? snapped : null;
}

/**
 * A clock time, always 24-hour (the browser's own time field follows its locale and
 * may show AM and PM). Takes "930", "9:30" or "21"; shows "09:30" once you leave it.
 * Text that is not a time reverts on blur.
 */
export function TimeInput({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: number;
  onChange: (minute: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(() => minutesToLabel(value));
  const [shown, setShown] = useState(value);
  // A new value from outside replaces the text.
  if (value !== shown) {
    setShown(value);
    setText(minutesToLabel(value));
  }

  return (
    <Input
      id={id}
      value={text}
      inputMode="numeric"
      autoComplete="off"
      placeholder="09:30"
      maxLength={5}
      aria-invalid={readTime(text) === null}
      onChange={(event) => {
        setText(event.target.value);
        const minute = readTime(event.target.value);
        if (minute !== null) {
          setShown(minute);
          onChange(minute);
        }
      }}
      onBlur={() => setText(minutesToLabel(value))}
      className={cn("tabular-nums", className)}
    />
  );
}
