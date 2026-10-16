import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useToday } from "@/lib/useToday";

// The Week item opens the week holding today, which waits for the settings (the
// grid's start decides which day is today).
export const Route = createFileRoute("/_app/week/")({
  component: ThisWeek,
});

function ThisWeek() {
  const today = useToday();
  const navigate = useNavigate();
  useEffect(() => {
    if (today === undefined) return;
    void navigate({
      to: "/week/$date",
      params: { date: today },
      replace: true,
    });
  }, [today, navigate]);
  return null;
}
