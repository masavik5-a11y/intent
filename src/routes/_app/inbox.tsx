import { useCallback } from "react";
import {
  createFileRoute,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router";
import { parseDateKey, type DateKey } from "@shared/time";
import { InboxScreen } from "@/features/inbox/InboxScreen";

interface InboxSearch {
  /** The item being scheduled. */
  schedule?: string;
  /** The day chosen for it. */
  day?: DateKey;
}

// Things captured without a date (PRD P8). Scheduling lives in the URL, so the back
// gesture steps out of it.
export const Route = createFileRoute("/_app/inbox")({
  validateSearch: (search: Record<string, unknown>): InboxSearch => {
    if (typeof search.schedule !== "string") return {};
    const day =
      typeof search.day === "string" ? parseDateKey(search.day) : null;
    return day === null
      ? { schedule: search.schedule }
      : { schedule: search.schedule, day };
  },
  component: InboxRoute,
});

function InboxRoute() {
  const { schedule, day } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const startScheduling = useCallback(
    (itemId: string) => void navigate({ search: { schedule: itemId } }),
    [navigate],
  );
  // The time step replaces the day step, so closing it returns to the list.
  const chooseDay = useCallback(
    (chosen: DateKey) =>
      void navigate({
        search: (prev) => ({ ...prev, day: chosen }),
        replace: true,
      }),
    [navigate],
  );
  const close = useCallback(() => {
    if (canGoBack) router.history.back();
    else void navigate({ search: {}, replace: true });
  }, [canGoBack, router, navigate]);
  return (
    <InboxScreen
      scheduling={schedule}
      day={day}
      onSchedule={startScheduling}
      onChooseDay={chooseDay}
      onClose={close}
    />
  );
}
