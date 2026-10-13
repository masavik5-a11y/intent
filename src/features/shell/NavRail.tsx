import { Link, useLocation } from "@tanstack/react-router";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RAIL_FOOTER_ITEM, RAIL_ITEMS, type NavItem } from "./navItems";

/** Desktop and tablet navigation: a 56 px rail of icons with tooltips. */
export function NavRail({ className }: { className?: string }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <nav
      aria-label="Main"
      className={cn(
        "w-14 shrink-0 flex-col items-center gap-1 border-r py-3",
        className,
      )}
    >
      {RAIL_ITEMS.map((item) => (
        <RailLink
          key={item.label}
          item={item}
          active={item.matches(pathname)}
        />
      ))}
      <div className="flex-1" />
      <RailLink
        item={RAIL_FOOTER_ITEM}
        active={RAIL_FOOTER_ITEM.matches(pathname)}
      />
    </nav>
  );
}

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to={item.to}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex size-10 items-center justify-center rounded-block outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          />
        }
      >
        <Icon className="size-5" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
