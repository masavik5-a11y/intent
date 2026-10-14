/// <reference types="vite/client" />
// Helpers for convex-test. The second dot in the file name keeps Convex from pushing
// this file to a deployment.
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { expect } from "vitest";
import { errorCodeOf, type ErrorCode } from "../shared/errors";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

export function newTest() {
  return convexTest(schema, modules);
}

export type TestConvex = ReturnType<typeof newTest>;

/** A user row and a caller signed in as that user. */
export async function signedIn(t: TestConvex, email = "me@intent.test") {
  const userId: Id<"users"> = await t.run((ctx) =>
    ctx.db.insert("users", { email }),
  );
  // Convex Auth reads the user id from the part of the subject before "|".
  const as = t.withIdentity({ subject: `${userId}|test-session` });
  return { userId, as };
}

/** Asserts that a call fails with the app error `code`. */
export async function expectAppError(
  call: Promise<unknown>,
  code: ErrorCode,
): Promise<void> {
  const failure = await call.then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure, `expected the call to fail with ${code}`).toBeInstanceOf(
    ConvexError,
  );
  const data: unknown =
    failure instanceof ConvexError ? (failure.data as unknown) : undefined;
  expect(errorCodeOf(data)).toBe(code);
}
