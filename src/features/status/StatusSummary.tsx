import { SKIP_REASONS, type StatusAction } from "@shared/blocks";
import { Button } from "@/components/ui/button";
import type { Doc } from "@/lib/api";
import { Chip } from "./Chip";
import { SKIP_REASON_LABELS, statusLine } from "./statusLabels";

/**
 * What became of a marked block, with Undo (PRD A4). A skipped block also asks why,
 * optionally: tapping a reason records it, tapping it again takes it back.
 */
export function StatusSummary({
  block,
  onAction,
}: {
  block: Doc<"blocks">;
  onAction: (action: StatusAction) => void;
}) {
  const unplanned = block.plannedStartMin === undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm" aria-live="polite">
          {statusLine(block)}
        </p>
        {block.status !== "planned" && !unplanned && (
          <Button
            type="button"
            variant="ghost"
            className="h-11 sm:h-8"
            onClick={() => onAction({ type: "undo" })}
          >
            Undo
          </Button>
        )}
      </div>
      {block.status === "skipped" && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">Why? (optional)</p>
          <div className="flex flex-wrap gap-1.5">
            {SKIP_REASONS.map((reason) => (
              <Chip
                key={reason}
                pressed={block.skipReason === reason}
                onClick={() =>
                  onAction({
                    type: "skip",
                    reason: block.skipReason === reason ? undefined : reason,
                  })
                }
              >
                {SKIP_REASON_LABELS[reason]}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
