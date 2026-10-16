import { useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetCloseButton } from "@/components/SheetCloseButton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api, type Doc, type Id } from "@/lib/api";
import { saveErrorMessage } from "@/lib/errorMessages";
import {
  createArgs,
  draftOf,
  groupByCategory,
  newDraft,
  updateArgs,
  type ActivityDraft,
} from "./activityDraft";
import { ActivityEditor } from "./ActivityEditor";
import { ActivityList } from "./ActivityList";

/** What the editor shows: nothing, a new activity, or an existing one by id. */
export type ActivitySelection = "new" | Id<"activities"> | undefined;

interface ActivitiesScreenProps {
  selection: ActivitySelection;
  onSelect: (selection: ActivitySelection) => void;
}

/** The activity library (PRD I1). The open editor lives in the URL. */
export function ActivitiesScreen({
  selection,
  onSelect,
}: ActivitiesScreenProps) {
  const activities = useQuery(api.activities.list);
  const categories = useQuery(api.categories.list);
  const goals = useQuery(api.goals.list);
  const create = useMutation(api.activities.create);
  const update = useMutation(api.activities.update);
  const setArchived = useMutation(api.activities.setArchived);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const loaded =
    activities !== undefined && categories !== undefined && goals !== undefined;
  const editing =
    selection === undefined || selection === "new" || !loaded
      ? undefined
      : activities.find((activity) => activity._id === selection);
  const close = () => onSelect(undefined);

  async function save(
    draft: ActivityDraft,
    existing: Doc<"activities"> | undefined,
  ): Promise<string | null> {
    try {
      if (existing !== undefined) {
        await update(updateArgs(existing, draft));
      } else if (draft.categoryId !== null) {
        await create(createArgs(draft, draft.categoryId));
      }
      close();
      return null;
    } catch (error) {
      return saveErrorMessage(error);
    }
  }

  const sheetOpen = loaded && (selection === "new" || editing !== undefined);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-medium">Activities</h1>
          <p className="text-muted-foreground">
            Each one remembers its why, so planning a block takes a tap.
          </p>
        </div>
        <Button
          className="h-11 shrink-0 sm:h-9"
          onClick={() => onSelect("new")}
        >
          <Plus aria-hidden="true" />
          New activity
        </Button>
      </header>

      {loaded && (
        <>
          {!activities.some((activity) => !activity.archived) && (
            <p className="text-muted-foreground">
              Nothing here yet. Start with one thing you do every week.
            </p>
          )}
          <ActivityList
            groups={groupByCategory(activities, categories)}
            archived={activities.filter((activity) => activity.archived)}
            onOpen={onSelect}
            onRestore={(activityId) =>
              void setArchived({ activityId, archived: false })
            }
          />
        </>
      )}

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
          // Viewing an activity should not pop up the phone's keyboard: focus the
          // title. A new one focuses its name, which is typed next anyway.
          initialFocus={editing === undefined ? true : titleRef}
          showCloseButton={false}
        >
          <SheetHeader className="px-4 pt-4 sm:px-6">
            <SheetTitle
              ref={titleRef}
              tabIndex={-1}
              className="text-xl outline-none"
            >
              {editing === undefined ? "New activity" : editing.name}
            </SheetTitle>
            <SheetDescription>
              {editing === undefined
                ? "Write the why once; every block of it carries it."
                : "Changes reach every block that has not overridden them."}
            </SheetDescription>
          </SheetHeader>
          {loaded && sheetOpen && (
            <ActivityEditor
              key={editing?._id ?? "new"}
              initial={
                editing === undefined ? newDraft(categories) : draftOf(editing)
              }
              categories={categories}
              goals={goals}
              isNew={editing === undefined}
              onSave={(draft) => save(draft, editing)}
              onCancel={close}
              onArchive={
                editing === undefined
                  ? undefined
                  : () => {
                      void setArchived({
                        activityId: editing._id,
                        archived: true,
                      });
                      close();
                    }
              }
            />
          )}
          <SheetCloseButton />
        </SheetContent>
      </Sheet>
    </div>
  );
}
