import { addDays, formatDayLabel, type DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";

// The inbox's words and choices (PRD P8), worked out without React.

/**
 * What a capture sends: the text as typed, and the activity whose name it is, if any
 * (case and spaces aside), so scheduling it later starts from that activity.
 */
export function captureArgs(
  text: string,
  activities: readonly Doc<"activities">[],
): { title: string; activityId?: Id<"activities"> } {
  const wanted = text.trim().toLowerCase();
  const activity = activities.find(
    (item) => !item.archived && item.name.trim().toLowerCase() === wanted,
  );
  return activity === undefined
    ? { title: text }
    : { title: text, activityId: activity._id };
}

/** The days offered at once when scheduling: today and tomorrow. */
export function scheduleChoices(
  today: DateKey,
): { label: string; date: DateKey }[] {
  return [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
  ];
}

/** "Captured Fri 16 Oct": the day it was captured, on this device's calendar. */
export function capturedText(day: DateKey): string {
  return `Captured ${formatDayLabel(day)}`;
}
