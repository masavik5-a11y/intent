import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  // Typed environment variables, read as `env` from ./_generated/server.
  // Set them with `npx convex env set NAME value` or in the Convex dashboard.
  env: {
    /** Comma-separated emails that may create an account. Unset or empty: nobody can. */
    ALLOWED_EMAILS: v.optional(v.string()),
  },
});

export default app;
