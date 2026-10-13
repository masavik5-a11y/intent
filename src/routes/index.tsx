import { createFileRoute, redirect } from "@tanstack/react-router";
import { readNow } from "@/lib/now";

// The app opens on today (docs/DESIGN.md, section 1).
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({
      to: "/day/$date",
      params: { date: readNow().date },
      replace: true,
    });
  },
});
