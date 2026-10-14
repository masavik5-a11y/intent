import type { Id } from "@/lib/api";
import type { DayNote } from "./dayView";

/**
 * The notes written on a day's blocks (PRD A5, R3), shown when looking back at a past
 * day. Each opens its block.
 */
export function DayNotes({
  notes,
  onOpen,
}: {
  notes: readonly DayNote[];
  onOpen: (blockId: Id<"blocks">) => void;
}) {
  if (notes.length === 0) return null;
  return (
    <section aria-label="Notes" className="flex flex-col gap-1">
      <h2 className="text-xs text-muted-foreground">Notes</h2>
      <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
        {notes.map((note) => (
          <li key={note.block._id}>
            <button
              type="button"
              onClick={() => onOpen(note.block._id)}
              className="flex min-h-11 w-full items-baseline gap-2 rounded-sm text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-8"
            >
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {note.start}
              </span>
              <span className="min-w-0">
                <span className="font-medium">{note.block.title}</span>
                {" · "}
                {note.text}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
