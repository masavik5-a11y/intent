import { useEffect, useRef, type ReactNode } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetCloseButton } from "@/components/SheetCloseButton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
interface BlockDetailPanelProps {
  /** From 1024 px the panel sits beside the grid; narrower, it is a sheet. */
  wide: boolean;
  title: string;
  /** Under the title: the planned time, or for an entry what was logged. */
  subtitle: string;
  onCancel: () => void;
  /** The form: block detail, or entry detail for an unplanned entry. */
  children: ReactNode;
}

/**
 * Where block detail lives (DESIGN.md section 2): the side panel on desktop, a sheet
 * on tablet and phone. Esc closes it in both.
 */
export function BlockDetailPanel({
  wide,
  title,
  subtitle,
  onCancel,
  children: form,
}: BlockDetailPanelProps) {
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
        aria-labelledby="block-detail-title"
        className="flex w-[340px] shrink-0 flex-col border-l"
      >
        <header className="flex items-start gap-2 px-4 pt-3 pb-2 sm:px-5">
          <div className="flex min-w-0 flex-1 flex-col">
            <h2
              id="block-detail-title"
              className="truncate text-lg font-medium"
            >
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
