import { defineSchema } from "convex/server";
import { authTables } from "@convex-dev/auth/server";

// Tables are added in the milestone that needs them (see docs/ARCHITECTURE.md, section 5).
export default defineSchema({
  ...authTables,
});
