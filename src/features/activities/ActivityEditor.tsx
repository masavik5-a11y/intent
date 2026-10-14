import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { IntentField } from "@shared/blocks";
import { ICON_NAMES, type IconName } from "@shared/icons";
import { MAX_INTENT_LENGTH, MAX_TITLE_LENGTH } from "@shared/text";
import { AppIcon } from "@/components/AppIcon";
import { DurationInput } from "@/components/DurationInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Doc } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  draftProblem,
  pressureByDefault,
  type ActivityDraft,
} from "./activityDraft";

/** The prompts from PRD section 4, "Intent fields". */
const INTENT_PROMPTS: Record<IntentField, string> = {
  why: "Why this matters to me",
  how: "How I do it",
  doneWhen: "A block of it is done when…",
  ifThen: "If I don't feel like it, then…",
  minimumVersion: "The smallest version that still counts",
  costOfSkipping: "If I keep skipping this, in a year…",
};

interface ActivityEditorProps {
  initial: ActivityDraft;
  categories: readonly Doc<"categories">[];
  isNew: boolean;
  /** Resolves to an error message, or null when saved. */
  onSave: (draft: ActivityDraft) => Promise<string | null>;
  onCancel: () => void;
  onArchive?: () => void;
}

/** The activity form (PRD I1): name, category, icon, length, intent, switches. */
export function ActivityEditor({
  initial,
  categories,
  isNew,
  onSave,
  onCancel,
  onArchive,
}: ActivityEditorProps) {
  const ids = useId();
  const [draft, setDraft] = useState(initial);
  const [pressureTouched, setPressureTouched] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ActivityDraft>(key: K, value: ActivityDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function chooseCategory(category: Doc<"categories">) {
    setDraft((current) => ({
      ...current,
      categoryId: category._id,
      // Until the switch is touched, a new activity follows its category's default.
      pressure: pressureTouched
        ? current.pressure
        : pressureByDefault(category),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = draftProblem(draft);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setSaving(true);
    const failure = await onSave(draft);
    setSaving(false);
    setError(failure);
  }

  const category = categories.find((item) => item._id === draft.categoryId);
  const choosable = categories.filter(
    (item) => !item.archived || item._id === draft.categoryId,
  );

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6 sm:px-6">
        <Field id={`${ids}-name`} label="Name">
          <Input
            id={`${ids}-name`}
            value={draft.name}
            maxLength={MAX_TITLE_LENGTH}
            autoFocus={isNew}
            autoComplete="off"
            placeholder="Gym, Script the reel, Meditation…"
            onChange={(event) => set("name", event.target.value)}
            className="h-11 sm:h-9"
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Category</legend>
          <div role="radiogroup" className="flex flex-wrap gap-1.5">
            {choosable.map((item) => (
              <button
                key={item._id}
                type="button"
                role="radio"
                aria-checked={item._id === draft.categoryId}
                data-color={item.colorKey}
                onClick={() => chooseCategory(item)}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full border-2 bg-key-tint px-3 text-sm text-key-ink outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  item._id === draft.categoryId
                    ? "border-key-solid"
                    : "border-transparent",
                )}
              >
                <AppIcon name={item.icon} className="size-4" />
                {item.name}
              </button>
            ))}
          </div>
        </fieldset>

        <IconPicker
          value={draft.icon}
          fallback={category?.icon}
          colorKey={category?.colorKey}
          onChange={(icon) => set("icon", icon)}
        />

        <Field
          id={`${ids}-duration`}
          label="Usual length"
          hint="What a new block of it starts with."
        >
          <DurationInput
            id={`${ids}-duration`}
            describedBy={`${ids}-duration-hint`}
            value={draft.defaultDurationMin}
            onChange={(minutes) => set("defaultDurationMin", minutes)}
          />
        </Field>

        <Group title="Intent">
          <IntentArea
            id={`${ids}-why`}
            field="why"
            value={draft.why}
            voice
            onChange={(text) => set("why", text)}
          />
          <IntentArea
            id={`${ids}-how`}
            field="how"
            value={draft.how}
            onChange={(text) => set("how", text)}
          />
          <IntentArea
            id={`${ids}-done-when`}
            field="doneWhen"
            value={draft.doneWhen}
            hint="Optional. Usually written per block while planning."
            onChange={(text) => set("doneWhen", text)}
          />
        </Group>

        <Group title="For hard days">
          <IntentArea
            id={`${ids}-if-then`}
            field="ifThen"
            value={draft.ifThen}
            onChange={(text) => set("ifThen", text)}
          />
          <IntentArea
            id={`${ids}-minimum`}
            field="minimumVersion"
            value={draft.minimumVersion}
            onChange={(text) => set("minimumVersion", text)}
          />
          <IntentArea
            id={`${ids}-cost`}
            field="costOfSkipping"
            value={draft.costOfSkipping}
            hint="Shown only when you press “Not feeling it”, never in a notification."
            onChange={(text) => set("costOfSkipping", text)}
          />
        </Group>

        <div className="flex flex-col gap-4">
          <SwitchRow
            label="Countdown"
            description="A bar that drains while a block runs, and later a warning ten minutes before the end."
            checked={draft.pressure}
            onChange={(checked) => {
              setPressureTouched(true);
              set("pressure", checked);
            }}
          />
          <SwitchRow
            label="Notify when it starts"
            description="With its why. Takes effect once notifications arrive (M4)."
            checked={draft.notify}
            onChange={(checked) => set("notify", checked)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:px-6">
        {error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          {onArchive !== undefined && (
            <Button
              type="button"
              variant="ghost"
              className="h-11 sm:h-9"
              onClick={onArchive}
            >
              Archive
            </Button>
          )}
          <div className="flex-1" />
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-9"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="h-11 sm:h-9">
            {isNew ? "Create" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint !== undefined && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-medium">{title}</h3>
      {children}
    </section>
  );
}

function IntentArea({
  id,
  field,
  value,
  hint,
  voice = false,
  onChange,
}: {
  id: string;
  field: IntentField;
  value: string;
  hint?: string;
  /** Set in the serif voice: the why reads like your own words. */
  voice?: boolean;
  onChange: (text: string) => void;
}) {
  return (
    <Field id={id} label={INTENT_PROMPTS[field]} hint={hint}>
      <Textarea
        id={id}
        value={value}
        maxLength={MAX_INTENT_LENGTH}
        rows={2}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
        className={cn("min-h-20", voice && "font-voice text-lg md:text-lg")}
      />
    </Field>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </span>
      <Switch
        checked={checked}
        onCheckedChange={(next) => onChange(next)}
        className="mt-0.5"
      />
    </label>
  );
}

function IconPicker({
  value,
  fallback,
  colorKey,
  onChange,
}: {
  value: IconName | null;
  fallback: string | undefined;
  colorKey: string | undefined;
  onChange: (icon: IconName | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const optionClass =
    "flex size-11 items-center justify-center rounded-block border-2 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 sm:size-9";
  return (
    <fieldset className="flex flex-col gap-2" data-color={colorKey}>
      <legend className="mb-2 text-sm font-medium">Icon</legend>
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-key-solid text-on-solid">
          <AppIcon name={value ?? fallback} className="size-4" />
        </span>
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:h-9"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Done" : "Change icon"}
        </Button>
      </div>
      {open && (
        <div
          role="radiogroup"
          aria-label="Icon"
          className="flex flex-wrap gap-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={value === null}
            aria-label="The category's icon"
            onClick={() => onChange(null)}
            className={cn(
              optionClass,
              "w-auto px-3 text-sm sm:w-auto",
              value === null ? "border-key-solid" : "border-transparent",
            )}
          >
            Category's
          </button>
          {ICON_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={value === name}
              aria-label={name.replace(/-\d+$/, "").replace(/-/g, " ")}
              onClick={() => onChange(name)}
              className={cn(
                optionClass,
                value === name
                  ? "border-key-solid bg-key-tint text-key-ink"
                  : "border-transparent hover:bg-muted",
              )}
            >
              <AppIcon name={name} className="size-5" />
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
