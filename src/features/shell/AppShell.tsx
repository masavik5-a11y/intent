import type { ReactNode } from "react";
import { BottomBar } from "./BottomBar";
import { NavRail } from "./NavRail";

/**
 * The frame around every signed-in screen (docs/DESIGN.md, section 2): a nav rail from
 * 640 px up, a bottom bar below that.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col sm:flex-row">
      <NavRail className="hidden sm:flex" />
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
      <BottomBar className="flex sm:hidden" />
    </div>
  );
}
