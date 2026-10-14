import { createFileRoute } from "@tanstack/react-router";
import { FirstRunScreen } from "@/features/setup/FirstRunScreen";

export const Route = createFileRoute("/_app/welcome")({
  component: FirstRunScreen,
});
