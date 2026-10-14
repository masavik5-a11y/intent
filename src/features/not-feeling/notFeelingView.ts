import { effectiveIntent } from "@shared/blocks";
import { formatTimeRange } from "@shared/time";
import { ANTI_VISION, VISION } from "@/features/compass/compassCopy";
import type { Doc, PlannedBlockDoc } from "@/lib/api";

// The "Not feeling it" view (PRD V2, DESIGN.md section 4b), worked out without React.

export interface NotFeelingSection {
  key: "ifThen" | "minimumVersion" | "costOfSkipping" | "antiVision" | "vision";
  heading: string;
  text: string;
  /** Set in the serif voice: the compass texts, your own words at reading size. */
  voice: boolean;
}

export interface NotFeelingView {
  /** "Gym · push day" */
  title: string;
  /** "11:00–12:30" */
  time: string;
  /**
   * In this order, each only if it has text: the easiest way forward first, the hard
   * look in the middle, the vision last (DESIGN.md section 4b).
   */
  sections: NotFeelingSection[];
  /** Neither vision nor anti-vision is written yet: the view offers to write them. */
  compassEmpty: boolean;
}

function present(text: string | undefined): text is string {
  return text !== undefined && text.trim() !== "";
}

export function notFeelingView(
  block: PlannedBlockDoc,
  activity: Doc<"activities"> | undefined,
  compass: { vision?: string; antiVision?: string } | null,
): NotFeelingView {
  const intent = effectiveIntent(block, activity ?? null);
  const candidates: (NotFeelingSection | null)[] = [
    intent.ifThen && {
      key: "ifThen",
      heading: "If I don't feel like it",
      text: intent.ifThen.text,
      voice: false,
    },
    intent.minimumVersion && {
      key: "minimumVersion",
      heading: "The minimum that still counts",
      text: intent.minimumVersion.text,
      voice: false,
    },
    intent.costOfSkipping && {
      key: "costOfSkipping",
      heading: "If I keep skipping this",
      text: intent.costOfSkipping.text,
      voice: false,
    },
    present(compass?.antiVision)
      ? {
          key: "antiVision",
          heading: ANTI_VISION.title,
          text: compass.antiVision,
          voice: true,
        }
      : null,
    present(compass?.vision)
      ? {
          key: "vision",
          heading: VISION.title,
          text: compass.vision,
          voice: true,
        }
      : null,
  ];
  return {
    title:
      block.focus === undefined
        ? block.title
        : `${block.title} · ${block.focus}`,
    time: formatTimeRange(block.plannedStartMin, block.plannedDurationMin),
    sections: candidates.filter(
      (section): section is NotFeelingSection => section !== null,
    ),
    compassEmpty: !present(compass?.vision) && !present(compass?.antiVision),
  };
}
