"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { validate, type FormState } from "@/lib/forms";

// Account flows as Server Actions (ADR-023): Better Auth runs on the server and the nextCookies
// plugin sets the session cookie. The browser only posts the form.

const email = z.email({ message: "Μη έγκυρο email" });
const password = z.string().min(10, "Τουλάχιστον 10 χαρακτήρες");

const safeNext = (next: string) => (next.startsWith("/") && !next.startsWith("//") ? next : "/");

export async function signInAction(next: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const v = validate(z.object({ email, password: z.string().min(1, "Συμπληρώστε τον κωδικό") }), fd);
  if ("state" in v) return v.state;
  try {
    await auth.api.signInEmail({ body: { email: v.data.email, password: v.data.password }, headers: await headers() });
  } catch (err) {
    if (isAPIError(err) && (err.statusCode === 401 || err.status === "UNAUTHORIZED")) return { ok: false, message: "Λάθος email ή κωδικός." };
    return { ok: false, message: "Η σύνδεση απέτυχε. Δοκιμάστε ξανά." };
  }
  redirect(safeNext(next));
}

export async function microsoftSignInAction(next: string): Promise<FormState> {
  if (!process.env.MICROSOFT_CLIENT_ID) return { ok: false, message: "Η σύνδεση με Microsoft δεν έχει ρυθμιστεί ακόμα." };
  // Wired in P03 (Entra ID social provider): auth.api.signInSocial → redirect(url).
  return { ok: false, message: `Η σύνδεση με Microsoft ενεργοποιείται σύντομα (${safeNext(next)}).` };
}

export async function forgotPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = validate(z.object({ email }), fd);
  if ("state" in v) return v.state;
  try {
    await auth.api.requestPasswordReset({ body: { email: v.data.email, redirectTo: "/reset-password" }, headers: await headers() });
  } catch (err) {
    // Same answer whether the account exists or not (no account enumeration).
    if (!(isAPIError(err) && err.statusCode === 404)) return { ok: false, message: "Το αίτημα απέτυχε, δοκιμάστε ξανά." };
  }
  return { ok: true, message: v.data.email };
}

const newPassword = z
  .object({ password, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Οι δύο κωδικοί δεν ταιριάζουν" });

export async function resetPasswordAction(token: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const v = validate(newPassword, fd);
  if ("state" in v) return v.state;
  try {
    await auth.api.resetPassword({ body: { newPassword: v.data.password, token } });
  } catch (err) {
    if (isAPIError(err)) return { ok: false, message: "Ο σύνδεσμος έληξε ή δεν είναι έγκυρος — ζητήστε νέο." };
    return { ok: false, message: "Η αλλαγή απέτυχε." };
  }
  redirect("/login?reset=1");
}

/** Accepting an invitation sets the first password (invitations themselves arrive with P03). */
export async function acceptInviteAction(token: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const v = validate(newPassword.and(z.object({ name: z.string().trim().min(2, "Συμπληρώστε το ονοματεπώνυμο") })), fd);
  if ("state" in v) return v.state;
  return resetPasswordAction(token, _prev, fd);
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = validate(z.object({ current: z.string().min(1, "Συμπληρώστε τον τρέχοντα κωδικό") }).and(newPassword), fd);
  if ("state" in v) return v.state;
  try {
    await auth.api.changePassword({ body: { currentPassword: v.data.current, newPassword: v.data.password, revokeOtherSessions: true }, headers: await headers() });
  } catch (err) {
    if (isAPIError(err)) return { ok: false, errors: { current: "Λάθος τρέχων κωδικός" }, message: "Ο κωδικός δεν άλλαξε." };
    return { ok: false, message: "Ο κωδικός δεν άλλαξε." };
  }
  return { ok: true, message: "Ο κωδικός άλλαξε. Οι άλλες συνδέσεις σας τερματίστηκαν." };
}

export async function updateProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = validate(z.object({ name: z.string().trim().min(2, "Συμπληρώστε το ονοματεπώνυμο") }), fd);
  if ("state" in v) return v.state;
  await auth.api.updateUser({ body: { name: v.data.name }, headers: await headers() });
  return { ok: true, message: "Τα στοιχεία σας αποθηκεύτηκαν." };
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
