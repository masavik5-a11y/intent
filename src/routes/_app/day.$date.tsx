import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseDateKey } from "@shared/time";
import { DayScreen } from "@/features/day/DayScreen";

export const Route = createFileRoute("/_app/day/$date")({
  // The date lives in the URL (PRD T6). Anything that is not a real day goes to today.
  beforeLoad: ({ params }) => {
    const date = parseDateKey(params.date);
    if (date === null) throw redirect({ to: "/", replace: true });
    return { date };
  },
  component: DayRoute,
});

function DayRoute() {
  const { date } = Route.useRouteContext();
  // Keyed by date so each day opens fresh: scrolled to its morning, or to now.
  return <DayScreen key={date} date={date} />;
}
