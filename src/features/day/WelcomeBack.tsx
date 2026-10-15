import { Link } from "@tanstack/react-router";
import type { DateKey } from "@shared/time";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * After days away (decided 2026-10-15; DESIGN.md section 9): today's plan, and one
 * friendly line that leads to planning today. Nothing about the days in between.
 */
export function WelcomeBack({
  today,
  onDismiss,
}: {
  today: DateKey;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label="Welcome back"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3"
    >
      <p className="min-w-0 flex-1 font-voice text-lg">
        Welcome back. Plan today?
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-11 sm:h-9"
          onClick={onDismiss}
        >
          Not now
        </Button>
        <Link
          to="/plan/$date"
          params={{ date: today }}
          className={cn(buttonVariants(), "h-11 sm:h-9")}
        >
          Plan today
        </Link>
      </div>
    </section>
  );
}
