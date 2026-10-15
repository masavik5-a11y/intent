import { useCallback, useEffect } from "react";
import {
  createFileRoute,
  redirect,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router";
import { MINUTES_PER_DAY, parseDateKey } from "@shared/time";
import type { AddRequest } from "@/features/day/DayScreen";
import { PlanScreen } from "@/features/planning/PlanScreen";
import { useToday } from "@/lib/useToday";

interface PlanSearch {
  /** Quick add is open: "now" for a suggested time, or the clicked grid position. */
  add?: "now" | number;
  /** The block whose detail is open. */
  block?: string;
  /** "Copy from a date" is open. */
  copy?: true;
}

// Planning a day ahead (PRD P1, DESIGN.md section 7): its plan lane, its main focus,
// and "Copy from a date". The date is in the URL like the day view's.
export const Route = createFileRoute("/_app/plan/$date")({
  beforeLoad: ({ params }) => {
    const date = parseDateKey(params.date);
    if (date === null) throw redirect({ to: "/", replace: true });
    return { date };
  },
  validateSearch: (search: Record<string, unknown>): PlanSearch => {
    const { add, block, copy } = search;
    if (typeof block === "string") return { block };
    if (copy === true) return { copy };
    if (add === "now") return { add };
    if (typeof add === "number" && add >= 0 && add < MINUTES_PER_DAY) {
      return { add };
    }
    return {};
  },
  component: PlanRoute,
});

function PlanRoute() {
  const { date } = Route.useRouteContext();
  const { add, block, copy } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const today = useToday();

  // A day that is over is looked back at, not planned.
  useEffect(() => {
    if (today !== undefined && date < today) {
      void navigate({ to: "/day/$date", params: { date }, replace: true });
    }
  }, [today, date, navigate]);

  const openAdd = useCallback(
    (position: number | null) =>
      void navigate({ search: { add: position ?? "now" } }),
    [navigate],
  );
  const openBlock = useCallback(
    (blockId: string) =>
      void navigate({
        search: { block: blockId },
        replace: block !== undefined,
      }),
    [navigate, block],
  );
  const openCopy = useCallback(
    () => void navigate({ search: { copy: true } }),
    [navigate],
  );
  // Opening pushed a history entry; closing pops it, as the back gesture would.
  const closeOverlay = useCallback(() => {
    if (canGoBack) router.history.back();
    else void navigate({ search: {}, replace: true });
  }, [canGoBack, router, navigate]);

  const addRequest: AddRequest | undefined =
    add === undefined ? undefined : { position: add === "now" ? null : add };

  return (
    <PlanScreen
      key={date}
      date={date}
      add={addRequest}
      onOpenAdd={openAdd}
      selectedBlockId={block}
      onSelectBlock={openBlock}
      copyOpen={copy === true}
      onOpenCopy={openCopy}
      onCloseOverlay={closeOverlay}
    />
  );
}
