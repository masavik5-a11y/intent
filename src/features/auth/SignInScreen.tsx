import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { errorCodeFrom } from "@/lib/errors";
import { authErrorMessage, type AuthMode } from "./messages";
import { SignInForm, type Credentials } from "./SignInForm";

/**
 * Owns the sign-in and sign-up calls. Navigation after success is the route's job:
 * it reacts to the session appearing.
 */
export function SignInScreen() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit({ email, password }: Credentials) {
    setPending(true);
    setError(null);
    try {
      await signIn("password", { email, password, flow: mode });
    } catch (cause) {
      setError(authErrorMessage(mode, errorCodeFrom(cause)));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <SignInForm
        mode={mode}
        pending={pending}
        error={error}
        onSubmit={(credentials) => void submit(credentials)}
        onModeChange={(next) => {
          setMode(next);
          setError(null);
        }}
      />
    </main>
  );
}
