import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CalendarPlus, Inbox, Plus } from "lucide-react";
import { gridDayOf } from "@shared/grid";
import { DEFAULT_SETTINGS } from "@shared/settings";
import { formatDayLabel, parseDateKey, type DateKey } from "@shared/time";
import { AdaptiveDialog } from "@/components/AdaptiveDialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { openCapture } from "@/lib/capture";
import { saveErrorMessage } from "@/lib/errorMessages";
import { toLocalMoment, useNow } from "@/lib/now";
import { useIsPhone } from "@/lib/useMediaQuery";
import { QuickAdd } from "@/features/day/QuickAdd";
import { DEFAULT_DURATION_MIN } from "@/features/day/QuickAddForm";
import { suggestedStart } from "@/features/day/quickAddRules";
import { Chip } from "@/features/status/Chip";
import { capturedText, scheduleChoices } from "./inboxView";

/**
 * The inbox (PRD P8): what was captured without a date, oldest first. Each can be
 * scheduled onto a day, where it becomes a planned block, or let go.
 */
export function InboxScreen({
  scheduling,
  day,
  onSchedule,
  onChooseDay,
  onClose,
}: {
  /** The item being scheduled, from the URL. */
  scheduling: string | undefined;
  /** The day chosen for it. */
  day: DateKey | undefined;
  onSchedule: (itemId: string) => void;
  onChooseDay: (day: DateKey) => void;
  /** Closes the scheduling step, as the back gesture would. */
  onClose: () => void;
}) {
  const items = useQuery(api.inbox.list);
  const settings = useQuery(api.settings.get);
  const activities = useQuery(api.activities.list);
  const categories = useQuery(api.categories.list);
  const dayBlocks = useQuery(
    api.blocks.listForDay,
    day === undefined ? "skip" : { date: day },
  );
  const remove = useMutation(api.inbox.remove);
  const schedule = useMutation(api.inbox.schedule);
  const now = useNow();
  const isPhone = useIsPhone();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { gridStartMin, wakeMin } = settings ?? DEFAULT_SETTINGS;
  const today = gridDayOf(now, gridStartMin);
  const item = items?.find((candidate) => candidate._id === scheduling);

  const start = (durationMin: number) =>
    suggestedStart({
      day: day ?? today,
      gridStartMin,
      wakeMin,
      now,
      isToday: day === today,
      durationMin,
      blocks: dayBlocks ?? [],
    });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-medium">Inbox</h1>
          <p className="text-muted-foreground">
            Things without a day yet.
            <span className="hidden sm:inline">
              {" "}
              Press I anywhere to add one.
            </span>
          </p>
        </div>
        <Button className="h-11 shrink-0 sm:h-9" onClick={openCapture}>
          <Plus aria-hidden="true" />
          Capture
        </Button>
      </header>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {done !== null && (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {done}
        </p>
      )}
      {items !== undefined && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
          <Inbox aria-hidden="true" className="size-6" />
          <p>Nothing waiting. Capture something when it comes up.</p>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {items?.map((entry) => (
          <li
            key={entry._id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-block border px-4 py-3"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{entry.title}</span>
              {entry.note !== undefined && (
                <span className="text-sm text-muted-foreground">
                  {entry.note}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {capturedText(
                  toLocalMoment(new Date(entry._creationTime)).date,
                )}
              </span>
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                className="h-11 sm:h-9"
                onClick={() => onSchedule(entry._id)}
              >
                <CalendarPlus aria-hidden="true" />
                Schedule
              </Button>
              <Button
                variant="ghost"
                className="h-11 text-muted-foreground sm:h-9"
                onClick={() => {
                  setError(null);
                  remove({ itemId: entry._id }).catch((failure: unknown) =>
                    setError(saveErrorMessage(failure)),
                  );
                }}
              >
                Let go
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <AdaptiveDialog
        open={item !== undefined && day === undefined}
        isPhone={isPhone}
        onClose={onClose}
        title={item === undefined ? "Schedule" : `When: ${item.title}`}
        description="Pick the day; the time comes next."
      >
        <DayChoice today={today} onChoose={onChooseDay} />
      </AdaptiveDialog>
      {item !== undefined &&
        day !== undefined &&
        dayBlocks !== undefined &&
        activities !== undefined &&
        categories !== undefined && (
          <QuickAdd
            open
            isPhone={isPhone}
            onClose={onClose}
            title={`Schedule on ${formatDayLabel(day)}`}
            description="It becomes a planned block and leaves the inbox."
            day={day}
            gridStartMin={gridStartMin}
            start={start(DEFAULT_DURATION_MIN)}
            suggestStart={start}
            activities={activities}
            categories={categories}
            blocks={dayBlocks}
            initialTitle={item.title}
            initialActivityId={item.activityId}
            submitLabel="Schedule"
            onSave={async (args) => {
              try {
                await schedule({
                  itemId: item._id,
                  date: args.date,
                  plannedStartMin: args.plannedStartMin,
                  plannedDurationMin: args.plannedDurationMin,
                  ...(args.title === undefined ? {} : { title: args.title }),
                  ...(args.activityId === undefined
                    ? {}
                    : { activityId: args.activityId }),
                  ...(args.categoryId === undefined
                    ? {}
                    : { categoryId: args.categoryId }),
                });
                setDone(`${item.title} is on ${formatDayLabel(day)}.`);
                onClose();
                return null;
              } catch (failure) {
                return saveErrorMessage(failure);
              }
            }}
          />
        )}
    </div>
  );
}

function DayChoice({
  today,
  onChoose,
}: {
  today: DateKey;
  onChoose: (day: DateKey) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {scheduleChoices(today).map((choice) => (
          <Chip key={choice.date} onClick={() => onChoose(choice.date)}>
            {choice.label}
          </Chip>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Another day
        <input
          type="date"
          min={today}
          onChange={(event) => {
            const picked = parseDateKey(event.target.value);
            if (picked !== null) onChoose(picked);
          }}
          className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-base font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9 md:text-sm dark:bg-input/30"
        />
      </label>
    </div>
  );
}
