// The icons a category or an activity can carry. Names are lucide's (lucide.dev), so the
// UI maps each to its component; the list is short so the bundle stays small and the
// picker stays scannable. Add a name here and in the UI's map together.

export const ICON_NAMES = [
  // The default categories (docs/DESIGN.md, section 5).
  "brain",
  "dumbbell",
  "flower-2",
  "coffee",
  "party-popper",
  "house",
  "moon",
  "cloud",
  // Work
  "pen-line",
  "video",
  "clapperboard",
  "camera",
  "mic",
  "scissors",
  "code",
  "lightbulb",
  "briefcase",
  "mail",
  "target",
  "palette",
  // Body and mind
  "footprints",
  "bike",
  "heart",
  "droplets",
  "leaf",
  "trees",
  "book-open",
  "graduation-cap",
  "languages",
  "music",
  // Life
  "utensils",
  "shopping-cart",
  "wallet",
  "car",
  "plane",
  "users",
  "sun",
  "sunrise",
  "bed",
  "sparkles",
  // Drift
  "smartphone",
  "tv",
  "gamepad-2",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export function isIconName(value: string): value is IconName {
  return ICON_NAMES.some((name) => name === value);
}
