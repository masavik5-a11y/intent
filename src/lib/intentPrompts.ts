import type { IntentField } from "@shared/blocks";

/** The prompts for the intent fields (PRD section 4, "Intent fields"). */
export const INTENT_PROMPTS: Record<IntentField, string> = {
  doneWhen: "This block is done when…",
  why: "Why this matters to me",
  how: "How I do it",
  ifThen: "If I don't feel like it, then…",
  minimumVersion: "The smallest version that still counts",
  costOfSkipping: "If I keep skipping this, in a year…",
};

/** Under the cost of skipping wherever it is written (PRD V4). */
export const COST_OF_SKIPPING_HINT =
  "Shown only when you press “Not feeling it”, never in a notification.";
