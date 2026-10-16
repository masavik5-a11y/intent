import { useId, useState, type FormEvent } from "react";
import { MAX_INTENT_LENGTH, MAX_TITLE_LENGTH } from "@shared/text";
import { Field } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { goalDraftProblem, type GoalDraft } from "./goalsView";

/** The goal form: what, why, and an optional date. Enter in the name saves. */
export function GoalForm({
  initial,
  isNew,
  onSave,
}: {
  initial: GoalDraft;
  isNew: boolean;
  /** Resolves to an error message, or null when saved. */
  onSave: (draft: GoalDraft) => Promise<string | null>;
}) {
  const id = useId();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof GoalDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = goalDraftProblem(draft);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setSaving(true);
    const failure = await onSave(draft);
    setSaving(false);
    setError(failure);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <Field id={`${id}-title`} label="Goal">
        <Input
          id={`${id}-title`}
          value={draft.title}
          maxLength={MAX_TITLE_LENGTH}
          autoComplete="off"
          placeholder="Launch the course"
          onChange={(event) => set("title", event.target.value)}
          className="h-11 sm:h-9"
        />
      </Field>
      <Field id={`${id}-why`} label="Why this matters to me">
        <Textarea
          id={`${id}-why`}
          value={draft.why}
          maxLength={MAX_INTENT_LENGTH}
          rows={2}
          onChange={(event) => set("why", event.target.value)}
          className="min-h-20 font-voice text-lg md:text-lg"
        />
      </Field>
      <Field
        id={`${id}-due`}
        label="Due"
        hint="Optional. Its activities' blocks show the days left."
      >
        <input
          id={`${id}-due`}
          type="date"
          value={draft.dueDate}
          aria-describedby={`${id}-due-hint`}
          onChange={(event) => set("dueDate", event.target.value)}
          className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9 md:text-sm dark:bg-input/30"
        />
      </Field>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={saving} className="h-11 sm:h-9">
        {isNew ? "Add goal" : "Save"}
      </Button>
    </form>
  );
}
