import type { ComponentProps } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SheetCloseButton } from "@/components/SheetCloseButton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LogEntryForm } from "./LogEntryForm";

type LogEntryProps = ComponentProps<typeof LogEntryForm> & {
  open: boolean;
  isPhone: boolean;
  onClose: () => void;
};

const TITLE = "Log what happened";
const DESCRIPTION =
  "Time that went somewhere without a plan: drift, or something good.";

/** Logging an unplanned entry: a bottom sheet on the phone, a dialog elsewhere. */
export function LogEntry({ open, isPhone, onClose, ...form }: LogEntryProps) {
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
            <SheetTitle className="text-lg">{TITLE}</SheetTitle>
            <SheetDescription>{DESCRIPTION}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {open && <LogEntryForm {...form} />}
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
          <DialogTitle className="text-lg">{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {open && <LogEntryForm {...form} />}
      </DialogContent>
    </Dialog>
  );
}
