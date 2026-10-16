import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AdaptiveDialog } from "@/components/AdaptiveDialog";
import { useIsPhone } from "@/lib/useMediaQuery";
import { appCommand, SHORTCUT_GROUPS, shortcutsPaused } from "./shortcuts";

/**
 * The keys that work anywhere: T goes to today and ? shows every shortcut (DESIGN.md
 * section 8). Mounted once, in the app shell.
 */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const isPhone = useIsPhone();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || shortcutsPaused(event.target)) return;
      const command = appCommand(event);
      if (command === null) return;
      event.preventDefault();
      if (command === "help") setOpen(true);
      else void navigate({ to: "/" });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  return (
    <AdaptiveDialog
      open={open}
      isPhone={isPhone}
      onClose={() => setOpen(false)}
      title="Keyboard shortcuts"
      description="They rest while you type in a field."
    >
      <div className="flex flex-col gap-5">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{group.title}</h3>
            <dl className="flex flex-col gap-1.5">
              {group.rows.map((row) => (
                <div key={row.does} className="flex items-baseline gap-3">
                  <dt className="flex w-24 shrink-0 gap-1">
                    {row.keys.map((key) => (
                      <kbd
                        key={key}
                        className="min-w-6 rounded-sm border bg-muted px-1.5 py-0.5 text-center font-sans text-xs"
                      >
                        {key}
                      </kbd>
                    ))}
                  </dt>
                  <dd className="text-sm text-muted-foreground">{row.does}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </AdaptiveDialog>
  );
}
