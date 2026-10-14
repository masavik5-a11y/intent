import { AppIcon } from "@/components/AppIcon";
import { cn } from "@/lib/utils";

/** Below this height a block is a coloured bar; its title shows on hover or tap. */
const BAR_ONLY_PX = 20;
const TIME_LINE_PX = 40;
const FOCUS_LINE_PX = 58;

interface BlockCardProps {
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
  /** The block runs now: solid fill (DESIGN.md section 4). */
  current: boolean;
  /** Its detail is open. */
  selected: boolean;
  /** Cut at the grid's top or bottom edge because it crosses into another day's grid. */
  cutTop: boolean;
  cutBottom: boolean;
  onOpen?: () => void;
}

/** A block in the plan lane: category colour, icon, title, time, focus if there is room. */
export function BlockCard({
  title,
  focus,
  icon,
  colorKey,
  time,
  name,
  top,
  height,
  current,
  selected,
  cutTop,
  cutBottom,
  onOpen,
}: BlockCardProps) {
  // One pixel of air above and below, so blocks that touch stay two blocks.
  const boxTop = top + 1;
  const boxHeight = Math.max(height - 2, 2);
  return (
    <button
      type="button"
      data-color={colorKey}
      aria-label={name}
      title={height < BAR_ONLY_PX ? `${title} · ${time}` : undefined}
      onClick={onOpen}
      style={{ top: boxTop, height: boxHeight }}
      className={cn(
        "absolute inset-x-1 overflow-hidden rounded-block px-2 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
        current ? "bg-key-solid text-on-solid" : "bg-key-tint text-key-ink",
        selected &&
          "ring-2 ring-foreground ring-offset-1 ring-offset-background",
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
              current
                ? "animate-pulse motion-reduce:animate-none"
                : "text-key-solid",
            )}
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              {title}
              {height < TIME_LINE_PX && (
                <span className="font-normal opacity-80"> · {time}</span>
              )}
            </span>
            {height >= TIME_LINE_PX && (
              <span className="truncate text-xs opacity-80">{time}</span>
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
