import { useId, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { DEFAULT_SETTINGS } from "@shared/settings";
import { MAX_INTENT_LENGTH, MAX_TITLE_LENGTH } from "@shared/text";
import { CategoryPicker } from "@/components/CategoryPicker";
import { Field } from "@/components/Field";
import { TimeInput } from "@/components/TimeInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, type Doc } from "@/lib/api";
import { saveErrorMessage } from "@/lib/errorMessages";
import { COST_OF_SKIPPING_HINT, INTENT_PROMPTS } from "@/lib/intentPrompts";
import {
  starterActivities,
  starterCreateArgs,
  type StarterActivity,
} from "./firstRun";

type Step = "hours" | "activities" | "compass";
const STEPS: readonly Step[] = ["hours", "activities", "compass"];

/**
 * First-run setup (DESIGN.md section 10): waking hours, the first three activities
 * with their why, then an invitation to write the compass. Every step can be skipped.
 */
export function FirstRunScreen() {
  const settings = useQuery(api.settings.get);
  const categories = useQuery(api.categories.list);
  const [step, setStep] = useState<Step>("hours");
  const navigate = useNavigate();
  const complete = useMutation(api.setup.complete);

  async function finish(to: "/compass" | "/") {
    await complete({});
    await navigate({ to, replace: true });
  }

  if (settings === undefined || categories === undefined) return null;
  const number = STEPS.indexOf(step) + 1;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          Welcome · step {number} of {STEPS.length}
        </p>
      </header>
      {step === "hours" && (
        <HoursStep
          wakeMin={settings?.wakeMin ?? DEFAULT_SETTINGS.wakeMin}
          sleepMin={settings?.sleepMin ?? DEFAULT_SETTINGS.sleepMin}
          onDone={() => setStep("activities")}
        />
      )}
      {step === "activities" && (
        <ActivitiesStep
          categories={categories}
          onDone={() => setStep("compass")}
        />
      )}
      {step === "compass" && (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-medium">
            One more thing, when you are ready
          </h1>
          <p className="text-base">
            The Compass holds two texts in your own words: the life you are
            building, and the life you refuse to drift into. You see them only
            when you open them, or when you press “Not feeling it”.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-11 sm:h-9"
              onClick={() => void finish("/compass")}
            >
              Write my compass
            </Button>
            <Button
              variant="outline"
              className="h-11 sm:h-9"
              onClick={() => void finish("/")}
            >
              Later
            </Button>
          </div>
        </section>
      )}
      {step !== "compass" && (
        <button
          type="button"
          onClick={() => void finish("/")}
          className="min-h-11 self-start rounded-sm text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Skip setup and go to today
        </button>
      )}
    </div>
  );
}

function StepFooter({
  error,
  busy,
  primary,
  onSkip,
}: {
  error: string | null;
  busy: boolean;
  primary: string;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="h-11 sm:h-9">
          {primary}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 sm:h-9"
          onClick={onSkip}
        >
          Skip this step
        </Button>
      </div>
    </div>
  );
}

function HoursStep({
  wakeMin,
  sleepMin,
  onDone,
}: {
  wakeMin: number;
  sleepMin: number;
  onDone: () => void;
}) {
  const ids = useId();
  const [wake, setWake] = useState(wakeMin);
  const [sleep, setSleep] = useState(sleepMin);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = useMutation(api.settings.setWakeAndSleep);

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        save({ wakeMin: wake, sleepMin: sleep })
          .then(onDone)
          .catch((failure: unknown) => setError(saveErrorMessage(failure)))
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium">
          When does your day usually run?
        </h1>
        <p className="text-muted-foreground">
          The day grid fits these hours on the screen. You can plan outside them
          too.
        </p>
      </div>
      <div className="flex gap-6">
        <Field id={`${ids}-wake`} label="Up at">
          <TimeInput
            id={`${ids}-wake`}
            value={wake}
            onChange={setWake}
            className="h-11 w-24 sm:h-9"
          />
        </Field>
        <Field id={`${ids}-sleep`} label="Asleep by">
          <TimeInput
            id={`${ids}-sleep`}
            value={sleep}
            onChange={setSleep}
            className="h-11 w-24 sm:h-9"
          />
        </Field>
      </div>
      <StepFooter
        error={error}
        busy={busy}
        primary="Continue"
        onSkip={onDone}
      />
    </form>
  );
}

function ActivitiesStep({
  categories,
  onDone,
}: {
  categories: readonly Doc<"categories">[];
  onDone: () => void;
}) {
  const [starters, setStarters] = useState(() => starterActivities(categories));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = useMutation(api.activities.create);

  function change(index: number, patch: Partial<StarterActivity>) {
    setStarters((current) =>
      current.map((starter, at) =>
        at === index ? { ...starter, ...patch } : starter,
      ),
    );
  }

  async function submit() {
    setBusy(true);
    try {
      for (const args of starterCreateArgs(starters, categories)) {
        await create(args);
      }
      onDone();
    } catch (failure) {
      setError(saveErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium">
          Three things you want to make time for
        </h1>
        <p className="text-muted-foreground">
          Write the why once; every block of it carries it. Fill in one, two or
          three. You can add more, and the how and the rest, on the Activities
          screen.
        </p>
      </div>
      {starters.map((starter, index) => (
        <StarterCard
          key={index}
          number={index + 1}
          starter={starter}
          categories={categories}
          onChange={(patch) => change(index, patch)}
        />
      ))}
      <StepFooter
        error={error}
        busy={busy}
        primary="Save and continue"
        onSkip={onDone}
      />
    </form>
  );
}

function StarterCard({
  number,
  starter,
  categories,
  onChange,
}: {
  number: number;
  starter: StarterActivity;
  categories: readonly Doc<"categories">[];
  onChange: (patch: Partial<StarterActivity>) => void;
}) {
  const ids = useId();
  return (
    <Card title={`Activity ${number}`}>
      <Field id={`${ids}-name`} label="What">
        <Input
          id={`${ids}-name`}
          value={starter.name}
          maxLength={MAX_TITLE_LENGTH}
          autoComplete="off"
          placeholder={["Script the reel", "Gym", "Meditation"][number - 1]}
          onChange={(event) => onChange({ name: event.target.value })}
          className="h-11 sm:h-9"
        />
      </Field>
      <CategoryPicker
        categories={categories}
        value={starter.categoryId}
        onChange={(category) => onChange({ categoryId: category._id })}
      />
      <Field id={`${ids}-why`} label={INTENT_PROMPTS.why}>
        <Textarea
          id={`${ids}-why`}
          value={starter.why}
          maxLength={MAX_INTENT_LENGTH}
          rows={2}
          onChange={(event) => onChange({ why: event.target.value })}
          className="min-h-16 font-voice text-lg md:text-lg"
        />
      </Field>
      <Field
        id={`${ids}-cost`}
        label={INTENT_PROMPTS.costOfSkipping}
        hint={COST_OF_SKIPPING_HINT}
      >
        <Textarea
          id={`${ids}-cost`}
          value={starter.costOfSkipping}
          maxLength={MAX_INTENT_LENGTH}
          rows={2}
          aria-describedby={`${ids}-cost-hint`}
          onChange={(event) => onChange({ costOfSkipping: event.target.value })}
          className="min-h-16"
        />
      </Field>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-panel border p-4">
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}
