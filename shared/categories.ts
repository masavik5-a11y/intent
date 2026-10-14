// Categories: a colour, an icon and a kind (docs/PRD.md, section 4; docs/DESIGN.md,
// section 5).

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
