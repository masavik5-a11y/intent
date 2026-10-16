import { useCallback } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseDateKey, type DateKey } from "@shared/time";
import { WeekScreen } from "@/features/week/WeekScreen";

// The week holding a date (PRD P6). Any day of it can be in the URL.
export const Route = createFileRoute("/_app/week/$date")({
  beforeLoad: ({ params }) => {
    const date = parseDateKey(params.date);
    if (date === null) throw redirect({ to: "/week", replace: true });
    return { date };
  },
  component: WeekRoute,
});

function WeekRoute() {
  const { date } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  const goTo = useCallback(
    (day: DateKey) =>
      void navigate({ to: "/week/$date", params: { date: day } }),
    [navigate],
  );
  const openDay = useCallback(
    (day: DateKey) =>
      void navigate({ to: "/day/$date", params: { date: day } }),
    [navigate],
  );
  const openBlock = useCallback(
    (day: DateKey, block: string) =>
      void navigate({
        to: "/day/$date",
        params: { date: day },
        search: { block },
      }),
    [navigate],
  );
  const add = useCallback(
    (day: DateKey, position: number) =>
      void navigate({
        to: "/day/$date",
        params: { date: day },
        search: { add: Math.max(0, Math.floor(position)) },
      }),
    [navigate],
  );
  return (
    <WeekScreen
      key={date}
      date={date}
      onGoTo={goTo}
      onOpenDay={openDay}
      onOpenBlock={openBlock}
      onAdd={add}
    />
  );
}
