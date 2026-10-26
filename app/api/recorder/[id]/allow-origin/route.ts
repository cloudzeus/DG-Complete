import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { isPrivateHost } from "@/lib/engine/guard";
import { requireTenant } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { allowAndContinue, getSession, snapshot } from "@/lib/recorder/live";
import { tenantDb } from "@/lib/tenant-db";

// The page of the live recorder wanted to open an origin outside the target's allowlist and the
// user agreed: add it to TargetSystem.allowedOrigins (audited) and resume (docs/04 §10).
const Body = z.object({ tenantId: z.string().min(1), origin: z.url(), url: z.url() });
const problem = (status: number, title: string) => NextResponse.json({ type: "about:blank", title, status }, { status, headers: { "content-type": "application/problem+json", "cache-control": "no-store" } });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/recorder/[id]/allow-origin">) {
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return problem(422, "Μη έγκυρη διεύθυνση.");
  const { user } = await requireTenant(body.data.tenantId);
  if (!can(user, "tenant.targets.manage", body.data.tenantId)) return problem(403, "Χρειάζεται δικαίωμα διαχείρισης συστημάτων‑στόχων — ζητήστε από τον διαχειριστή να προσθέσει τη διεύθυνση.");
  const s = getSession(id, body.data.tenantId, user.id);
  if (!s) return problem(404, "Η καταγραφή έληξε ή δεν βρέθηκε.");
  const origin = new URL(body.data.origin).origin;
  if (!s.offered.has(origin) || new URL(body.data.url).origin !== origin) return problem(422, "Η διεύθυνση δεν ζητήθηκε από τη σελίδα.");
  const u = new URL(origin);
  if (!/^https?:$/.test(u.protocol) || isPrivateHost(u.hostname)) return problem(422, "Εσωτερικές διευθύνσεις δεν επιτρέπονται.");

  const db = tenantDb(body.data.tenantId);
  const target = await db.targetSystem.findUnique({ where: { id: s.targetId }, select: { id: true, name: true, baseUrl: true, allowedOrigins: true } });
  if (!target) return problem(404, "Το σύστημα δεν βρέθηκε.");
  // Stored like the UI does: host when the scheme matches the base URL, else the full origin.
  const entry = u.protocol === new URL(target.baseUrl).protocol ? u.host : origin;
  if (!target.allowedOrigins.includes(entry)) {
    await db.targetSystem.updateMany({ where: { id: target.id }, data: { allowedOrigins: [...target.allowedOrigins, entry] } });
    await audit({ actorId: user.id, action: "target.allow_origin", entity: "TargetSystem", entityId: target.id, tenantId: body.data.tenantId, meta: { origin, via: "live-recorder" } });
  }
  await allowAndContinue(s, origin, body.data.url);
  return NextResponse.json({ state: snapshot(s), message: `Το ${u.host} προστέθηκε στα επιτρεπτά του «${target.name}».` }, { headers: { "cache-control": "no-store" } });
}
