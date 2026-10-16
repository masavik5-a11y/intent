import { useEffect, useId, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { MAX_TITLE_LENGTH } from "@shared/text";
import { AdaptiveDialog } from "@/components/AdaptiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { closeCapture, openCapture, useCaptureOpen } from "@/lib/capture";
import { saveErrorMessage } from "@/lib/errorMessages";
import { useIsPhone } from "@/lib/useMediaQuery";
import { shortcutsPaused } from "@/features/shortcuts/shortcuts";
import { captureArgs } from "./inboxView";

/**
 * Capture something for later, from anywhere (PRD P8): I on any screen, or "Capture
 * for later" in the phone's More sheet. Enter puts it in the inbox and the field is
 * ready for the next one. Mounted once, in the app shell.
 */
export function CaptureDialog() {
  const open = useCaptureOpen();
  const isPhone = useIsPhone();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || shortcutsPaused(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() !== "i") return;
      event.preventDefault();
      openCapture();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <AdaptiveDialog
      open={open}
      isPhone={isPhone}
      onClose={closeCapture}
      title="Capture for later"
      description="It waits in the inbox until you give it a day."
    >
      <CaptureForm />
    </AdaptiveDialog>
  );
}

function CaptureForm() {
  const id = useId();
  const activities = useQuery(api.activities.list);
  const capture = useMutation(api.inbox.capture);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text.trim() === "") return;
    try {
      await capture(captureArgs(text, activities ?? []));
      setMessage(`"${text.trim()}" is in the inbox.`);
      setText("");
    } catch (failure) {
      setMessage(saveErrorMessage(failure));
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => void submit(event)}
    >
      <label htmlFor={id} className="sr-only">
        What is it?
      </label>
      <Input
        id={id}
        value={text}
        autoFocus
        autoComplete="off"
        maxLength={MAX_TITLE_LENGTH}
        placeholder="Call the venue, film B-roll, a wedding…"
        onChange={(event) => {
          setText(event.target.value);
          setMessage(null);
        }}
        className="h-11 sm:h-9"
      />
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {message}
      </p>
      <Button
        type="submit"
        className="h-11 sm:h-9"
        disabled={text.trim() === ""}
      >
        Capture
      </Button>
    </form>
  );
}
