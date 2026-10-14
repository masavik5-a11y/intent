import { useEffect, useId, useRef, useState } from "react";
import { MAX_COMPASS_LENGTH } from "@shared/text";
import { Textarea } from "@/components/ui/textarea";

/** Saving starts this long after the last keystroke, or at once on leaving the field. */
const SAVE_AFTER_MS = 1000;

type SaveState = "idle" | "saving" | "saved" | "failed";

interface CompassTextProps {
  title: string;
  prompts: readonly string[];
  /** The text as the server has it. */
  saved: string;
  onSave: (text: string) => Promise<void>;
}

/**
 * One of the two compass texts, edited in place and saved by itself. While it is
 * empty, its writing prompts show above it.
 */
export function CompassText({
  title,
  prompts,
  saved,
  onSave,
}: CompassTextProps) {
  const headingId = useId();
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
    <section className="flex flex-col gap-3">
      <h2 id={headingId} className="font-voice text-xl">
        {title}
      </h2>
      {text.trim() === "" && (
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {prompts.map((prompt) => (
            <li key={prompt}>{prompt}</li>
          ))}
        </ul>
      )}
      <Textarea
        aria-labelledby={headingId}
        value={text}
        maxLength={MAX_COMPASS_LENGTH}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => void flush()}
        className="min-h-64 font-voice text-lg leading-relaxed md:text-lg"
      />
      <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {state === "saving" && "Saving…"}
        {state === "saved" && "Saved"}
        {state === "failed" &&
          "Not saved yet. Check the connection; it tries again when you leave the field."}
      </p>
    </section>
  );
}
