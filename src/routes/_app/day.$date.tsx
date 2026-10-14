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
  /** The block whose detail is open. */
  block?: string;
}

export const Route = createFileRoute("/_app/day/$date")({
  // The date lives in the URL (PRD T6). Anything that is not a real day goes to today.
  beforeLoad: ({ params }) => {
    const date = parseDateKey(params.date);
    if (date === null) throw redirect({ to: "/", replace: true });
    return { date };
  },
  validateSearch: (search: Record<string, unknown>): DaySearch => {
    const { add, block } = search;
    if (typeof block === "string") return { block };
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
  const { add, block } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const openAdd = useCallback(
    (position: number | null) =>
      void navigate({ search: { add: position ?? "now" } }),
    [navigate],
  );

  // Choosing another block while one is open replaces it, so closing goes straight
  // back to the plain day.
  const openBlock = useCallback(
    (blockId: string) =>
      void navigate({
        search: { block: blockId },
        replace: block !== undefined,
      }),
    [navigate, block],
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
      selectedBlockId={block}
      onSelectBlock={openBlock}
      onCloseOverlay={closeOverlay}
    />
  );
}
