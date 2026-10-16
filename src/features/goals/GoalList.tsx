import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DateKey } from "@shared/time";
import { Button } from "@/components/ui/button";
import type { Doc, Id } from "@/lib/api";
import { cn } from "@/lib/utils";
import { dueText, investedText, sortGoals } from "./goalsView";

type GoalStatus = Doc<"goals">["status"];

/**
 * The goals on the Compass screen (PRD U6; DESIGN.md section 7): title, why, due date,
 * days left and hours invested, the soonest first. Done and dropped ones sit below,
 * folded, each with Reopen.
 */
export function GoalList({
  goals,
  invested,
  today,
  onEdit,
  onStatus,
}: {
  goals: readonly Doc<"goals">[];
  invested: ReadonlyMap<Id<"goals">, { minutes: number; capped: boolean }>;
  today: DateKey;
  onEdit: (goal: Doc<"goals">) => void;
  onStatus: (goal: Doc<"goals">, status: GoalStatus) => void;
}) {
  const [showClosed, setShowClosed] = useState(false);
  const { active, closed } = sortGoals(goals);
  return (
    <div className="flex flex-col gap-3">
      {active.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No goals yet. A goal with a date gives its activities a finish line.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {active.map((goal) => (
          <li
            key={goal._id}
            className="flex flex-col gap-1 rounded-block border px-4 py-3"
          >
            <h3 className="font-medium">{goal.title}</h3>
            {goal.why !== undefined && (
              <p className="font-voice text-lg whitespace-pre-line">
                {goal.why}
              </p>
            )}
            <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
              {dueText(goal, today) !== null && (
                <span>{dueText(goal, today)}</span>
              )}
              {investedText(invested.get(goal._id)) !== null && (
                <span>{investedText(invested.get(goal._id))}</span>
              )}
            </p>
            <div className="-ml-2 flex flex-wrap gap-1">
              <QuietButton onClick={() => onEdit(goal)}>Edit</QuietButton>
              <QuietButton onClick={() => onStatus(goal, "done")}>
                Mark done
              </QuietButton>
              <QuietButton onClick={() => onStatus(goal, "dropped")}>
                Drop
              </QuietButton>
            </div>
          </li>
        ))}
      </ul>
      {closed.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={showClosed}
            onClick={() => setShowClosed((open) => !open)}
            className="flex min-h-11 items-center gap-1 self-start rounded-sm text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-8"
          >
            Done and dropped ({closed.length})
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 transition-transform",
                showClosed && "rotate-180",
              )}
            />
          </button>
          {showClosed && (
            <ul className="flex flex-col gap-1">
              {closed.map((goal) => (
                <li
                  key={goal._id}
                  className="flex items-center gap-3 text-sm text-muted-foreground"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {goal.title} · {goal.status === "done" ? "Done" : "Dropped"}
                  </span>
                  <QuietButton onClick={() => onStatus(goal, "active")}>
                    Reopen
                  </QuietButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function QuietButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-11 min-w-11 px-2 text-muted-foreground sm:h-8 sm:min-w-0"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
