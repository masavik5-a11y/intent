import { useCallback } from "react";
import {
  createFileRoute,
  redirect,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router";
import { MINUTES_PER_DAY, parseDateKey, type DateKey } from "@shared/time";
import { DayScreen, type AddRequest } from "@/features/day/DayScreen";
import { isReviewStep, type ReviewStep } from "@/features/review/reviewView";

interface DaySearch {
  /** Quick add is open: "now" for a suggested time, or the clicked grid position. */
  add?: "now" | number;
  /** The block whose detail is open. */
  block?: string;
  /**
   * Logging an unplanned entry is open: "now" for "from the last entry until now", or
   * the clicked grid position in the actual lane.
   */
  log?: "now" | number;
  /** "Not feeling it" is open for this block (PRD V2). */
  notFeeling?: string;
  /**
   * The evening review is open at this step (PRD R1). It stays while a block, quick
   * add or logging is opened from it, so closing those returns to the review.
   */
  review?: ReviewStep;
}

export const Route = createFileRoute("/_app/day/$date")({
  // The date lives in the URL (PRD T6). Anything that is not a real day goes to today.
  beforeLoad: ({ params }) => {
    const date = parseDateKey(params.date);
    if (date === null) throw redirect({ to: "/", replace: true });
    return { date };
  },
  validateSearch: (search: Record<string, unknown>): DaySearch => {
    const { add, block, log, notFeeling, review } = search;
    const base: DaySearch = isReviewStep(review) ? { review } : {};
    if (typeof block === "string") return { ...base, block };
    if (typeof notFeeling === "string") return { notFeeling };
    if (add === "now") return { ...base, add };
    if (typeof add === "number" && add >= 0 && add < MINUTES_PER_DAY) {
      return { ...base, add };
    }
    if (log === "now") return { ...base, log };
    if (typeof log === "number" && log >= 0 && log < MINUTES_PER_DAY) {
      return { ...base, log };
    }
    return base;
  },
  component: DayRoute,
});

/** What an overlay in the URL was opened for: a grid position, or nothing in particular. */
function positionRequest(
  value: "now" | number | undefined,
): AddRequest | undefined {
  if (value === undefined) return undefined;
  return { position: value === "now" ? null : value };
}

function DayRoute() {
  const { date } = Route.useRouteContext();
  const { add, block, log, notFeeling, review } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const openAdd = useCallback(
    (position: number | null) =>
      void navigate({
        search: (prev) => ({ review: prev.review, add: position ?? "now" }),
      }),
    [navigate],
  );

  const openLog = useCallback(
    (position: number | null) =>
      void navigate({
        search: (prev) => ({ review: prev.review, log: position ?? "now" }),
      }),
    [navigate],
  );

  const openNotFeeling = useCallback(
    (blockId: string) => void navigate({ search: { notFeeling: blockId } }),
    [navigate],
  );

  // Choosing another block while one is open replaces it, so closing goes straight
  // back to the plain day.
  const openBlock = useCallback(
    (blockId: string) =>
      void navigate({
        search: (prev) => ({ review: prev.review, block: blockId }),
        replace: block !== undefined,
      }),
    [navigate, block],
  );

  const openReview = useCallback(
    () => void navigate({ search: { review: "resolve" } }),
    [navigate],
  );

  // Steps replace each other, so closing the review goes straight back to the day.
  const reviewStep = useCallback(
    (step: ReviewStep) =>
      void navigate({ search: { review: step }, replace: true }),
    [navigate],
  );

  // The review hands over to planning the next day; back returns to the day itself.
  const planDay = useCallback(
    (day: DateKey) =>
      void navigate({
        to: "/plan/$date",
        params: { date: day },
        replace: true,
      }),
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
      add={positionRequest(add)}
      onOpenAdd={openAdd}
      log={positionRequest(log)}
      onOpenLog={openLog}
      notFeelingId={notFeeling}
      onOpenNotFeeling={openNotFeeling}
      selectedBlockId={block}
      onSelectBlock={openBlock}
      onCloseOverlay={closeOverlay}
      review={review}
      onOpenReview={openReview}
      onReviewStep={reviewStep}
      onPlanDay={planDay}
    />
  );
}
