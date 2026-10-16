import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { AdaptiveDialog } from "@/components/AdaptiveDialog";
import { Button } from "@/components/ui/button";
import { api, type Doc, type Id } from "@/lib/api";
import { saveErrorMessage } from "@/lib/errorMessages";
import { useIsPhone } from "@/lib/useMediaQuery";
import { useToday } from "@/lib/useToday";
import { GoalForm } from "./GoalForm";
import { GoalList } from "./GoalList";
import {
  goalCreateArgs,
  goalDraftOf,
  goalUpdateArgs,
  type GoalDraft,
} from "./goalsView";

/** Goals on the Compass screen (PRD U6): the list and its form. */
export function GoalsSection() {
  const goals = useQuery(api.goals.list);
  const invested = useQuery(api.goals.invested);
  const today = useToday();
  const create = useMutation(api.goals.create);
  const update = useMutation(api.goals.update);
  const setStatus = useMutation(api.goals.setStatus);
  const isPhone = useIsPhone();
  // null: a new goal; a goal: editing it; undefined: the form is closed.
  const [editing, setEditing] = useState<Doc<"goals"> | null | undefined>();
  const [error, setError] = useState<string | null>(null);

  async function save(draft: GoalDraft): Promise<string | null> {
    if (today === undefined || editing === undefined) return null;
    try {
      if (editing === null) await create(goalCreateArgs(draft, today));
      else await update(goalUpdateArgs(editing, draft));
      setEditing(undefined);
      return null;
    } catch (failure) {
      return saveErrorMessage(failure);
    }
  }

  const investedById = new Map<
    Id<"goals">,
    { minutes: number; capped: boolean }
  >((invested ?? []).map((item) => [item.goalId, item]));

  return (
    <section aria-labelledby="goals-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="goals-heading" className="text-lg font-medium">
          Goals
        </h2>
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:h-9"
          onClick={() => setEditing(null)}
        >
          <Plus aria-hidden="true" />
          Add goal
        </Button>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {goals !== undefined && today !== undefined && (
        <GoalList
          goals={goals}
          invested={investedById}
          today={today}
          onEdit={setEditing}
          onStatus={(goal, status) => {
            setError(null);
            setStatus({ goalId: goal._id, status }).catch((failure: unknown) =>
              setError(saveErrorMessage(failure)),
            );
          }}
        />
      )}
      <AdaptiveDialog
        open={editing !== undefined}
        isPhone={isPhone}
        onClose={() => setEditing(undefined)}
        title={editing === null ? "New goal" : "Edit goal"}
      >
        <GoalForm
          initial={goalDraftOf(editing ?? null)}
          isNew={editing === null}
          onSave={save}
        />
      </AdaptiveDialog>
    </section>
  );
}
