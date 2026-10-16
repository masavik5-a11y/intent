import type { ReactNode } from "react";
import { SheetCloseButton } from "@/components/SheetCloseButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * A small form over the screen: a dialog on desktop, a bottom sheet on the phone
 * (DESIGN.md section 2). The body mounts only while it is open, so it starts fresh.
 */
export function AdaptiveDialog({
  open,
  isPhone,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  isPhone: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
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
            {description !== undefined && (
              <SheetDescription>{description}</SheetDescription>
            )}
          </SheetHeader>
          <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {open && children}
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
          {description !== undefined && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        {open && children}
      </DialogContent>
    </Dialog>
  );
}
