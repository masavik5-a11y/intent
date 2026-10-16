import { useMutation } from "convex/react";
import { dropSpan, sameSpan, type DragMode } from "@shared/drag";
import type { DateKey, LocalMoment } from "@shared/time";
import { api, type Doc } from "@/lib/api";
import { updateLocally } from "@/lib/blockUpdate";
import { saveErrorMessage } from "@/lib/errorMessages";
import {
  dragSetup,
  dragTimeLabel,
  dropUpdate,
  type DragLane,
} from "./blockDrag";
import type { GridCard, GridDrag } from "./DayGrid";

/**
 * Dragging blocks on a day's grid (PRD T9): which cards may move under the edit rule,
 * where they would land, and the saved change, shown at once and rolled back if the
 * server refuses it. A repeating occurrence moved this way is changed alone ("This
 * one"): the server detaches it (decided 2026-10-16).
 */
export function useBlockDrag({
  blocks,
  day,
  gridStartMin,
  now,
  tense,
  planUnlocked,
  onError,
}: {
  blocks: readonly Doc<"blocks">[] | undefined;
  day: DateKey;
  gridStartMin: number;
  now: LocalMoment;
  tense: "past" | "today" | "future";
  planUnlocked: boolean;
  /** Why the last drop did not save, or null once one has. */
  onError: (message: string | null) => void;
}): {
  /** Gives each card that can be dragged its lane. */
  withDrag: (cards: GridCard[], lane: DragLane) => GridCard[];
  onDrag: GridDrag;
} {
  const update = useMutation(api.blocks.update).withOptimisticUpdate(
    updateLocally,
  );
  const context = {
    blocks: blocks ?? [],
    day,
    gridStartMin,
    now,
    tense,
    planUnlocked,
  };
  const find = (key: string) => blocks?.find((block) => block._id === key);

  function landing(
    key: string,
    lane: DragLane,
    mode: DragMode,
    deltaMin: number,
  ) {
    const block = find(key);
    if (block === undefined) return null;
    const setup = dragSetup(block, lane, context);
    if (setup === null) return null;
    return { block, setup, span: dropSpan({ ...setup, mode, deltaMin }) };
  }

  return {
    withDrag: (cards, lane) =>
      cards.map((card) => {
        const block = find(card.key);
        const live = card.state === "live";
        return block !== undefined &&
          !live &&
          dragSetup(block, lane, context) !== null
          ? { ...card, drag: { lane } }
          : card;
      }),
    onDrag: {
      preview: (key, lane, mode, deltaMin) => {
        const landed = landing(key, lane, mode, deltaMin);
        if (landed === null) return null;
        return {
          span: landed.span,
          time: dragTimeLabel(day, gridStartMin, landed.span),
        };
      },
      drop: (key, lane, mode, deltaMin) => {
        const landed = landing(key, lane, mode, deltaMin);
        if (landed === null || sameSpan(landed.span, landed.setup.origin))
          return;
        const changes = dropUpdate(
          landed.block,
          lane,
          landed.span,
          day,
          gridStartMin,
        );
        if (changes === null) return;
        onError(null);
        update(changes).catch((error: unknown) =>
          onError(saveErrorMessage(error)),
        );
      },
    },
  };
}
