import { useQuery } from "convex/react";
import { gridDayOf } from "@shared/grid";
import { DEFAULT_SETTINGS } from "@shared/settings";
import type { DateKey } from "@shared/time";
import { api } from "./api";
import { useNow } from "./now";

/**
 * Today as the app means it: the day whose grid shows this minute. Until the grid's
 * start (05:00 by default) that is still yesterday, so after midnight the app stays
 * on the day that is ending (decided 2026-10-14, ARCHITECTURE.md section 16).
 * Undefined until the settings have loaded.
 */
export function useToday(): DateKey | undefined {
  const settings = useQuery(api.settings.get);
  const now = useNow();
  if (settings === undefined) return undefined;
  return gridDayOf(
    now,
    settings?.gridStartMin ?? DEFAULT_SETTINGS.gridStartMin,
  );
}
