import { useEffect } from "react";
import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { signInSearchFor } from "@/features/auth/redirect";
import { useEnsureSetup } from "@/features/setup/useEnsureSetup";
import { AppShell } from "@/features/shell/AppShell";

// Pathless layout: every screen inside the app shell is a child of this route, and
// every one of them needs a session.
export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const signedOut = !isLoading && !isAuthenticated;

  // Runs once per signed-out episode. The location is read here rather than through
  // a hook on purpose: see signInSearchFor for what goes wrong otherwise.
  useEffect(() => {
    if (!signedOut) return;
    const search = signInSearchFor(router.state.location);
    if (search === null) return;
    void router.navigate({ to: "/signin", search, replace: true });
  }, [signedOut, router]);

  // While the session is being restored the shell is already there and the screen
  // is empty: no full-page spinner (docs/DESIGN.md, section 10). Screens mount only
  // with a session, so their queries never run signed out.
  if (signedOut) return null;
  return <AppShell>{isAuthenticated ? <SignedIn /> : null}</AppShell>;
}

function SignedIn() {
  useEnsureSetup();
  return <Outlet />;
}
