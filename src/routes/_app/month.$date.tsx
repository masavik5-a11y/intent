import { useCallback } from "react";
import {
  createFileRoute,
  redirect,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router";
import { parseDateKey, type DateKey } from "@shared/time";
import { MonthScreen } from "@/features/month/MonthScreen";

interface MonthSearch {
  /** The day pressed, whose panel is open. */
  day?: DateKey;
  /** Quick add is open for that day. */
  add?: true;
}

// The month holding a date (PRD P7). The day pressed and quick add live in the URL,
// so the back gesture closes them.
export const Route = createFileRoute("/_app/month/$date")({
  beforeLoad: ({ params }) => {
    const date = parseDateKey(params.date);
    if (date === null) throw redirect({ to: "/month", replace: true });
    return { date };
  },
  validateSearch: (search: Record<string, unknown>): MonthSearch => {
    const day =
      typeof search.day === "string" ? parseDateKey(search.day) : null;
    if (day === null) return {};
    return search.add === true ? { day, add: true } : { day };
  },
  component: MonthRoute,
});

function MonthRoute() {
  const { date } = Route.useRouteContext();
  const { day, add } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const goTo = useCallback(
    (target: DateKey) =>
      void navigate({ to: "/month/$date", params: { date: target } }),
    [navigate],
  );
  const selectDay = useCallback(
    (target: DateKey) => void navigate({ search: { day: target } }),
    [navigate],
  );
  // Quick add replaces the day's panel, so closing it goes back to the month.
  const openAdd = useCallback(
    () =>
      void navigate({
        search: (prev) => ({ ...prev, add: true as const }),
        replace: true,
      }),
    [navigate],
  );
  const openDay = useCallback(
    (target: DateKey) =>
      void navigate({ to: "/day/$date", params: { date: target } }),
    [navigate],
  );
  const close = useCallback(() => {
    if (canGoBack) router.history.back();
    else void navigate({ search: {}, replace: true });
  }, [canGoBack, router, navigate]);

  return (
    <MonthScreen
      date={date}
      selected={day}
      adding={add === true}
      onGoTo={goTo}
      onSelectDay={selectDay}
      onAdd={openAdd}
      onOpenDay={openDay}
      onClose={close}
    />
  );
}
