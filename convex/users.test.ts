/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("users.viewer", () => {
  test("is null without a session", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.users.viewer)).toBeNull();
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
