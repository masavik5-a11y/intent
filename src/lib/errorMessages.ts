import { errorCodeFrom } from "./errors";

/**
 * One sentence for a failed save (docs/DESIGN.md, section 10): what went wrong, in
 * the app's plain voice.
 */
export function saveErrorMessage(error: unknown): string {
  switch (errorCodeFrom(error)) {
    case "OVERLAP":
      return "That overlaps another block. One thing at a time: move or shorten one of them.";
    case "INVALID_TIME":
      return "Times go in 5-minute steps, from 5 minutes to 24 hours.";
    case "NOT_STARTED":
      return "It has not started yet. Done and Partly come once it begins; Skip works any time.";
    case "NO_ROOM":
      return "Something already recorded fills that time. Change its times first, then mark this one.";
    case "NOT_FOUND":
      return "That is no longer there. It may have been changed on another device.";
    case "INVALID_INPUT":
      return "Something in that could not be saved. Check the fields and try again.";
    case "UNAUTHENTICATED":
      return "You are signed out. Sign in and try again.";
    default:
      return "That did not save. Check the connection and try again.";
  }
}
