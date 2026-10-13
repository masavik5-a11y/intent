import { useState } from "react";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";

// Temporary shell from the scaffold. Replaced by the router and the real
// sign-in screen later in M0.
export default function App() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <h1 className="text-xl font-medium">Intent</h1>
      <Authenticated>
        <SignedIn />
      </Authenticated>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
      <ThemePreview />
    </main>
  );
}

const COLOR_KEYS = [
  "violet",
  "teal",
  "coral",
  "pink",
  "amber",
  "gray",
  "slate",
  "red",
];

// Temporary: shows the design tokens so they can be checked by eye.
function ThemePreview() {
  return (
    <section className="flex flex-col gap-4">
      <p className="font-voice text-lg">
        Energy for the camera. I keep promises to myself.
      </p>
      <div className="flex flex-col gap-1">
        <span className="text-xs">12 px caption</span>
        <span className="text-sm">13 px secondary</span>
        <span className="text-base">14 px interface</span>
        <span className="text-lg">16 px body</span>
        <span className="text-xl font-medium">20 px heading</span>
        <span className="text-2xl font-medium">28 px display</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {COLOR_KEYS.map((key) => (
          <div key={key} data-color={key} className="flex gap-2">
            <div className="flex-1 rounded-block bg-key-tint p-2 text-key-ink">
              {key}
            </div>
            <div className="flex-1 rounded-block bg-key-solid p-2 text-on-solid">
              current
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-panel border p-4 text-muted-foreground">
        Panel, 14 px radius
      </div>
    </section>
  );
}

function SignedIn() {
  const viewer = useQuery(api.users.viewer);
  const { signOut } = useAuthActions();
  return (
    <div className="flex flex-col gap-4">
      <p>Signed in as {viewer?.email ?? "…"}</p>
      <Button variant="outline" onClick={() => void signOut()}>
        Sign out
      </Button>
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
