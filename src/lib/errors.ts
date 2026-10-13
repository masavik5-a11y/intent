import { ConvexError } from "convex/values";
import { errorCodeOf, type ErrorCode } from "@shared/errors";

/** The app's error code carried by a failed Convex call, or null for anything else. */
export function errorCodeFrom(error: unknown): ErrorCode | null {
  return error instanceof ConvexError ? errorCodeOf(error.data) : null;
}
