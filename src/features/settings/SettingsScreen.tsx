import { useNavigate } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/** Settings. For now only the account; preferences arrive with their milestones. */
export function SettingsScreen() {
  const viewer = useQuery(api.users.viewer);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    // Land on a plain sign-in screen rather than one that leads back here.
    await navigate({ to: "/signin", replace: true });
  }

  return (
    <div className="flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-xl font-medium">Settings</h1>
      <AccountSection
        email={viewer?.email ?? null}
        onSignOut={() => void handleSignOut()}
      />
    </div>
  );
}

function AccountSection({
  email,
  onSignOut,
}: {
  email: string | null;
  onSignOut: () => void;
}) {
  return (
    <section className="flex flex-col items-start gap-3">
      <h2 className="text-lg font-medium">Account</h2>
      {/* Keeps its height while the email loads, so the button does not jump. */}
      <p className="min-h-5 text-muted-foreground">
        {email !== null && <>Signed in as {email}</>}
      </p>
      <Button variant="outline" className="h-11 sm:h-8" onClick={onSignOut}>
        Sign out
      </Button>
    </section>
  );
}
