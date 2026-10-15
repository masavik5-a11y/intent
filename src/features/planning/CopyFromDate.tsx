import { useId } from "react";
import { formatDayLabel, parseDateKey, type DateKey } from "@shared/time";
import { SheetCloseButton } from "@/components/SheetCloseButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Chip } from "@/features/status/Chip";

interface CopyFromDateProps {
  open: boolean;
  isPhone: boolean;
  onClose: () => void;
  /** The day being planned. */
  to: DateKey;
  /** The day chosen to copy from, or null before one is. */
  from: DateKey | null;
  onChoose: (from: DateKey) => void;
  /** Offered at once: today, last week's same day (copySources). */
  sources: readonly { label: string; date: DateKey }[];
  /** What a copy would bring, once the day is loaded (copyPreview). */
  preview: string | null;
  /** Whether there is anything to copy from the chosen day. */
  canCopy: boolean;
  busy: boolean;
  error: string | null;
  onCopy: () => void;
}

/**
 * "Copy from a date" (PRD P2): another day's plan as a starting point. Pick a day, see
 * what would come, copy. A dialog on desktop, a bottom sheet on the phone.
 */
export function CopyFromDate({
  open,
  isPhone,
  onClose,
  ...body
}: CopyFromDateProps) {
  const title = "Copy from a date";
  const description = `Another day's plan as a start for ${formatDayLabel(body.to)}.`;
  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };
  if (isPhone) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-panel"
          showCloseButton={false}
        >
          <SheetHeader className="px-4 pt-4">
            <SheetTitle className="text-lg">{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {open && <CopyForm {...body} />}
          </div>
          <SheetCloseButton />
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-panel sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open && <CopyForm {...body} />}
      </DialogContent>
    </Dialog>
  );
}

function CopyForm({
  from,
  onChoose,
  sources,
  preview,
  canCopy,
  busy,
  error,
  onCopy,
}: Omit<CopyFromDateProps, "open" | "isPhone" | "onClose" | "to">) {
  const id = useId();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <Chip
            key={source.date}
            pressed={from === source.date}
            onClick={() => onChoose(source.date)}
          >
            {source.label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>Another date</Label>
        <input
          id={id}
          type="date"
          value={from ?? ""}
          onChange={(event) => {
            const picked = parseDateKey(event.target.value);
            if (picked !== null) onChoose(picked);
          }}
          className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9 md:text-sm dark:bg-input/30"
        />
      </div>
      {preview !== null && (
        <p className="text-sm text-muted-foreground">{preview}</p>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        disabled={!canCopy || busy}
        className="h-11 sm:h-9"
        onClick={onCopy}
      >
        Copy the plan
      </Button>
    </div>
  );
}
