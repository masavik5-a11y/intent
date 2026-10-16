import {
  CircleCheck,
  Contrast,
  Plus,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { cn } from "@/lib/utils";
import type { CardState } from "./dayView";

/** Below this height a block is a coloured bar; its title shows on hover or tap. */
const BAR_ONLY_PX = 20;
const TIME_LINE_PX = 40;
const FOCUS_LINE_PX = 58;

interface BlockCardProps {
  /** Its block's id, read by the arrow-key selection (DESIGN.md section 8). */
  blockKey: string;
  lane: "plan" | "actual";
  title: string;
  focus: string | undefined;
  icon: string | undefined;
  colorKey: string;
  /** "09:00–11:00", or "until 07:00" for the tail of last night's block. */
  time: string;
  /** What a screen reader says for it. */
  name: string;
  /** Pixel box inside the lane. */
  top: number;
  height: number;
  /** How it looks: DESIGN.md section 4. */
  state: CardState;
  /** It has a note; the note itself is in its name and in block detail. */
  hasNote: boolean;
  /** Its detail is open. */
  selected: boolean;
  /** It is being dragged: lifted above the others. */
  lifted?: boolean;
  /** It has just come into the actual lane: it slides in once. */
  entering?: boolean;
  onEntered?: () => void;
  /** Cut at the grid's top or bottom edge because it crosses into another day's grid. */
  cutTop: boolean;
  cutBottom: boolean;
  onOpen?: () => void;
}

/** The small mark after the title that says what became of a block, besides colour. */
const STATE_MARKS: Partial<Record<CardState, LucideIcon>> = {
  done: CircleCheck,
  partial: Contrast,
  unplanned: Plus,
};

/**
 * A block in either lane: category colour, icon, title, time, focus if there is room.
 * Solid while it runs, outlined and struck through when skipped, a little muted when
 * done (DESIGN.md section 4). Every state has a mark or a word, never colour alone.
 */
export function BlockCard({
  blockKey,
  lane,
  title,
  focus,
  icon,
  colorKey,
  time,
  name,
  top,
  height,
  state,
  hasNote,
  selected,
  lifted = false,
  entering = false,
  onEntered,
  cutTop,
  cutBottom,
  onOpen,
}: BlockCardProps) {
  // One pixel of air above and below, so blocks that touch stay two blocks.
  const boxTop = top + 1;
  const boxHeight = Math.max(height - 2, 2);
  // A check-off settles in (DESIGN.md section 6): only when the state changes while
  // the card is on screen, never when the day opens.
  const [shownState, setShownState] = useState(state);
  const [settling, setSettling] = useState(false);
  if (state !== shownState) {
    setShownState(state);
    setSettling(state === "done" || state === "partial");
  }
  const solid = state === "current" || state === "live";
  const skipped = state === "skipped";
  const Mark = STATE_MARKS[state];
  return (
    <button
      type="button"
      data-color={colorKey}
      data-block-key={blockKey}
      data-lane={lane}
      aria-label={name}
      title={height < BAR_ONLY_PX ? `${title} · ${time}` : undefined}
      onClick={onOpen}
      style={{ top: boxTop, height: boxHeight }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onEntered?.();
      }}
      className={cn(
        "absolute inset-x-1 overflow-hidden rounded-block px-2 text-left outline-none transition-[background-color,color,border-color,opacity] duration-200 focus-visible:ring-3 focus-visible:ring-ring/50",
        solid
          ? "bg-key-solid text-on-solid"
          : skipped
            ? "border border-dashed border-key-solid/70 bg-transparent text-key-ink"
            : state === "done"
              ? // Muted by a lighter fill, not faded text, so the text keeps AA.
                "bg-key-tint/60 text-key-ink"
              : "bg-key-tint text-key-ink",
        selected &&
          "ring-2 ring-foreground ring-offset-1 ring-offset-background",
        lifted && "cursor-grabbing shadow-lg ring-2 ring-key-solid",
        entering && "animate-enter-lane",
        cutTop && "rounded-t-none",
        cutBottom && "rounded-b-none",
      )}
    >
      {height >= BAR_ONLY_PX && (
        <span className="flex h-full items-start gap-1.5 py-0.5">
          <AppIcon
            name={icon}
            className={cn(
              "mt-0.5 size-3.5 shrink-0",
              state === "current"
                ? "animate-pulse motion-reduce:animate-none"
                : solid
                  ? ""
                  : "text-key-solid",
            )}
          />
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
              <span className={cn("truncate", skipped && "line-through")}>
                {title}
              </span>
              {Mark !== undefined && (
                <Mark
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 shrink-0 text-key-solid",
                    settling && "animate-settle",
                  )}
                  onAnimationEnd={() => setSettling(false)}
                />
              )}
              {hasNote && (
                <StickyNote
                  aria-hidden="true"
                  className="size-3.5 shrink-0 opacity-70"
                />
              )}
              {height < TIME_LINE_PX && (
                <span
                  className={cn("truncate font-normal", !solid && "opacity-80")}
                >
                  · {time}
                </span>
              )}
            </span>
            {height >= TIME_LINE_PX && (
              <span className={cn("truncate text-xs", !solid && "opacity-80")}>
                {time}
              </span>
            )}
            {height >= FOCUS_LINE_PX && focus !== undefined && (
              <span className="truncate text-xs">{focus}</span>
            )}
          </span>
        </span>
      )}
    </button>
  );
}
