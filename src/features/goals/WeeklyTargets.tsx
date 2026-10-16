import { useId, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AppIcon } from "@/components/AppIcon";
import { Input } from "@/components/ui/input";
import { api, type Doc } from "@/lib/api";
import { saveErrorMessage } from "@/lib/errorMessages";
import {
  parseWeeklyTarget,
  targetCategories,
  weeklyTargetText,
} from "./goalsView";

/**
 * Hours a week per category (PRD U5), on the Compass screen. Each saves on leaving
 * the field or on Enter; empty clears it. Pace is measured against these.
 */
export function WeeklyTargets() {
  const categories = useQuery(api.categories.list);
  const setTarget = useMutation(api.categories.setWeeklyTarget);
  if (categories === undefined) return null;
  return (
    <section aria-labelledby="targets-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="targets-heading" className="text-lg font-medium">
          Weekly targets
        </h2>
        <p className="text-sm text-muted-foreground">
          Hours a week you intend for each category. The now panel and the week
          show the pace.
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {targetCategories(categories).map((category) => (
          <TargetRow
            key={category._id}
            category={category}
            onSave={(minutes) =>
              setTarget({ categoryId: category._id, minutes }).then(() => null)
            }
          />
        ))}
      </ul>
    </section>
  );
}

function TargetRow({
  category,
  onSave,
}: {
  category: Doc<"categories">;
  onSave: (minutes: number | null) => Promise<null>;
}) {
  const id = useId();
  const saved = weeklyTargetText(category.weeklyTargetMin);
  const [text, setText] = useState(saved);
  const [base, setBase] = useState(saved);
  const [message, setMessage] = useState<string | null>(null);

  // A change from another device replaces the text unless it is being edited here.
  if (saved !== base) {
    setBase(saved);
    if (text === base) setText(saved);
  }

  function commit() {
    if (text === saved) return;
    const minutes = parseWeeklyTarget(text);
    if (minutes === undefined) {
      setMessage("Use hours, such as 15 or 7.5, up to 168.");
      return;
    }
    setMessage(null);
    onSave(minutes).then(
      () => setMessage("Saved"),
      (failure: unknown) => setMessage(saveErrorMessage(failure)),
    );
  }

  return (
    <li
      data-color={category.colorKey}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1"
    >
      <AppIcon
        name={category.icon}
        className="size-4 shrink-0 text-key-solid"
      />
      <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm">
        {category.name}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder="—"
          aria-describedby={`${id}-unit`}
          onChange={(event) => {
            setText(event.target.value);
            setMessage(null);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
          className="h-11 w-20 text-right tabular-nums sm:h-9"
        />
        <span id={`${id}-unit`} className="text-sm text-muted-foreground">
          h a week
        </span>
      </div>
      {message !== null && (
        <p aria-live="polite" className="w-full text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </li>
  );
}
