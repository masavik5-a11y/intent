import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Ellipsis } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { BAR_ITEMS, MORE_ITEMS, type NavItem } from "./navItems";

const ITEM_CLASS =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs outline-none transition-colors focus-visible:bg-accent";

function itemTone(active: boolean): string {
  return active ? "text-foreground" : "text-muted-foreground";
}

/** Phone navigation: a bottom bar, with the less used screens behind More. */
export function BottomBar({ className }: { className?: string }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_ITEMS.some((item) => item.matches(pathname));

  return (
    <nav
      aria-label="Main"
      className={cn(
        "shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      {BAR_ITEMS.map((item) => (
        <BarLink key={item.label} item={item} active={item.matches(pathname)} />
      ))}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger className={cn(ITEM_CLASS, itemTone(moreActive))}>
          <Ellipsis className="size-5" aria-hidden="true" />
          More
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-panel">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
            <SheetDescription className="sr-only">
              Other screens
            </SheetDescription>
          </SheetHeader>
          <ul className="flex flex-col px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.matches(pathname);
              return (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-block px-3 text-base outline-none focus-visible:bg-accent",
                      active && "bg-accent",
                    )}
                  >
                    <Icon
                      className="size-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

function BarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(ITEM_CLASS, itemTone(active))}
    >
      <Icon className="size-5" aria-hidden="true" />
      {item.label}
    </Link>
  );
}
