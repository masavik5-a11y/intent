import { useState } from "react";
import { Timer } from "lucide-react";
import { formatDuration } from "@shared/time";
import { AppIcon } from "@/components/AppIcon";
import { Button } from "@/components/ui/button";
import type { Doc, Id } from "@/lib/api";
import type { CategoryGroup } from "./activityDraft";

interface ActivityListProps {
  groups: readonly CategoryGroup[];
  archived: readonly Doc<"activities">[];
  onOpen: (activityId: Id<"activities">) => void;
  onRestore: (activityId: Id<"activities">) => void;
}

/** The library, grouped by category (DESIGN.md section 7, "Activities"). */
export function ActivityList({
  groups,
  archived,
  onOpen,
  onRestore,
}: ActivityListProps) {
  const [showArchived, setShowArchived] = useState(false);
  return (
    <div className="flex flex-col gap-8">
      {groups.map(({ category, activities }) => (
        <section
          key={category._id}
          data-color={category.colorKey}
          className="flex flex-col gap-2"
        >
          <h2 className="flex items-center gap-2 text-base font-medium">
            <AppIcon name={category.icon} className="size-4 text-key-solid" />
            {category.name}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {activities.map((activity) => (
              <li key={activity._id}>
                <ActivityCard
                  activity={activity}
                  categoryIcon={category.icon}
                  onOpen={() => onOpen(activity._id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <Button
            variant="ghost"
            className="h-11 self-start sm:h-9"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((current) => !current)}
          >
            Archived ({archived.length})
          </Button>
          {showArchived && (
            <ul className="flex flex-col gap-1">
              {archived.map((activity) => (
                <li
                  key={activity._id}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-block px-3 text-muted-foreground"
                >
                  <span className="truncate">{activity.name}</span>
                  <Button
                    variant="outline"
                    className="h-11 sm:h-8"
                    onClick={() => onRestore(activity._id)}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ActivityCard({
  activity,
  categoryIcon,
  onOpen,
}: {
  activity: Doc<"activities">;
  categoryIcon: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-16 w-full items-start gap-3 rounded-block bg-key-tint p-3 text-left text-key-ink outline-none transition-[filter] hover:brightness-[0.97] focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:brightness-110"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-key-solid text-on-solid">
        <AppIcon name={activity.icon ?? categoryIcon} className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{activity.name}</span>
        <span className="flex items-center gap-1.5 text-sm">
          {formatDuration(activity.defaultDurationMin)}
          {activity.pressure && (
            <>
              <span aria-hidden="true">·</span>
              <Timer className="size-3.5" aria-hidden="true" />
              Countdown
            </>
          )}
        </span>
        {activity.why !== undefined && (
          <span className="mt-1 line-clamp-2 font-voice text-base">
            {activity.why}
          </span>
        )}
      </span>
    </button>
  );
}
