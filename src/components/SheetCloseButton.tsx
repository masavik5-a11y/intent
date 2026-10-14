import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";

/**
 * A sheet's close button with a 44 px target on the phone (DESIGN.md section 2). Use
 * it with `showCloseButton={false}` on SheetContent; the generated one is 28 px.
 */
export function SheetCloseButton() {
  return (
    <SheetClose
      render={
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 size-11 sm:size-8"
        />
      }
    >
      <XIcon aria-hidden="true" />
      <span className="sr-only">Close</span>
    </SheetClose>
  );
}
