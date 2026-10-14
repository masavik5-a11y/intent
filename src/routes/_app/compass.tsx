import { createFileRoute } from "@tanstack/react-router";
import { CompassScreen } from "@/features/compass/CompassScreen";

export const Route = createFileRoute("/_app/compass")({
  component: CompassScreen,
});
