import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Repeating blocks for a rolling window (docs/ARCHITECTURE.md, section 10): once a
// day, through UTC today + 15, which covers today + 14 in every time zone. Off the
// hour, where most scheduled work lands.
crons.cron(
  "materialise repeating blocks",
  "17 2 * * *",
  internal.recurrences.materializeAll,
  {},
);

export default crons;
