import { useEffect, useRef, type ReactNode } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetCloseButton } from "./SheetCloseButton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
interface SidePanelProps {
  /** From 1024 px the panel sits beside the grid; narrower, it is a sheet. */
  wide: boolean;
  title: string;
  /** Under the title: the planned time, or for an entry what was logged. */
  subtitle: string;
  onCancel: () => void;
  /** What the panel holds: block detail, entry detail, "Not feeling it". */
  children: ReactNode;
}

/**
 * The side panel (DESIGN.md section 2): 340 px beside the grid on desktop, where it
 * takes the now panel's place; a full sheet on tablet and phone. Esc closes it in both.
 * Block detail and "Not feeling it" open in it.
 */
export function SidePanel({
  wide,
  title,
  subtitle,
  onCancel,
  children: form,
}: SidePanelProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  // The sheet handles Esc itself; the side panel needs it here.
  useEffect(() => {
    if (!wide) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.querySelector("[role=dialog]")) {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [wide, onCancel]);

  if (wide) {
    return (
      <aside
        aria-labelledby="side-panel-title"
        className="flex w-[340px] shrink-0 animate-panel flex-col border-l"
      >
        <header className="flex items-start gap-2 px-4 pt-3 pb-2 sm:px-5">
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id="side-panel-title" className="truncate text-lg font-medium">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={onCancel}
          >
            <XIcon />
          </Button>
        </header>
        {form}
      </aside>
    );
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        // Looking at a block should not pop up the phone's keyboard.
        initialFocus={titleRef}
        showCloseButton={false}
      >
        <SheetHeader className="px-4 pt-4 sm:px-5">
          <SheetTitle
            ref={titleRef}
            tabIndex={-1}
            className="text-xl outline-none"
          >
            {title}
          </SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>
        {form}
        <SheetCloseButton />
      </SheetContent>
    </Sheet>
  );
}
