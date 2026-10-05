import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  appName: "DGsmart BI",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Users are created by admins / invitations only — no public sign-up.
    disableSignUp: true,
    minPasswordLength: 10,
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
