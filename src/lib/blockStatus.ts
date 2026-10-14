import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import {
  actualLaneOf,
  applyStatus,
  type StatusAction,
  type StatusFields,
} from "@shared/blocks";
import { api, type Doc, type Id } from "./api";
import { saveErrorMessage } from "./errorMessages";
import { readNow } from "./now";

// Done, Partly, Skip and Undo (PRD A1, A4) from anywhere in the app. The change shows
// at once (ARCHITECTURE.md section 8): the same applyStatus the server runs is applied
// to every loaded day, and Convex rolls it back if the server refuses.

type SetStatusArgs = FunctionArgs<typeof api.blocks.setStatus>;

/**
 * A block with a status change applied; actual times, reason and the minimum removed
 * when unset.
 */
export function withStatus(
  block: Doc<"blocks">,
  fields: StatusFields,
): Doc<"blocks"> {
  const {
    actualStartMin: _start,
    actualDurationMin: _length,
    skipReason: _reason,
    minimumChosen: _minimum,
    ...rest
  } = block;
  const next: Doc<"blocks"> = { ...rest, status: fields.status };
  if (fields.actualStartMin !== undefined) {
    next.actualStartMin = fields.actualStartMin;
  }
  if (fields.actualDurationMin !== undefined) {
    next.actualDurationMin = fields.actualDurationMin;
  }
  if (fields.skipReason !== undefined) next.skipReason = fields.skipReason;
  if (fields.minimumChosen !== undefined) {
    next.minimumChosen = fields.minimumChosen;
  }
  return next;
}

/** The optimistic update for blocks.setStatus: every loaded day that holds the block. */
export function setStatusLocally(
  localStore: OptimisticLocalStore,
  args: SetStatusArgs,
): void {
  for (const query of localStore.getAllQueries(api.blocks.listForDay)) {
    const blocks = query.value;
    const block = blocks?.find((item) => item._id === args.blockId);
    if (blocks === undefined || block === undefined) continue;
    const others = blocks.filter((item) => item._id !== block._id);
    const result = applyStatus(
      block,
      args.action,
      actualLaneOf(others),
      args.now,
    );
    // The server will refuse it too; its error is what the screen shows.
    if ("problem" in result) continue;
    localStore.setQuery(
      api.blocks.listForDay,
      query.args,
      blocks.map((item) =>
        item._id === block._id ? withStatus(item, result.fields) : item,
      ),
    );
  }
}

/**
 * Marks a block. Resolves to an error message, or null once the server has it; the
 * screen changes before that. "Now" is read when the button is pressed.
 */
export function useSetStatus(): (
  blockId: Id<"blocks">,
  action: StatusAction,
) => Promise<string | null> {
  const setStatus = useMutation(api.blocks.setStatus).withOptimisticUpdate(
    setStatusLocally,
  );
  return async (blockId, action) => {
    try {
      await setStatus({ blockId, action, now: readNow() });
      return null;
    } catch (error) {
      return saveErrorMessage(error);
    }
  };
}
