import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useToday } from "@/lib/useToday";

// The Month item opens the month holding today.
export const Route = createFileRoute("/_app/month/")({
  component: ThisMonth,
});

function ThisMonth() {
  const today = useToday();
  const navigate = useNavigate();
  useEffect(() => {
    if (today === undefined) return;
    void navigate({
      to: "/month/$date",
      params: { date: today },
      replace: true,
    });
  }, [today, navigate]);
  return null;
}
