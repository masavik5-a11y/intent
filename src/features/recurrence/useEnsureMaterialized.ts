import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { needsMaterializing } from "@shared/recurrence";
import type { DateKey } from "@shared/time";
import { api } from "@/lib/api";

/**
 * Repeating blocks on a date beyond the daily window (docs/ARCHITECTURE.md, section
 * 10): when a rule has not reached `through` yet, the server materialises it that far.
 * Asked once per date; a failure lets the next visit ask again.
 */
export function useEnsureMaterialized(through: DateKey): void {
  const rules = useQuery(api.recurrences.list);
  const materialize = useMutation(api.recurrences.materializeThrough);
  const needed = rules !== undefined && needsMaterializing(rules, through);
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!needed || asked.current.has(through)) return;
    asked.current.add(through);
    materialize({ date: through }).catch(() => {
      asked.current.delete(through);
    });
  }, [needed, through, materialize]);
}
