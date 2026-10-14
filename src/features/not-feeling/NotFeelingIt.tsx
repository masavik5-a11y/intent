import { useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import { SidePanel } from "@/components/SidePanel";
import { Button } from "@/components/ui/button";
import { api, type Doc, type PlannedBlockDoc } from "@/lib/api";
import { cn } from "@/lib/utils";
import { notFeelingView, type NotFeelingView } from "./notFeelingView";

interface NotFeelingActions {
  wide: boolean;
  /** Go ahead with the block: closes the view, nothing is recorded. */
  onStart: () => void;
  /** Skip, recorded like any skip; its optional reason is asked afterwards. */
  onSkipOnPurpose: () => void;
  /** PRD V3: keep the block, do the small version; finishing it counts as Partly. */
  onStartMinimum: () => void;
  onClose: () => void;
}

/**
 * "Not feeling it" (PRD V2, DESIGN.md section 4b) for a block you do not want to do.
 * The compass is read here and only here, so the anti-vision never reaches the Today
 * screen unless this is opened (PRD V4).
 */
export function NotFeelingIt({
  block,
  activity,
  ...actions
}: NotFeelingActions & {
  block: PlannedBlockDoc;
  activity: Doc<"activities"> | undefined;
}) {
  const compass = useQuery(api.compass.get);
  return (
    <NotFeelingPanel
      view={notFeelingView(block, activity, compass ?? null)}
      loading={compass === undefined}
      {...actions}
    />
  );
}

/** One calm column, read top to bottom, then the choice. */
export function NotFeelingPanel({
  view,
  loading,
  wide,
  onStart,
  onSkipOnPurpose,
  onStartMinimum,
  onClose,
}: NotFeelingActions & {
  view: NotFeelingView;
  /** The compass is still loading: nothing yet, so the column does not jump. */
  loading: boolean;
}) {
  return (
    <SidePanel
      wide={wide}
      title={view.title}
      subtitle={view.time}
      onCancel={onClose}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pt-2 pb-6 sm:px-5">
        {!loading && (
          <>
            {view.sections.map((section) => (
              <section key={section.key} className="flex flex-col gap-1">
                <h3 className="text-sm text-muted-foreground">
                  {section.heading}
                </h3>
                <p
                  className={cn(
                    "whitespace-pre-line",
                    section.voice ? "font-voice text-lg" : "text-base",
                  )}
                >
                  {section.text}
                </p>
                {section.key === "minimumVersion" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-1 h-11 self-start sm:h-9"
                    onClick={onStartMinimum}
                  >
                    Start the minimum
                  </Button>
                )}
              </section>
            ))}
            {view.compassEmpty && (
              <p className="text-sm text-muted-foreground">
                <Link
                  to="/compass"
                  className="rounded-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Write your compass
                </Link>
                , and it will be here on days like this.
              </p>
            )}
          </>
        )}
      </div>
      {/* Equal weight: skipping on purpose is a real choice, not a lesser button. */}
      <div className="flex flex-wrap gap-2 border-t px-4 py-3 sm:px-5">
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 sm:h-9"
          onClick={onStart}
        >
          Start
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 sm:h-9"
          onClick={onStartMinimum}
        >
          Start the minimum
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 sm:h-9"
          onClick={onSkipOnPurpose}
        >
          Skip on purpose
        </Button>
      </div>
    </SidePanel>
  );
}
