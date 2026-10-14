// Categories: a colour, an icon and a kind (docs/PRD.md, section 4; docs/DESIGN.md,
// section 5).

import type { IconName } from "./icons";

/**
 * What time in a category counts as. Time on purpose is actual time in `intentional`
 * categories, drift is actual time in `drift` ones, `maintenance` is neither.
 */
export const CATEGORY_KINDS = ["intentional", "maintenance", "drift"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/**
 * The colour keys defined in src/styles/theme.css. A category stores one; an element
 * takes it with `data-color={colorKey}`.
 */
export const COLOR_KEYS = [
  "violet",
  "teal",
  "coral",
  "pink",
  "amber",
  "gray",
  "slate",
  "red",
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export function isColorKey(value: string): value is ColorKey {
  return COLOR_KEYS.some((key) => key === value);
}

export interface CategoryDefaults {
  name: string;
  kind: CategoryKind;
  colorKey: ColorKey;
  icon: IconName;
}

/** Seeded for every user on the first signed-in visit, in this order. All editable. */
export const DEFAULT_CATEGORIES: readonly CategoryDefaults[] = [
  { name: "Deep work", kind: "intentional", colorKey: "violet", icon: "brain" },
  { name: "Body", kind: "intentional", colorKey: "teal", icon: "dumbbell" },
  { name: "Mind", kind: "intentional", colorKey: "coral", icon: "flower-2" },
  {
    name: "Rest on purpose",
    kind: "intentional",
    colorKey: "pink",
    icon: "coffee",
  },
  {
    name: "Events",
    kind: "intentional",
    colorKey: "amber",
    icon: "party-popper",
  },
  { name: "Life", kind: "maintenance", colorKey: "gray", icon: "house" },
  { name: "Sleep", kind: "maintenance", colorKey: "slate", icon: "moon" },
  { name: "Drift", kind: "drift", colorKey: "red", icon: "cloud" },
];

/**
 * Pressure (the countdown and the ten-minutes-left warning) starts on for deep work
 * and off for everything else, sleep, meditation and rest included (PRD section 4).
 * It is a default for new activities; each can be switched either way.
 */
export function pressureByDefault(
  category: { name: string } | undefined,
): boolean {
  return category?.name.trim().toLowerCase() === "deep work";
}
