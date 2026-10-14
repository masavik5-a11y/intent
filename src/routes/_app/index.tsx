import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useToday } from "@/lib/useToday";

// The app opens on today (docs/DESIGN.md, section 1). Which day that is depends on the
// grid's start time, a setting, so this waits for it instead of redirecting at once.
export const Route = createFileRoute("/_app/")({
  component: TodayRedirect,
});

function TodayRedirect() {
  const today = useToday();
  const navigate = useNavigate();
  useEffect(() => {
    if (today === undefined) return;
    void navigate({ to: "/day/$date", params: { date: today }, replace: true });
  }, [today, navigate]);
  return null;
}
