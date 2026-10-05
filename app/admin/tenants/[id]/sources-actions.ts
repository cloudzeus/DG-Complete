"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { s1Authenticate, s1Login, sealSoftOneCredentials } from "@/lib/softone";
import { detectCapabilities, type Capabilities } from "@/lib/softone-detect";
import {
  parseSoftOneForm,
  PASSWORD_REQUIRED,
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
    if (input.company) await s1Authenticate({ ...input, password }, clientID);
    return { test: { ok: true, objs, authenticated: !!input.company } };
  } catch (err) {
    return { test: { ok: false, error: (err as Error).message.slice(0, 500) } };
  }
}

export async function saveTenantSoftOne(_prev: SoftOneFormState, fd: FormData): Promise<SoftOneFormState> {
  const tenantId = tenantIdOf(fd);
  const user = await requirePermission("connections.tenant.manage", tenantId);
  const parsed = parseSoftOneForm(fd);
  if (!parsed.success) return { errors: softOneErrors(parsed.error) };
  const input = parsed.data;
  if (!input.company) return { errors: { company: "Υποχρεωτικό" } };
  const password = await resolveSoftOnePassword(input, { scope: "TENANT", tenantId });
  if (password === null) return { errors: { password: PASSWORD_REQUIRED } };

  // A saved connection is always a working one.
  try {
    const { clientID } = await s1Login({ ...input, password });
    await s1Authenticate({ ...input, password }, clientID);
  } catch (err) {
    return { test: { ok: false, error: (err as Error).message.slice(0, 500) }, message: "Η σύνδεση δεν αποθηκεύτηκε." };
  }

  const existing = input.id
    ? await prisma.softOneConnection.findFirst({ where: { id: input.id, scope: "TENANT", tenantId }, select: { id: true } })
    : null;
  const id = existing?.id ?? randomUUID().replaceAll("-", "");
  const data = {
    name: "SoftOne πελάτη",
    baseUrl: input.baseUrl,
    appId: input.appId,
    company: input.company,
    branch: input.branch,
    module: input.module,
    refId: input.refId,
    credentialsEnc: sealSoftOneCredentials(id, { username: input.username, password }),
    sessionEnc: null,
    sessionDate: null,
    lastTestedAt: new Date(),
    lastTestStatus: "OK" as const,
    lastTestError: null,
  };
  if (existing) await prisma.softOneConnection.update({ where: { id }, data });
  else await prisma.softOneConnection.create({ data: { id, scope: "TENANT", tenantId, ...data } });

  await audit({
    actorId: user.id,
    action: existing ? "tenant.source.update" : "tenant.source.create",
    entity: "SoftOneConnection",
    entityId: id,
    tenantId,
    meta: { kind: "softone", baseUrl: input.baseUrl, company: input.company, passwordChanged: !!input.password },
  });

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
  return { ok: true, message: `Η σύνδεση με το SoftOne του πελάτη αποθηκεύτηκε.${note}` };
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
