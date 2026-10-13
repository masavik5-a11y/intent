import { ConvexError } from "convex/values";
import type { AppErrorData, ErrorCode } from "../../shared/errors";

/** An error the UI can recognise by its stable code. */
export function appError(code: ErrorCode): ConvexError<AppErrorData> {
  return new ConvexError<AppErrorData>({ code });
}
