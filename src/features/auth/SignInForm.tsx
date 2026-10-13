import type { FormEvent } from "react";
import { MIN_PASSWORD_LENGTH } from "@shared/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthMode } from "./messages";

export interface Credentials {
  email: string;
  password: string;
}

interface SignInFormProps {
  mode: AuthMode;
  pending: boolean;
  error: string | null;
  onSubmit: (credentials: Credentials) => void;
  onModeChange: (mode: AuthMode) => void;
}

const COPY = {
  signIn: {
    title: "Sign in",
    submit: "Sign in",
    switchPrompt: "First time here?",
    switchAction: "Create the account",
  },
  signUp: {
    title: "Create the account",
    submit: "Create account",
    switchPrompt: "Already have it?",
    switchAction: "Sign in",
  },
} as const;

/** Email and password, for the one account (docs/DESIGN.md, section 7). */
export function SignInForm({
  mode,
  pending,
  error,
  onSubmit,
  onModeChange,
}: SignInFormProps) {
  const copy = COPY[mode];
  const signingUp = mode === "signUp";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    if (typeof email !== "string" || typeof password !== "string") return;
    onSubmit({ email, password });
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-base text-muted-foreground">Intent</p>
        <h1 className="text-2xl font-medium">{copy.title}</h1>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            className="h-11 sm:h-9"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={signingUp ? "new-password" : "current-password"}
            required
            minLength={signingUp ? MIN_PASSWORD_LENGTH : undefined}
            aria-describedby={signingUp ? "password-hint" : undefined}
            className="h-11 sm:h-9"
          />
          {signingUp && (
            <p id="password-hint" className="text-sm text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          )}
        </div>

        {error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="h-11 sm:h-9">
          {copy.submit}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {copy.switchPrompt}{" "}
        <button
          type="button"
          className="rounded-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => onModeChange(signingUp ? "signIn" : "signUp")}
        >
          {copy.switchAction}
        </button>
      </p>
    </div>
  );
}
