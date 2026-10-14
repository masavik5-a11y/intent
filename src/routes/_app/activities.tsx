import {
  createFileRoute,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router";
import {
  ActivitiesScreen,
  type ActivitySelection,
} from "@/features/activities/ActivitiesScreen";

interface ActivitiesSearch {
  /** "new", or the id of the activity being edited. */
  activity?: string;
}

export const Route = createFileRoute("/_app/activities")({
  // The open editor is in the URL, so the back gesture on Android closes it.
  validateSearch: (search: Record<string, unknown>): ActivitiesSearch =>
    typeof search.activity === "string" ? { activity: search.activity } : {},
  component: ActivitiesRoute,
});

function ActivitiesRoute() {
  const { activity } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  function select(next: ActivitySelection) {
    if (next !== undefined) {
      void navigate({ search: { activity: next } });
    } else if (canGoBack) {
      // Opening pushed a history entry; closing pops it, as the back gesture would.
      router.history.back();
    } else {
      void navigate({ search: {}, replace: true });
    }
  }

  // An id that matches no activity opens nothing; the screen checks it.
  return (
    <ActivitiesScreen
      selection={activity as ActivitySelection}
      onSelect={select}
    />
  );
}
