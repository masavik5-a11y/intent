import { AppIcon } from "@/components/AppIcon";
import type { Doc, Id } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Category chips in their colours, one of them chosen. Archived categories are left
 * out, except the one already chosen.
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: readonly Doc<"categories">[];
  value: Id<"categories"> | null;
  onChange: (category: Doc<"categories">) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Category</legend>
      <div role="radiogroup" className="flex flex-wrap gap-1.5">
        {categories
          .filter((item) => !item.archived || item._id === value)
          .map((item) => (
            <button
              key={item._id}
              type="button"
              role="radio"
              aria-checked={item._id === value}
              data-color={item.colorKey}
              onClick={() => onChange(item)}
              className={cn(
                "flex h-11 items-center gap-1.5 rounded-full border-2 bg-key-tint px-3 text-sm text-key-ink outline-none transition-colors sm:h-9 focus-visible:ring-3 focus-visible:ring-ring/50",
                item._id === value ? "border-key-solid" : "border-transparent",
              )}
            >
              <AppIcon name={item.icon} className="size-4" />
              {item.name}
            </button>
          ))}
      </div>
    </fieldset>
  );
}
