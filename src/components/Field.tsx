import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/**
 * A labelled form control with an optional hint under it. The hint's id is
 * `${id}-hint`, for the control's aria-describedby.
 */
export function Field({
  id,
  label,
  hint,
  aside,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  /** Something small at the end of the label row, such as a reset link. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      {children}
      {hint !== undefined && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
