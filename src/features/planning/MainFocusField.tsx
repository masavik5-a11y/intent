import { useEffect, useId, useRef, useState } from "react";
import { MAX_FOCUS_LENGTH } from "@shared/text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Saving starts this long after the last keystroke, or at once on leaving the field. */
const SAVE_AFTER_MS = 1000;

type SaveState = "idle" | "saving" | "saved" | "failed";

/**
 * The day's main focus (PRD P5), one line that saves by itself: a second after typing
 * stops and on leaving the field, like the compass. Enter saves too.
 */
export function MainFocusField({
  prompt,
  saved,
  onSave,
}: {
  /** "What makes tomorrow a win?" */
  prompt: string;
  /** The focus as the server has it. */
  saved: string;
  onSave: (text: string) => Promise<void>;
}) {
  const id = useId();
  const [text, setText] = useState(saved);
  const [base, setBase] = useState(saved);
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<string | null>(null);

  // A change from another device replaces the text, unless you have edited it here.
  if (saved !== base) {
    setBase(saved);
    if (text === base) setText(saved);
  }

  async function flush() {
    clearTimeout(timer.current);
    const value = pending.current;
    if (value === null) return;
    pending.current = null;
    setState("saving");
    try {
      await onSave(value);
      setState("saved");
    } catch {
      // Kept as pending, so leaving the field tries again.
      pending.current = value;
      setState("failed");
    }
  }

  function handleChange(value: string) {
    setText(value);
    pending.current = value;
    setState("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
  }

  // Leaving the screen saves what is still waiting.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current !== null) void onSave(pending.current);
    },
    [onSave],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>Main focus</Label>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {state === "saving" && "Saving…"}
          {state === "saved" && "Saved"}
          {state === "failed" &&
            "Not saved yet. It tries again when you leave the field."}
        </p>
      </div>
      <Input
        id={id}
        value={text}
        maxLength={MAX_FOCUS_LENGTH}
        autoComplete="off"
        placeholder={prompt}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => void flush()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void flush();
          }
        }}
        className="h-11 sm:h-9"
      />
    </div>
  );
}
