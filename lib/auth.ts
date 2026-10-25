import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { sendPasswordResetEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  appName: "DG Complete",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Users are created by admins / invitations only — no public sign-up.
    disableSignUp: true,
    minPasswordLength: 10,
    // «Ξεχάσατε τον κωδικό;» → email (Mailgun) with a link valid for 1 hour; all sessions end on reset.
    resetPasswordTokenExpiresIn: 3600,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const r = await sendPasswordResetEmail(user, url);
      if (!r.ok && !r.skipped) console.error("[email] password reset failed:", r.error);
    },
  },
  user: {
    additionalFields: {
      platformRole: { type: "string", input: false, defaultValue: "USER" },
      active: { type: "boolean", input: false, defaultValue: true },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    database: { generateId: false },
  },
  plugins: [nextCookies()],
});
