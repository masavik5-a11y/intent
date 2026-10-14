import { describe, expect, test } from "vitest";
import { effectiveIntent, INTENT_FIELDS, type IntentTexts } from "./blocks";

const gym: IntentTexts = {
  doneWhen: "All four lifts logged.",
  why: "Energy for the camera.",
  how: "Bench 4x6, incline, dips.",
  ifThen: "I do 10 minutes and decide.",
  minimumVersion: "20 minutes, three exercises.",
  costOfSkipping: "Low energy, and it shows on camera.",
};

describe("effectiveIntent", () => {
  test("a block without overrides inherits every field", () => {
    const intent = effectiveIntent({}, gym);
    for (const field of INTENT_FIELDS) {
      expect(intent[field]).toEqual({ text: gym[field], inherited: true });
    }
  });

  test("a block's own text wins, field by field", () => {
    const intent = effectiveIntent(
      { doneWhen: "Squat 5x5.", why: "Today it is about the legs." },
      gym,
    );
    expect(intent.doneWhen).toEqual({ text: "Squat 5x5.", inherited: false });
    expect(intent.why).toEqual({
      text: "Today it is about the legs.",
      inherited: false,
    });
    expect(intent.how).toEqual({ text: gym.how, inherited: true });
  });

  test("without an activity only the block's own text applies", () => {
    const intent = effectiveIntent({ why: "A one-off." }, null);
    expect(intent.why).toEqual({ text: "A one-off.", inherited: false });
    expect(intent.how).toBeNull();
    expect(intent.doneWhen).toBeNull();
  });

  test("a field neither has is null", () => {
    const intent = effectiveIntent({}, { why: "Only a why." });
    expect(intent.why).toEqual({ text: "Only a why.", inherited: true });
    expect(intent.how).toBeNull();
    expect(intent.costOfSkipping).toBeNull();
  });

  test.each(["", "   ", "\n"])(
    "blank block text %j counts as unset and inherits",
    (blank) => {
      expect(effectiveIntent({ why: blank }, gym).why).toEqual({
        text: gym.why,
        inherited: true,
      });
    },
  );

  test("blank activity text counts as none", () => {
    expect(effectiveIntent({}, { why: "  " }).why).toBeNull();
  });

  test("explicitly undefined fields inherit", () => {
    expect(effectiveIntent({ why: undefined }, gym).why?.inherited).toBe(true);
  });
});
