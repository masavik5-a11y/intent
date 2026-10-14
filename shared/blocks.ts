// Blocks and their intent (docs/PRD.md, section 4; docs/ARCHITECTURE.md, section 5).

/**
 * The intent fields, in the order the now panel shows them. Activities hold the
 * standing text; a block may override any of them for that day.
 */
export const INTENT_FIELDS = [
  "doneWhen",
  "why",
  "how",
  "ifThen",
  "minimumVersion",
  "costOfSkipping",
] as const;
export type IntentField = (typeof INTENT_FIELDS)[number];

/** Intent texts as stored on an activity or on a block. Unset means none, or inherit. */
export type IntentTexts = { readonly [F in IntentField]?: string | undefined };

export interface IntentText {
  text: string;
  /** True when the text comes from the activity rather than from the block itself. */
  inherited: boolean;
}

/** For each intent field, the text that applies to a block, or null when there is none. */
export type EffectiveIntent = { [F in IntentField]: IntentText | null };

function present(text: string | undefined): text is string {
  return text !== undefined && text.trim() !== "";
}

/**
 * The intent that applies to a block: for each field, the block's own text if it has
 * one, otherwise its activity's. Blank text counts as unset. Because nothing is copied,
 * editing an activity's why changes every block that has not overridden it, past ones
 * included: the why is a living statement.
 */
export function effectiveIntent(
  block: IntentTexts,
  activity: IntentTexts | null,
): EffectiveIntent {
  const pick = (field: IntentField): IntentText | null => {
    const own = block[field];
    if (present(own)) return { text: own, inherited: false };
    const inherited = activity?.[field];
    if (present(inherited)) return { text: inherited, inherited: true };
    return null;
  };
  return {
    doneWhen: pick("doneWhen"),
    why: pick("why"),
    how: pick("how"),
    ifThen: pick("ifThen"),
    minimumVersion: pick("minimumVersion"),
    costOfSkipping: pick("costOfSkipping"),
  };
}
