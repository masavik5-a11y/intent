/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("users.viewer", () => {
  test("requires a session", async () => {
    const t = convexTest(schema, modules);
    const failure = await t
      .query(api.users.viewer)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConvexError);
    expect((failure as ConvexError<{ code: string }>).data).toEqual({
      code: "UNAUTHENTICATED",
    });
  });

  test("returns the signed-in user's email", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "someone@example.com" }),
    );
    // Convex Auth puts "<userId>|<sessionId>" in the token subject.
    const asUser = t.withIdentity({ subject: `${userId}|test-session` });
    expect(await asUser.query(api.users.viewer)).toEqual({
      email: "someone@example.com",
    });
  });
});
