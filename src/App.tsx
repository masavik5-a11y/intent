import { useState } from "react";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";

// Temporary shell from the scaffold. Replaced by the router and the real
// sign-in screen later in M0.
export default function App() {
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
    <div className="flex flex-col gap-4">
      <p>Signed in as {viewer?.email ?? "…"}</p>
      <button
        className="rounded-md border px-3 py-2"
        onClick={() => void signOut()}
      >
        Sign out
      </button>
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
      <button className="rounded-md border px-3 py-2" type="submit">
        {flow === "signIn" ? "Sign in" : "Sign up"}
      </button>
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
