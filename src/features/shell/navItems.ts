import type { LinkProps } from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  ChartColumn,
  Compass,
  LayoutList,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  icon: LucideIcon;
  /** Whether this item is the current view for a pathname. */
  matches: (pathname: string) => boolean;
}

function at(path: string) {
  return (pathname: string) =>
    pathname === path || pathname.startsWith(`${path}/`);
}

// "/" redirects to today's date at the moment it is followed, so the Today item is
// never stale after midnight. Any /day/… address is the day view.
const today: NavItem = {
  label: "Today",
  to: "/",
  icon: Sun,
  matches: at("/day"),
};
const week: NavItem = {
  label: "Week",
  to: "/week",
  icon: CalendarRange,
  matches: at("/week"),
};
const month: NavItem = {
  label: "Month",
  to: "/month",
  icon: CalendarDays,
  matches: at("/month"),
};
const insights: NavItem = {
  label: "Insights",
  to: "/insights",
  icon: ChartColumn,
  matches: at("/insights"),
};
const activities: NavItem = {
  label: "Activities",
  to: "/activities",
  icon: LayoutList,
  matches: at("/activities"),
};
const compass: NavItem = {
  label: "Compass",
  to: "/compass",
  icon: Compass,
  matches: at("/compass"),
};
const settings: NavItem = {
  label: "Settings",
  to: "/settings",
  icon: Settings,
  matches: at("/settings"),
};

/** Desktop nav rail, top to bottom (docs/DESIGN.md, section 2). Settings sits apart at the bottom. */
export const RAIL_ITEMS: readonly NavItem[] = [
  today,
  week,
  month,
  insights,
  activities,
  compass,
];
export const RAIL_FOOTER_ITEM: NavItem = settings;

/** Phone bottom bar. Quick add (+) joins it in M1. */
export const BAR_ITEMS: readonly NavItem[] = [today, week, insights];

/** Everything the bottom bar has no room for, behind its More button. */
export const MORE_ITEMS: readonly NavItem[] = [
  month,
  activities,
  compass,
  settings,
];
