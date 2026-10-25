"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { s1Authenticate, s1Login } from "@/lib/softone";
import { detectCapabilities, type Capabilities } from "@/lib/softone-detect";
import { seedTenantJobs } from "@/lib/softone-sync";
import {
  parseSoftOneForm,
  PASSWORD_REQUIRED,
  resolveSoftOneIds,
  saveSoftOneDraft,
  resolveSoftOnePassword,
  softOneErrors,
  type SoftOneFormState,
} from "@/lib/softone-form";

// A tenant's own SoftOne installation (scope TENANT) — the data source for its BI.

const refresh = (tenantId: string) => revalidatePath(`/admin/tenants/${tenantId}`);

function tenantIdOf(fd: FormData) {
  const id = String(fd.get("tenantId") ?? "");
  if (!id) throw new Error("Λείπει ο tenant.");
  return id;
}

export async function testTenantSoftOne(fd: FormData): Promise<SoftOneFormState> {
  const tenantId = tenantIdOf(fd);
  await requirePermission("connections.tenant.manage", tenantId);
  const parsed = parseSoftOneForm(fd);
  if (!parsed.success) return { errors: softOneErrors(parsed.error) };
  const input = parsed.data;
  const password = await resolveSoftOnePassword(input, { scope: "TENANT", tenantId });
  if (password === null) return { errors: { password: PASSWORD_REQUIRED } };
  try {
    const { clientID, objs } = await s1Login({ ...input, password });
    const r = resolveSoftOneIds(input, objs);
    if (!r.ok) return { test: { ok: true, objs, authenticated: false }, errors: { company: r.error } };
    await s1Authenticate({ ...input, ...r.ids, password }, clientID);
    return { test: { ok: true, objs, authenticated: true }, resolved: r.auto ? r.ids : undefined };
  } catch (err) {
    return { test: { ok: false, error: (err as Error).message.slice(0, 500) } };
  }
}

export async function saveTenantSoftOne(_prev: SoftOneFormState, fd: FormData): Promise<SoftOneFormState> {
  const tenantId = tenantIdOf(fd);
  const user = await requirePermission("connections.tenant.manage", tenantId);
  const r = await saveSoftOneDraft(fd, { scope: "TENANT", tenantId }, "SoftOne πελάτη");
  const id = r.id;
  await audit({
    actorId: user.id,
    action: r.created ? "tenant.source.create" : "tenant.source.update",
    entity: "SoftOneConnection",
    entityId: id,
    tenantId,
    meta: { kind: "softone", baseUrl: r.baseUrl, company: r.ids.company, verified: r.verified, passwordChanged: r.passwordChanged },
  });
  if (!r.verified) {
    refresh(tenantId);
    return r.state;
  }

  // Find out right away what this installation contains.
  let note = "";
  try {
    const caps = await detectCapabilities(id);
    note =
      caps.recommended === "GL"
        ? " Βρέθηκε Γενική Λογιστική."
        : caps.recommended === "COMMERCIAL"
          ? " Βρέθηκαν μόνο εμπορικά παραστατικά (χωρίς Γενική Λογιστική)."
          : " Δεν βρέθηκαν κινήσεις τον προηγούμενο μήνα.";
  } catch {
    note = " Η ανίχνευση δεδομένων θα γίνει αργότερα.";
  }
  refresh(tenantId);
  const company = r.state.resolved ? ` Εταιρεία σύνδεσης: ${r.ids.company} (η μόνη του λογαριασμού).` : "";
  return { ...r.state, ok: true, message: `Η σύνδεση με το SoftOne του πελάτη αποθηκεύτηκε.${company}${note}` };
}

export async function redetectTenantSoftOne(
  tenantId: string,
  connectionId: string,
): Promise<{ ok: true; capabilities: Capabilities } | { ok: false; message: string }> {
  await requirePermission("connections.tenant.manage", tenantId);
  const conn = await prisma.softOneConnection.findFirst({ where: { id: connectionId, scope: "TENANT", tenantId } });
  if (!conn) return { ok: false, message: "Η σύνδεση δεν βρέθηκε." };
  try {
    const capabilities = await detectCapabilities(conn.id);
    refresh(tenantId);
    return { ok: true, capabilities };
  } catch (err) {
    return { ok: false, message: (err as Error).message.slice(0, 400) };
  }
}

export async function deleteTenantSoftOne(tenantId: string, connectionId: string): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("connections.tenant.manage", tenantId);
  const deleted = await prisma.softOneConnection.deleteMany({ where: { id: connectionId, scope: "TENANT", tenantId } });
  if (!deleted.count) return { ok: false, message: "Η σύνδεση δεν βρέθηκε." };
  await audit({ actorId: user.id, action: "tenant.source.delete", entity: "SoftOneConnection", entityId: connectionId, tenantId });
  refresh(tenantId);
  return { ok: true, message: "Η σύνδεση διαγράφηκε. Τα δεδομένα που έχουν ήδη αντληθεί παραμένουν." };
}

/** Creates (verified) warehouse imports from the tenant's SoftOne — GL and/or commercial per detection. */
export async function createTenantJobs(
  tenantId: string,
  connectionId: string,
): Promise<{ ok: true; report: Awaited<ReturnType<typeof seedTenantJobs>> } | { ok: false; message: string }> {
  const user = await requirePermission("connections.tenant.manage", tenantId);
  const conn = await prisma.softOneConnection.findFirst({ where: { id: connectionId, scope: "TENANT", tenantId } });
  if (!conn) return { ok: false, message: "Η σύνδεση δεν βρέθηκε." };
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { warehouseStatus: true } });
  if (tenant?.warehouseStatus !== "READY" && tenant?.warehouseStatus !== "DISABLED") {
    return { ok: false, message: "Κάντε πρώτα Provisioning της αποθήκης δεδομένων του tenant." };
  }
  try {
    if (!conn.capabilities) await detectCapabilities(conn.id);
    const report = await seedTenantJobs(conn.id);
    await audit({
      actorId: user.id,
      action: "sync.job.seed",
      entity: "SyncJob",
      tenantId,
      meta: { created: report.filter((r) => r.status === "created").map((r) => r.name) },
    });
    refresh(tenantId);
    return { ok: true, report };
  } catch (err) {
    return { ok: false, message: (err as Error).message.slice(0, 400) };
  }
}
