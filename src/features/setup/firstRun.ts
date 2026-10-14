import { pressureByDefault } from "@shared/categories";
import type { Doc, Id } from "@/lib/api";

// First-run setup (DESIGN.md section 10): the pure parts, tested without rendering.

/** One of the three starter activities, as typed. Blank text means none. */
export interface StarterActivity {
  name: string;
  categoryId: Id<"categories"> | null;
  why: string;
  costOfSkipping: string;
}

/** How long a starter activity's blocks are until you change it. */
export const STARTER_DURATION_MIN = 60;

/** Three empty cards, one in each of the first three categories. */
export function starterActivities(
  categories: readonly Doc<"categories">[],
): StarterActivity[] {
  const usable = categories.filter((category) => !category.archived);
  return [0, 1, 2].map((index) => ({
    name: "",
    categoryId: usable[index]?._id ?? usable[0]?._id ?? null,
    why: "",
    costOfSkipping: "",
  }));
}

/** Arguments for activities.create for every card with a name; empty cards are skipped. */
export function starterCreateArgs(
  starters: readonly StarterActivity[],
  categories: readonly Doc<"categories">[],
) {
  return starters.flatMap((starter) => {
    const category = categories.find((item) => item._id === starter.categoryId);
    if (starter.name.trim() === "" || category === undefined) return [];
    return [
      {
        name: starter.name,
        categoryId: category._id,
        defaultDurationMin: STARTER_DURATION_MIN,
        notify: true,
        pressure: pressureByDefault(category),
        ...(starter.why.trim() === "" ? {} : { why: starter.why }),
        ...(starter.costOfSkipping.trim() === ""
          ? {}
          : { costOfSkipping: starter.costOfSkipping }),
      },
    ];
  });
}
