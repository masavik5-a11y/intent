import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A small rounded choice, 44 px tall on the phone. Pressed when it is the one chosen. */
export function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-11 rounded-full border px-3 text-sm outline-none transition-colors sm:h-8 focus-visible:ring-3 focus-visible:ring-ring/50",
        pressed === true
          ? "border-foreground bg-foreground text-background"
          : "border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
