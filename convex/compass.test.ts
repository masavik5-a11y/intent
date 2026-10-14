import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { expectAppError, newTest, signedIn } from "./test.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("compass", () => {
  test("requires a session", async () => {
    const t = newTest();
    await expectAppError(t.query(api.compass.get), "UNAUTHENTICATED");
    await expectAppError(
      t.mutation(api.compass.save, { field: "vision", text: "Mine" }),
      "UNAUTHENTICATED",
    );
  });

  test("is null before anything is written", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    expect(await as.query(api.compass.get)).toBeNull();
  });

  test("saves each text on its own, trimmed, in one row", async () => {
    const t = newTest();
    const { userId, as } = await signedIn(t);
    await as.mutation(api.compass.save, {
      field: "vision",
      text: "  A studio of my own.\nEvery week a reel I am proud of.  ",
    });
    vi.setSystemTime(new Date("2026-10-15T08:00:00Z"));
    await as.mutation(api.compass.save, {
      field: "antiVision",
      text: "Still starting on Monday.",
    });

    expect(await as.query(api.compass.get)).toMatchObject({
      userId,
      vision: "A studio of my own.\nEvery week a reel I am proud of.",
      antiVision: "Still starting on Monday.",
      updatedAt: Date.parse("2026-10-15T08:00:00Z"),
    });
    const rows = await t.run((ctx) => ctx.db.query("compass").collect());
    expect(rows).toHaveLength(1);
  });

  test("blank text clears that field and leaves the other", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    await as.mutation(api.compass.save, { field: "vision", text: "Built." });
    await as.mutation(api.compass.save, {
      field: "antiVision",
      text: "Drift.",
    });
    await as.mutation(api.compass.save, { field: "vision", text: "   " });
    const compass = await as.query(api.compass.get);
    expect(compass && "vision" in compass).toBe(false);
    expect(compass?.antiVision).toBe("Drift.");
  });

  test("a first save of blank text still records the edit", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    await as.mutation(api.compass.save, { field: "vision", text: "" });
    const compass = await as.query(api.compass.get);
    expect(compass?.updatedAt).toBe(Date.parse("2026-10-14T10:00:00Z"));
    expect(compass && "vision" in compass).toBe(false);
  });

  test("rejects text over 10,000 characters", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    await expectAppError(
      as.mutation(api.compass.save, {
        field: "vision",
        text: "x".repeat(10_001),
      }),
      "INVALID_INPUT",
    );
  });

  test("each user has their own", async () => {
    const t = newTest();
    const me = await signedIn(t, "me@intent.test");
    const other = await signedIn(t, "other@intent.test");
    await me.as.mutation(api.compass.save, { field: "vision", text: "Mine." });
    await other.as.mutation(api.compass.save, {
      field: "vision",
      text: "Theirs.",
    });
    expect((await me.as.query(api.compass.get))?.vision).toBe("Mine.");
    expect((await other.as.query(api.compass.get))?.vision).toBe("Theirs.");
  });
});
