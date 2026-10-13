import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import type { DataModel } from "./_generated/dataModel";
import { env } from "./_generated/server";
import { MIN_PASSWORD_LENGTH } from "../shared/errors";
import { isEmailAllowed, normalizeEmail } from "./lib/allowedEmails";
import { appError } from "./lib/errors";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      // Runs on every sign-in and sign-up, before any account is read or written.
      profile(params) {
        if (typeof params.email !== "string" || params.email.trim() === "") {
          throw appError("INVALID_EMAIL");
        }
        const email = normalizeEmail(params.email);
        // One account (PRD S3): only an allow-listed address may sign up. Rejecting
        // here means nothing is stored for anyone else.
        if (
          params.flow === "signUp" &&
          !isEmailAllowed(email, env.ALLOWED_EMAILS)
        ) {
          throw appError("SIGN_UP_CLOSED");
        }
        return { email };
      },
      // Called only when a password is being set.
      validatePasswordRequirements(password: unknown) {
        if (
          typeof password !== "string" ||
          password.length < MIN_PASSWORD_LENGTH
        ) {
          throw appError("WEAK_PASSWORD");
        }
      },
    }),
  ],
});
