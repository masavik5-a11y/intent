import { createFileRoute, redirect } from "@tanstack/react-router";
import { formatDayLabel, parseDateKey } from "@shared/time";
import { ScreenPlaceholder } from "@/features/shell/ScreenPlaceholder";
import { readNow } from "@/lib/now";

export const Route = createFileRoute("/_app/day/$date")({
  // The date lives in the URL (PRD T6). Anything that is not a real day goes to today.
  beforeLoad: ({ params }) => {
    const date = parseDateKey(params.date);
    if (date === null) {
      throw redirect({
        to: "/day/$date",
        params: { date: readNow().date },
        replace: true,
      });
    }
    return { date };
  },
  component: DayRoute,
});

function DayRoute() {
  const { date } = Route.useRouteContext();
  return (
    <ScreenPlaceholder
      title={formatDayLabel(date, { withYear: true })}
      milestone="M1"
    />
  );
}
