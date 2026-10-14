import { useCallback } from "react";
import {
  createFileRoute,
  redirect,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router";
import { MINUTES_PER_DAY, parseDateKey } from "@shared/time";
import { DayScreen, type AddRequest } from "@/features/day/DayScreen";

interface DaySearch {
  /** Quick add is open: "now" for a suggested time, or the clicked grid position. */
  add?: "now" | number;
}

export const Route = createFileRoute("/_app/day/$date")({
  // The date lives in the URL (PRD T6). Anything that is not a real day goes to today.
  beforeLoad: ({ params }) => {
    const date = parseDateKey(params.date);
    if (date === null) throw redirect({ to: "/", replace: true });
    return { date };
  },
  validateSearch: (search: Record<string, unknown>): DaySearch => {
    const { add } = search;
    if (add === "now") return { add };
    if (typeof add === "number" && add >= 0 && add < MINUTES_PER_DAY) {
      return { add };
    }
    return {};
  },
  component: DayRoute,
});

function addRequest(add: DaySearch["add"]): AddRequest | undefined {
  if (add === undefined) return undefined;
  return { position: add === "now" ? null : add };
}

function DayRoute() {
  const { date } = Route.useRouteContext();
  const { add } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const openAdd = useCallback(
    (position: number | null) =>
      void navigate({ search: { add: position ?? "now" } }),
    [navigate],
  );

  // Opening pushed a history entry; closing pops it, as the back gesture would.
  const closeOverlay = useCallback(() => {
    if (canGoBack) router.history.back();
    else void navigate({ search: {}, replace: true });
  }, [canGoBack, router, navigate]);

  // Keyed by date so each day opens fresh: scrolled to its morning, or to now.
  return (
    <DayScreen
      key={date}
      date={date}
      add={addRequest(add)}
      onOpenAdd={openAdd}
      onCloseOverlay={closeOverlay}
    />
  );
}
