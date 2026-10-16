// Selecting blocks with ↑ and ↓ (DESIGN.md section 8). The selection is the keyboard
// focus on a card, so Enter opens it as a click would and the focus ring shows it.

/** A card's place on screen, top to bottom. */
export interface CardBox {
  top: number;
  bottom: number;
}

/**
 * Which card ↑ or ↓ selects among `cards` (sorted top to bottom). From a selected
 * card, the one above or below it, stopping at the ends. With none selected, ↓ takes
 * the first card that reaches past `anchor` (now on today, else the top of the view)
 * and ↑ the last that starts above it. Null when there are no cards.
 */
export function nextCardIndex(
  cards: readonly CardBox[],
  current: number | null,
  direction: 1 | -1,
  anchor: number,
): number | null {
  if (cards.length === 0) return null;
  if (current !== null) {
    return Math.min(Math.max(current + direction, 0), cards.length - 1);
  }
  if (direction === 1) {
    const index = cards.findIndex((card) => card.bottom > anchor);
    return index === -1 ? cards.length - 1 : index;
  }
  let last = -1;
  cards.forEach((card, index) => {
    if (card.top < anchor) last = index;
  });
  return last === -1 ? 0 : last;
}

/** The block whose card has the keyboard focus, or null. */
export function focusedBlockKey(): string | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  return (
    active.closest<HTMLElement>("[data-block-key]")?.dataset.blockKey ?? null
  );
}

/** Moves the keyboard focus to the card above or below (↑, ↓). */
export function moveCardFocus(direction: 1 | -1): void {
  const grid = document.querySelector<HTMLElement>("[data-day-grid]");
  if (grid === null) return;
  const cards = [...grid.querySelectorAll<HTMLElement>("[data-block-key]")]
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const current = cards.findIndex(
    ({ element }) => element === document.activeElement,
  );
  const nowLine = grid.querySelector("[data-now-line]");
  const anchor =
    nowLine?.getBoundingClientRect().top ?? grid.getBoundingClientRect().top;
  const index = nextCardIndex(
    cards.map(({ rect }) => ({ top: rect.top, bottom: rect.bottom })),
    current === -1 ? null : current,
    direction,
    anchor,
  );
  const target = index === null ? undefined : cards[index]?.element;
  if (target === undefined) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "nearest" });
}

/**
 * The block D, P, S or U acts on: the selected card's, else for Undo the block marked
 * last from the now panel, else the current block, else the one that just ended and
 * waits to be marked.
 */
export function shortcutTarget<Id>({
  command,
  focused,
  current,
  toMark,
  lastMarked,
}: {
  command: "done" | "partly" | "skip" | "undo";
  focused: Id | null;
  current: Id | null;
  toMark: Id | null;
  lastMarked: Id | null;
}): Id | null {
  if (focused !== null) return focused;
  if (command === "undo" && lastMarked !== null) return lastMarked;
  return current ?? toMark;
}

/**
 * Whether D, P, S or U can act on a block: Done, Partly and Skip on one that is not
 * marked yet (a marked one is undone first, as on the panels), and not on an
 * unplanned entry; Undo on a marked block, or on one where the minimum was chosen.
 */
export function shortcutApplies(
  command: "done" | "partly" | "skip" | "undo",
  block: {
    status: string;
    plannedStartMin?: number | undefined;
    minimumChosen?: boolean | undefined;
  },
): boolean {
  if (block.plannedStartMin === undefined) return false;
  if (command === "undo") {
    return block.status !== "planned" || block.minimumChosen === true;
  }
  return block.status === "planned";
}
