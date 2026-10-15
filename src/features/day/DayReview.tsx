/**
 * A past day's evening review, when looking back at it (PRD R3): the answers given
 * and the scores. A day not reviewed yet offers the review.
 */
export function DayReview({
  notes,
  reviewed,
  onReview,
}: {
  notes: readonly { label: string; text: string }[];
  reviewed: boolean;
  /** Opens the review; undefined while it is open. */
  onReview: (() => void) | undefined;
}) {
  return (
    <>
      {notes.length > 0 && (
        <section aria-label="Review" className="flex flex-col gap-1">
          <h2 className="text-xs text-muted-foreground">Review</h2>
          <dl className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm">
            {notes.map((note) => (
              <div key={note.label + note.text} className="flex flex-col">
                {note.label !== "" && (
                  <dt className="text-xs text-muted-foreground">
                    {note.label}
                  </dt>
                )}
                <dd className="whitespace-pre-line">{note.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {!reviewed && onReview !== undefined && (
        <button
          type="button"
          onClick={onReview}
          className="flex min-h-11 items-center self-start rounded-sm text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-8"
        >
          Review the day
        </button>
      )}
    </>
  );
}
