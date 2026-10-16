import { useState, type ReactNode } from "react";
import { ChevronDown, Flag } from "lucide-react";
import type { StatusAction } from "@shared/blocks";
import { AppIcon } from "@/components/AppIcon";
import { Button } from "@/components/ui/button";
import type { Doc, Id } from "@/lib/api";
import { cn } from "@/lib/utils";
import { StatusActions } from "@/features/status/StatusActions";
import { StatusSummary } from "@/features/status/StatusSummary";
import { DayTotals } from "@/features/day/DayTotals";
import type { DayTotals as DayTotalsData } from "@shared/summary";
import {
  endedText,
  freeText,
  inLastTenMinutes,
  nextLine,
  statusText,
  type NowBlock,
  type NowCurrent,
  type NowView,
} from "./nowView";

/**
 * The now panel (DESIGN.md section 4a): the block the plan says is running, with its
 * finish line, its why and how, a draining bar for countdown blocks, Done, Partly and
 * Skip, and what comes next. Between blocks, the block that just ended waits there to
 * be marked. `compact` is the phone's card: the first lines and the actions, the rest
 * behind "More".
 */
export function NowPanel({
  view,
  compact,
  lastMarked,
  error,
  onAction,
  onLog,
  onNotFeeling,
  onReview,
  mainFocus,
  totals,
  pace,
}: {
  view: NowView;
  compact: boolean;
  /** The block marked last from here, shown with Undo until another is marked. */
  lastMarked: Doc<"blocks"> | undefined;
  /** Why the last mark did not save. */
  error: string | null;
  onAction: (blockId: Id<"blocks">, action: StatusAction) => void;
  /** Opens logging an unplanned entry, "from the last entry until now". */
  onLog: () => void;
  /** Opens "Not feeling it" for a block (PRD V2). */
  onNotFeeling: (blockId: Id<"blocks">) => void;
  /** Set in the evening while the day is not reviewed: offers the review (PRD R1). */
  onReview?: (() => void) | undefined;
  /** What makes today a win, written while planning it (PRD P5). */
  mainFocus?: string | undefined;
  /** The day's totals, shown in the full panel; the phone shows them above the grid. */
  totals: DayTotalsData | null;
  /**
   * The running block's category's weekly pace, a plain fact (PRD U5): "Deep work
   * 9h of 15h · 3 days left · behind by 1h 30m". Unset without a target.
   */
  pace?: string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const showAll = !compact || expanded;
  const { current, toMark, next } = view;

  return (
    <section
      aria-label="Now"
      data-color={current?.category?.colorKey}
      className={cn(
        "flex flex-col gap-4",
        compact ? "px-4 py-3" : "p-4 sm:p-5",
      )}
    >
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {lastMarked !== undefined && lastMarked.status !== "planned" && (
        <div className="flex flex-col gap-1 rounded-block bg-muted/60 px-3 py-2">
          <p className="truncate text-sm font-medium">{lastMarked.title}</p>
          <StatusSummary
            block={lastMarked}
            onAction={(action) => onAction(lastMarked._id, action)}
          />
        </div>
      )}

      {mainFocus !== undefined && (
        <div className="flex flex-col gap-0.5">
          <h2 className="text-xs text-muted-foreground">Today's focus</h2>
          <p
            className={cn(
              "font-voice text-lg",
              compact && !expanded && "line-clamp-2",
            )}
          >
            {mainFocus}
          </p>
        </div>
      )}

      {onReview !== undefined && (
        <div className="flex items-center gap-3 rounded-block bg-muted/60 px-3 py-2">
          <p className="flex-1 text-sm">
            Close the day: a short review, then tomorrow.
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 bg-background sm:h-9"
            onClick={onReview}
          >
            Review the day
          </Button>
        </div>
      )}

      {current === null ? (
        <>
          <FreeTime next={next[0]} />
          {toMark !== null && (
            <div
              data-color={toMark.category?.colorKey}
              className="flex flex-col gap-2"
            >
              <p className="flex items-center gap-2 text-sm">
                <AppIcon
                  name={toMark.activity?.icon ?? toMark.category?.icon}
                  className="size-4 shrink-0 text-key-solid"
                />
                {endedText(toMark)}
              </p>
              <StatusActions
                key={toMark.block._id}
                plannedDurationMin={toMark.block.plannedDurationMin}
                started
                onAction={(action) => onAction(toMark.block._id, action)}
              />
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-11 self-start sm:h-9"
            onClick={onLog}
          >
            Log what I'm doing
          </Button>
        </>
      ) : (
        <CurrentBlock
          current={current}
          showAll={showAll}
          onAction={(action) => onAction(current.block._id, action)}
          onNotFeeling={() => onNotFeeling(current.block._id)}
        />
      )}

      {!compact && totals !== null && (
        <DayTotals totals={totals} variant="panel" />
      )}

      {showAll && pace !== undefined && (
        <div className="flex flex-col gap-0.5">
          <h3 className="text-xs text-muted-foreground">This week</h3>
          <p className="text-sm">{pace}</p>
        </div>
      )}

      {showAll && next.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs text-muted-foreground">Up next</h3>
          <ul className="flex flex-col gap-1">
            {next.map((item) => (
              <UpNextItem key={item.block._id} item={item} />
            ))}
          </ul>
          {current === null && view.feelingTarget !== null && (
            <NotFeelingLink
              onClick={() => {
                if (view.feelingTarget !== null) {
                  onNotFeeling(view.feelingTarget.block._id);
                }
              }}
            />
          )}
        </div>
      )}

      {compact && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="flex min-h-11 items-center gap-1 self-start rounded-sm text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {expanded ? "Less" : "More"}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
      )}
    </section>
  );
}

function CurrentBlock({
  current,
  showAll,
  onAction,
  onNotFeeling,
}: {
  current: NowCurrent;
  showAll: boolean;
  onAction: (action: StatusAction) => void;
  onNotFeeling: () => void;
}) {
  const { block, intent, countdown, pressure, soFarMin, minimumChosen } =
    current;
  const strong = pressure && inLastTenMinutes(countdown);
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm">
        <span aria-hidden="true" className="size-2 rounded-full bg-key-solid" />
        <span className={cn(strong && "font-medium")}>
          {statusText(countdown)}
        </span>
      </p>
      {pressure && (
        // Drains from right to left over the block's planned time (PRD U2).
        <div
          role="progressbar"
          aria-label="Time left"
          aria-valuemin={0}
          aria-valuemax={block.plannedDurationMin}
          aria-valuenow={countdown.minutesLeft}
          className="h-2 overflow-hidden rounded-full bg-key-tint"
        >
          <div
            className="h-full rounded-full bg-key-solid transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${countdown.fractionLeft * 100}%` }}
          />
        </div>
      )}

      <h2 className="text-xl font-medium">
        {block.title}
        {block.focus !== undefined && (
          <span className="text-muted-foreground"> · {block.focus}</span>
        )}
      </h2>
      {minimumChosen && (
        // PRD V3: the small version, chosen on purpose. Done records it as Partly.
        <div className="flex items-start gap-2 rounded-block bg-muted/60 px-3 py-2">
          <p className="flex-1 text-sm">
            <span className="font-medium">Doing the minimum</span>
            {intent.minimumVersion !== null && ` · ${intent.minimumVersion}`}
          </p>
          <button
            type="button"
            onClick={() => onAction({ type: "undo" })}
            className="min-h-11 rounded-sm text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-0"
          >
            Back to the full block
          </button>
        </div>
      )}
      {intent.doneWhen !== null && (
        <p className="text-base">
          <span className="text-muted-foreground">Done when: </span>
          {intent.doneWhen}
        </p>
      )}
      {intent.why !== null && (
        <Labeled label="Why">
          <p
            className={cn(
              "font-voice text-lg whitespace-pre-line",
              !showAll && "line-clamp-2",
            )}
          >
            {intent.why}
          </p>
        </Labeled>
      )}
      {current.goal !== null && (
        // The goal and its days left, a quiet chip beside the why (PRD U6).
        <p className="flex items-center gap-1.5 self-start rounded-full bg-muted/60 px-3 py-1 text-sm">
          <Flag
            aria-hidden="true"
            className="size-3.5 shrink-0 text-key-solid"
          />
          <span className="sr-only">Goal: </span>
          {current.goal}
        </p>
      )}
      {showAll && intent.how !== null && (
        <Labeled label="How">{intent.how}</Labeled>
      )}
      {showAll && intent.ifThen !== null && (
        <Labeled label="If I don't feel like it">{intent.ifThen}</Labeled>
      )}
      {showAll && intent.minimumVersion !== null && (
        <Labeled label="The minimum that still counts">
          {intent.minimumVersion}
        </Labeled>
      )}
      <StatusActions
        key={block._id}
        plannedDurationMin={block.plannedDurationMin}
        started
        soFarMin={soFarMin}
        onAction={onAction}
      />
      <NotFeelingLink onClick={onNotFeeling} />
    </div>
  );
}

/** The quiet way in to "Not feeling it" (DESIGN.md section 4a, item 7). */
function NotFeelingLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center self-start rounded-sm text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-8"
    >
      Not feeling it
    </button>
  );
}

function FreeTime({ next }: { next: NowBlock | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-hidden="true" className="size-2 rounded-full border" />
        Now
      </p>
      <h2 className="text-xl font-medium">{freeText(next)}</h2>
    </div>
  );
}

function UpNextItem({ item }: { item: NowBlock }) {
  return (
    <li
      data-color={item.category?.colorKey}
      className="flex items-center gap-2 text-sm"
    >
      <AppIcon
        name={item.activity?.icon ?? item.category?.icon}
        className="size-4 shrink-0 text-key-solid"
      />
      <span className="truncate">{nextLine(item)}</span>
    </li>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="text-xs text-muted-foreground">{label}</h3>
      <div className="whitespace-pre-line">{children}</div>
    </div>
  );
}
