import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/api";

/** The device's IANA time zone, e.g. "Europe/Prague". */
function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Makes sure the signed-in user has settings and categories: on the very first visit
 * this creates them, with this device's time zone. Mount it once, inside the signed-in
 * part of the app. Safe to run again: the server changes nothing the second time.
 */
export function useEnsureSetup(): void {
  const ensure = useMutation(api.setup.ensure);
  useEffect(() => {
    ensure({ timeZone: deviceTimeZone() }).catch((error: unknown) => {
      // Screens wait for the data and the next visit tries again.
      console.error("Setting up the account failed", error);
    });
  }, [ensure]);
}
