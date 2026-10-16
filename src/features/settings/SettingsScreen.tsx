import { useNavigate } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import {
  setThemeChoice,
  THEME_CHOICES,
  useThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Settings. The account and the theme; other preferences arrive with their milestones. */
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
    <div className="flex max-w-md flex-col gap-8 p-4 sm:p-6">
      <h1 className="text-xl font-medium">Settings</h1>
      <AppearanceSection />
      <section className="hidden flex-col gap-1 sm:flex">
        <h2 className="text-lg font-medium">Keyboard</h2>
        <p className="text-sm text-muted-foreground">
          Press{" "}
          <kbd className="rounded-sm border bg-muted px-1.5 text-xs">?</kbd>{" "}
          anywhere to see the shortcuts. A normal day runs from the keyboard
          alone.
        </p>
      </section>
      <AccountSection
        email={viewer?.email ?? null}
        onSignOut={() => void handleSignOut()}
      />
    </div>
  );
}

const THEME_LABELS: Record<ThemeChoice, string> = {
  system: "Like this device",
  light: "Light",
  dark: "Dark",
};

function AppearanceSection() {
  const choice = useThemeChoice();
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Appearance</h2>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="flex w-full rounded-block border p-1 sm:w-auto sm:self-start"
      >
        {THEME_CHOICES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === choice}
            onClick={() => setThemeChoice(option)}
            className={cn(
              "h-11 flex-1 rounded-[calc(var(--radius-block)-4px)] px-3 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-8 sm:flex-none",
              option === choice
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {THEME_LABELS[option]}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Chosen for this device only.
      </p>
    </section>
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
