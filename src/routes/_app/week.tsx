import { createFileRoute } from "@tanstack/react-router";
import { ScreenPlaceholder } from "@/features/shell/ScreenPlaceholder";

export const Route = createFileRoute("/_app/week")({
  component: () => <ScreenPlaceholder title="Week" milestone="M7" />,
});
