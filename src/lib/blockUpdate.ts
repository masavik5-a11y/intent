import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { INTENT_FIELDS } from "@shared/blocks";
import { addDays, type DateKey } from "@shared/time";
import { api, type BlockUpdate, type Doc, type Id } from "./api";

// Block changes show at once (ARCHITECTURE.md section 8): a new block, a logged entry,
// an edit or a deletion is applied to every loaded list of blocks, and Convex rolls
// it back if the server refuses it.

type CreateArgs = FunctionArgs<typeof api.blocks.create>;
type LogArgs = FunctionArgs<typeof api.blocks.logEntry>;

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

/** Every loaded block, from any day or range, by id. */
function loadedBlock(
  localStore: OptimisticLocalStore,
  blockId: Id<"blocks">,
): Doc<"blocks"> | undefined {
  return [
    ...localStore.getAllQueries(api.blocks.listForDay),
    ...localStore.getAllQueries(api.blocks.listRange),
  ]
    .flatMap((query) => query.value ?? [])
    .find((item) => item._id === blockId);
}

/** Puts a block, new or changed, into every loaded day and range it belongs to. */
function placeEverywhere(
  localStore: OptimisticLocalStore,
  after: Doc<"blocks">,
): void {
  const days = localStore.getAllQueries(api.blocks.listForDay);
  const ranges = localStore.getAllQueries(api.blocks.listRange);
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

/** The optimistic update for blocks.update: every loaded day and range. */
export function updateLocally(
  localStore: OptimisticLocalStore,
  args: BlockUpdate,
): void {
  const before = loadedBlock(localStore, args.blockId);
  if (before === undefined) return;
  placeEverywhere(localStore, withUpdate(before, args));
}

/** The optimistic update for blocks.remove. */
export function removeLocally(
  localStore: OptimisticLocalStore,
  args: { blockId: Id<"blocks"> },
): void {
  const without = (list: readonly Doc<"blocks">[]) =>
    list.filter((item) => item._id !== args.blockId);
  for (const query of localStore.getAllQueries(api.blocks.listForDay)) {
    if (query.value === undefined) continue;
    localStore.setQuery(
      api.blocks.listForDay,
      query.args,
      without(query.value),
    );
  }
  for (const query of localStore.getAllQueries(api.blocks.listRange)) {
    if (query.value === undefined) continue;
    localStore.setQuery(api.blocks.listRange, query.args, without(query.value));
  }
}

// A stand-in id for a block the server has not made yet; the server's answer
// replaces it.
let pending = 0;
function pendingId(): Id<"blocks"> {
  pending += 1;
  return `pending-${pending}` as Id<"blocks">;
}

/** The activity a new block names, from the loaded activities. */
function loadedActivity(
  localStore: OptimisticLocalStore,
  activityId: Id<"activities"> | undefined,
): Doc<"activities"> | undefined {
  if (activityId === undefined) return undefined;
  return localStore
    .getQuery(api.activities.list, {})
    ?.find((activity) => activity._id === activityId);
}

/**
 * The block blocks.create would make, as far as the client can tell: the title and
 * category from the activity when left out, text trimmed. Null when it cannot tell.
 */
export function createdBlock(
  args: CreateArgs,
  activity: Doc<"activities"> | undefined,
  id: Id<"blocks">,
): Doc<"blocks"> | null {
  const title = (args.title ?? activity?.name ?? "").trim();
  const categoryId = args.categoryId ?? activity?.categoryId;
  if (title === "" || categoryId === undefined) return null;
  const block: Doc<"blocks"> = {
    _id: id,
    _creationTime: 0,
    userId: activity?.userId ?? ("" as Id<"users">),
    date: args.date,
    title,
    categoryId,
    plannedStartMin: args.plannedStartMin,
    plannedDurationMin: args.plannedDurationMin,
    status: "planned",
  };
  if (activity !== undefined) block.activityId = activity._id;
  const focus = args.focus?.trim();
  if (focus !== undefined && focus !== "") block.focus = focus;
  for (const field of INTENT_FIELDS) {
    const text = args[field]?.trim();
    if (text !== undefined && text !== "") block[field] = text;
  }
  return block;
}

/** The optimistic update for blocks.create: the new block shows before the server's. */
export function createLocally(
  localStore: OptimisticLocalStore,
  args: CreateArgs,
): void {
  const block = createdBlock(
    args,
    loadedActivity(localStore, args.activityId),
    pendingId(),
  );
  if (block !== null) placeEverywhere(localStore, block);
}

/** The entry blocks.logEntry would make: titled by the activity or the category. */
export function loggedEntry(
  args: LogArgs,
  activity: Doc<"activities"> | undefined,
  category: Doc<"categories"> | undefined,
  id: Id<"blocks">,
): Doc<"blocks"> | null {
  const typed = args.title?.trim() ?? "";
  const title = typed !== "" ? typed : (activity?.name ?? category?.name);
  if (title === undefined) return null;
  const entry: Doc<"blocks"> = {
    _id: id,
    _creationTime: 0,
    userId: category?.userId ?? ("" as Id<"users">),
    date: args.date,
    title,
    categoryId: args.categoryId,
    status: "done",
    actualStartMin: args.actualStartMin,
    actualDurationMin: args.actualDurationMin,
  };
  if (activity !== undefined) entry.activityId = activity._id;
  return entry;
}

/** The optimistic update for blocks.logEntry. */
export function logLocally(
  localStore: OptimisticLocalStore,
  args: LogArgs,
): void {
  const category = localStore
    .getQuery(api.categories.list, {})
    ?.find((item) => item._id === args.categoryId);
  const entry = loggedEntry(
    args,
    loadedActivity(localStore, args.activityId),
    category,
    pendingId(),
  );
  if (entry !== null) placeEverywhere(localStore, entry);
}
