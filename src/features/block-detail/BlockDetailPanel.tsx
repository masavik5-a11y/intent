import { useEffect, useRef, type ComponentProps } from "react";
import { XIcon } from "lucide-react";
import { formatTimeRange } from "@shared/time";
import { Button } from "@/components/ui/button";
import { SheetCloseButton } from "@/components/SheetCloseButton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BlockDetail } from "./BlockDetail";

type BlockDetailPanelProps = ComponentProps<typeof BlockDetail> & {
  /** From 1024 px the panel sits beside the grid; narrower, it is a sheet. */
  wide: boolean;
};

/**
 * Where block detail lives (DESIGN.md section 2): the side panel on desktop, a sheet
 * on tablet and phone. Esc closes it in both.
 */
export function BlockDetailPanel({ wide, ...detail }: BlockDetailPanelProps) {
  const { block, onCancel } = detail;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const range = formatTimeRange(
    block.plannedStartMin,
    block.plannedDurationMin,
  );
  // Remount the form when another block is chosen, so it starts from that block.
  const form = <BlockDetail key={block._id} {...detail} />;

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
              {block.title}
            </h2>
            <p className="text-sm text-muted-foreground">{range}</p>
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
            {block.title}
          </SheetTitle>
          <SheetDescription>{range}</SheetDescription>
        </SheetHeader>
        {form}
        <SheetCloseButton />
      </SheetContent>
    </Sheet>
  );
}
