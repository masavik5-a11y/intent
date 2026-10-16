import type { OptimisticLocalStore } from "convex/browser";
import { addDays, type DateKey } from "@shared/time";
import { api, type BlockUpdate, type Doc } from "./api";

// Block edits show at once (ARCHITECTURE.md section 8): the change is applied to every
// loaded list of blocks, and Convex rolls it back if the server refuses it.

/**
 * A block with an update applied as the server would store it: given fields set,
 * null clearing an optional one. The server also trims and checks; a change it
 * refuses is rolled back.
 */
export function withUpdate(
  block: Doc<"blocks">,
  { blockId: _, ...changes }: BlockUpdate,
): Doc<"blocks"> {
  const next: Record<string, unknown> = { ...block };
  for (const [field, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    if (value === null) delete next[field];
    else next[field] = value;
  }
  return next as Doc<"blocks">;
}

/** Which dates a loaded list of blocks holds. */
type Window = { from: DateKey; to: DateKey };

function holds(window: Window, date: DateKey): boolean {
  return window.from <= date && date <= window.to;
}

/**
 * Puts `block` where it now belongs in a loaded list: replaced where it was, added
 * where its date has come into the list, left out where it has gone.
 */
function placed(
  list: readonly Doc<"blocks">[],
  block: Doc<"blocks">,
  window: Window,
): Doc<"blocks">[] | null {
  const had = list.some((item) => item._id === block._id);
  const belongs = holds(window, block.date);
  if (!had && !belongs) return null;
  const rest = list.filter((item) => item._id !== block._id);
  return belongs
    ? [...rest, block].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
      )
    : rest;
}

/** The optimistic update for blocks.update: every loaded day and range. */
export function updateLocally(
  localStore: OptimisticLocalStore,
  args: BlockUpdate,
): void {
  const days = localStore.getAllQueries(api.blocks.listForDay);
  const ranges = localStore.getAllQueries(api.blocks.listRange);
  const before = [...days, ...ranges]
    .flatMap((query) => query.value ?? [])
    .find((item) => item._id === args.blockId);
  if (before === undefined) return;
  const after = withUpdate(before, args);
  for (const query of days) {
    if (query.value === undefined) continue;
    const window = {
      from: addDays(query.args.date, -1),
      to: addDays(query.args.date, 1),
    };
    const next = placed(query.value, after, window);
    if (next !== null)
      localStore.setQuery(api.blocks.listForDay, query.args, next);
  }
  for (const query of ranges) {
    if (query.value === undefined) continue;
    const next = placed(query.value, after, query.args);
    if (next !== null)
      localStore.setQuery(api.blocks.listRange, query.args, next);
  }
}
