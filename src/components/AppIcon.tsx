import { createElement } from "react";
import { iconFor } from "@/lib/icons";

/** A category's or activity's icon, by its stored name. Decorative unless labelled. */
export function AppIcon({
  name,
  className,
}: {
  name: string | undefined;
  className?: string;
}) {
  return createElement(iconFor(name), { className, "aria-hidden": true });
}
