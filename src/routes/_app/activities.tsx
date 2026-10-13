import { createFileRoute } from "@tanstack/react-router";
import { ScreenPlaceholder } from "@/features/shell/ScreenPlaceholder";

export const Route = createFileRoute("/_app/activities")({
  component: () => <ScreenPlaceholder title="Activities" milestone="M1" />,
});
