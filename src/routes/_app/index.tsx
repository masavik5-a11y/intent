import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useToday } from "@/lib/useToday";

interface IndexSearch {
  /** Passed on to the day: the phone's + asks for quick add on today. */
  add?: "now";
}

// The app opens on today (docs/DESIGN.md, section 1). Which day that is depends on the
// grid's start time, a setting, so this waits for it instead of redirecting at once.
export const Route = createFileRoute("/_app/")({
  validateSearch: (search: Record<string, unknown>): IndexSearch =>
    search.add === "now" ? { add: "now" } : {},
  component: TodayRedirect,
});

function TodayRedirect() {
  const today = useToday();
  const { add } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (today === undefined) return;
    const day = { to: "/day/$date", params: { date: today } } as const;
    // Land on the day first, then open quick add on top of it, so closing quick add
    // (which goes back one step) leaves the day on screen.
    void navigate({ ...day, replace: true }).then(() => {
      if (add !== undefined) void navigate({ ...day, search: { add } });
    });
  }, [today, add, navigate]);
  return null;
}
