import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/features/shell/AppShell";

// Pathless layout: every screen inside the app shell is a child of this route.
export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
