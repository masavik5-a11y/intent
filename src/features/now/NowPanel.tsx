import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import { cn } from "@/lib/utils";
import {
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
 * finish line, its why and how, a draining bar for countdown blocks, and what comes
 * next. `compact` is the phone's card: the first lines, and the rest behind "More".
 */
export function NowPanel({
  view,
  compact,
}: {
  view: NowView;
  compact: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const showAll = !compact || expanded;
  const { current, next } = view;

  return (
    <section
      aria-label="Now"
      data-color={current?.category?.colorKey}
      className={cn(
        "flex flex-col gap-4",
        compact ? "px-4 py-3" : "p-4 sm:p-5",
      )}
    >
      {current === null ? (
        <FreeTime next={next[0]} />
      ) : (
        <CurrentBlock current={current} showAll={showAll} />
      )}

      {showAll && next.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs text-muted-foreground">Up next</h3>
          <ul className="flex flex-col gap-1">
            {next.map((item) => (
              <UpNextItem key={item.block._id} item={item} />
            ))}
          </ul>
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
}: {
  current: NowCurrent;
  showAll: boolean;
}) {
  const { block, intent, countdown, pressure } = current;
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
    </div>
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
