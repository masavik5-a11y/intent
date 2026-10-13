import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { Button, buttonVariants } from "@/components/ui/button";

// Temporary: the scaffold's form on its own route. The real sign-in screen,
// route protection and sign-out placement come with the auth slice of M0.
export const Route = createFileRoute("/signin")({
  component: SignInRoute,
});

function SignInRoute() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-8">
      <h1 className="text-xl font-medium">Intent</h1>
      <Authenticated>
        <SignedIn />
      </Authenticated>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
    </main>
  );
}

function SignedIn() {
  const viewer = useQuery(api.users.viewer);
  const { signOut } = useAuthActions();
  return (
    <div className="flex flex-col items-start gap-4">
      <p>Signed in as {viewer?.email ?? "…"}</p>
      <div className="flex gap-2">
        <Link to="/" className={buttonVariants()}>
          Go to today
        </Link>
        <Button variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

function SignInForm() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        formData.set("flow", flow);
        setError(null);
        signIn("password", formData).catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "Sign-in failed.");
        });
      }}
    >
      <input
        className="rounded-md border p-2"
        type="email"
        name="email"
        placeholder="Email"
        autoComplete="email"
        required
      />
      <input
        className="rounded-md border p-2"
        type="password"
        name="password"
        placeholder="Password"
        autoComplete={flow === "signIn" ? "current-password" : "new-password"}
        required
      />
      <Button type="submit">{flow === "signIn" ? "Sign in" : "Sign up"}</Button>
      <button
        className="text-left text-sm underline"
        type="button"
        onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
      >
        {flow === "signIn" ? "Sign up instead" : "Sign in instead"}
      </button>
      {error !== null && <p className="text-sm">{error}</p>}
    </form>
  );
}
