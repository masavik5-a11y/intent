import { useEffect } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { safeRedirectPath } from "@/features/auth/redirect";
import { SignInScreen } from "@/features/auth/SignInScreen";

interface SignInSearch {
  /** The in-app address that asked for the sign-in. */
  redirect?: string;
}

export const Route = createFileRoute("/signin")({
  validateSearch: (search: Record<string, unknown>): SignInSearch =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  component: SignInRoute,
});

function SignInRoute() {
  const { redirect } = Route.useSearch();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();

  // Signed in, whether just now or already: leave for where the visit was headed.
  useEffect(() => {
    if (isAuthenticated) router.history.replace(safeRedirectPath(redirect));
  }, [isAuthenticated, redirect, router]);

  if (isLoading || isAuthenticated) return null;
  return <SignInScreen />;
}
