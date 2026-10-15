import { useMutation, useQuery } from "convex/react";
import { hasPlan, type StatusAction } from "@shared/blocks";
import { gridDayOf } from "@shared/grid";
import { DEFAULT_SETTINGS } from "@shared/settings";
import { formatTimeRange, type DateKey, type LocalMoment } from "@shared/time";
import { SidePanel } from "@/components/SidePanel";
import { entryTitle } from "@/features/day/dayView";
import { statusLine } from "@/features/status/statusLabels";
import { api, type BlockUpdate, type Doc } from "@/lib/api";
import { saveErrorMessage } from "@/lib/errorMessages";
import { BlockDetail } from "./BlockDetail";
import { EntryDetail } from "./EntryDetail";
import type { RepeatChoice, RepeatOutcome } from "./RepeatSection";

interface BlockPanelProps {
  /** The block whose detail is open. */
  block: Doc<"blocks">;
  /** The day being viewed; a block from another day says which day it is on. */
  viewedDay: DateKey;
  /** From 1024 px the panel sits beside the grid; narrower, it is a sheet. */
  wide: boolean;
  activities: readonly Doc<"activities">[];
  categories: readonly Doc<"categories">[];
  /** The blocks loaded around the day, for the overlap warnings. */
  blocks: readonly Doc<"blocks">[];
  gridStartMin: number;
  now: LocalMoment;
  /** Done, Partly, Skip, Undo: saved at once, apart from the form. */
  onAction: (action: StatusAction) => void;
  statusError: string | null;
  /** "Edit plan" was chosen for the whole (past) day. */
  dayPlanUnlocked: boolean;
  onClose: () => void;
}

/**
 * Block detail or, for an unplanned entry, entry detail, in the side panel (DESIGN.md
 * section 7). Owns saving and deleting, so the day and the plan screen share it.
 */
export function BlockPanel({
  block,
  viewedDay,
  wide,
  activities,
  categories,
  blocks,
  gridStartMin,
  now,
  onAction,
  statusError,
  dayPlanUnlocked,
  onClose,
}: BlockPanelProps) {
  const updateBlock = useMutation(api.blocks.update);
  const removeBlock = useMutation(api.blocks.remove);
  const repeatBlock = useMutation(api.recurrences.repeat);
  const settings = useQuery(api.settings.get);
  const rules = useQuery(api.recurrences.list);
  const rule =
    block.recurrenceId === undefined
      ? undefined
      : rules?.find((item) => item._id === block.recurrenceId);
  const today = gridDayOf(now, gridStartMin);
  const category = categories.find((item) => item._id === block.categoryId);

  /** Runs a change and closes the panel; a failure becomes its message. */
  async function attempt(
    change: () => Promise<unknown>,
  ): Promise<string | null> {
    try {
      await change();
      onClose();
      return null;
    } catch (error) {
      return saveErrorMessage(error);
    }
  }
  const save = (changes: BlockUpdate) => attempt(() => updateBlock(changes));
  const remove = () => attempt(() => removeBlock({ blockId: block._id }));

  async function repeat(choice: RepeatChoice): Promise<RepeatOutcome> {
    try {
      const result = await repeatBlock({
        blockId: block._id,
        weekdays: choice.weekdays,
        ...(choice.endDate === undefined ? {} : { endDate: choice.endDate }),
      });
      return { skipped: result.skipped };
    } catch (error) {
      return { error: saveErrorMessage(error) };
    }
  }

  return (
    <SidePanel
      wide={wide}
      title={hasPlan(block) ? block.title : entryTitle(block, category)}
      subtitle={
        hasPlan(block)
          ? formatTimeRange(block.plannedStartMin, block.plannedDurationMin)
          : statusLine(block)
      }
      onCancel={onClose}
    >
      {hasPlan(block) ? (
        // Keyed, so choosing another block starts the form afresh.
        <BlockDetail
          key={block._id}
          block={block}
          viewedDay={viewedDay}
          activities={activities}
          categories={categories}
          blocks={blocks}
          onSave={save}
          onDelete={remove}
          onCancel={onClose}
          now={now}
          statusError={statusError}
          onAction={onAction}
          dayPlanUnlocked={dayPlanUnlocked}
          repeat={{
            rule,
            // Only a plain block on today or later starts a rule; a past day's plan
            // is a record (PRD section 7, rule 4). Rules load before this offers.
            canStart:
              rules !== undefined && rule === undefined && block.date >= today,
            weekStartsOn:
              settings?.weekStartsOn ?? DEFAULT_SETTINGS.weekStartsOn,
            onRepeat: repeat,
          }}
        />
      ) : (
        <EntryDetail
          key={block._id}
          entry={block}
          gridStartMin={gridStartMin}
          categories={categories}
          blocks={blocks}
          onSave={save}
          onDelete={remove}
          onCancel={onClose}
        />
      )}
    </SidePanel>
  );
}
