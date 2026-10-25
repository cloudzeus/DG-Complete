"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, requireUser, type CurrentUser } from "@/lib/rbac";
import { openCredentials, sealCredentials, testConnection, type TestResult } from "@/lib/connections";

const schema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(2, "Δώστε όνομα").max(120),
    purpose: z.enum(["CUBE_WAREHOUSE", "TENANT_SOURCE"]),
    engine: z.enum(["POSTGRES", "MYSQL", "MSSQL"]),
    environment: z.enum(["PRODUCTION", "DEVELOPMENT"]),
    host: z.string().trim().min(1, "Δώστε host").max(255),
    port: z.coerce.number().int().min(1).max(65535),
    database: z.string().trim().min(1, "Δώστε βάση").max(128),
    username: z.string().trim().min(1, "Δώστε χρήστη").max(128),
    password: z.string().max(512),
    ssl: z.boolean(),
    tenantId: z.string().optional(),
  })
  .refine((v) => v.purpose !== "TENANT_SOURCE" || !!v.tenantId, {
    path: ["tenantId"],
    message: "Επιλέξτε πελάτη",
  });

type Input = z.infer<typeof schema>;

export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Partial<Record<keyof Input, string>>;
  test?: TestResult;
};

function parse(formData: FormData) {
  return schema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    purpose: formData.get("purpose"),
    engine: formData.get("engine"),
    environment: formData.get("environment") || "PRODUCTION",
    host: formData.get("host"),
    port: formData.get("port"),
    database: formData.get("database"),
    username: formData.get("username"),
    password: formData.get("password") ?? "",
    ssl: formData.get("ssl") === "on",
    tenantId: formData.get("tenantId") || undefined,
  });
}

function fieldErrors(error: z.ZodError<Input>): FormState["errors"] {
  const out: FormState["errors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof Input;
    out[key] ??= issue.message;
  }
  return out;
}

function canManage(user: CurrentUser, purpose: Input["purpose"]) {
  return can(user, purpose === "CUBE_WAREHOUSE" ? "connections.warehouse.manage" : "connections.tenant.manage");
}

/**
 * Resolves the password: a blank field on edit keeps the stored one — but only for a connection
 * the user may manage, and only while host/port/engine/username are unchanged, so a stored
 * password can never be replayed against a different server.
 */
async function resolvePassword(user: CurrentUser, input: Input): Promise<string | null> {
  if (input.password) return input.password;
  if (!input.id) return null;
  const existing = await prisma.dataConnection.findUnique({ where: { id: input.id } });
  if (!existing || !canManage(user, existing.purpose)) return null;
  const creds = openCredentials(existing.id, existing.credentialsEnc);
  const sameTarget =
    existing.host === input.host &&
    existing.port === input.port &&
    existing.engine === input.engine &&
    creds.username === input.username;
  return sameTarget ? creds.password : null;
}

const PASSWORD_REQUIRED = "Δώστε κωδικό (απαιτείται όταν αλλάζει server ή χρήστης)";

export async function saveConnection(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const input = parsed.data;
  if (!canManage(user, input.purpose)) return { message: "Δεν έχετε δικαίωμα για αυτή την ενέργεια." };

  const password = await resolvePassword(user, input);
  if (password === null) return { errors: { password: PASSWORD_REQUIRED } };

  const id = input.id ?? randomUUID().replaceAll("-", "");
  const data = {
    name: input.name,
    purpose: input.purpose,
    engine: input.engine,
    environment: input.environment,
    host: input.host,
    port: input.port,
    database: input.database,
    ssl: input.ssl,
    tenantId: input.purpose === "TENANT_SOURCE" ? input.tenantId! : null,
    credentialsEnc: sealCredentials(id, { username: input.username, password }),
  };

  if (input.id) {
    const existing = await prisma.dataConnection.findUnique({ where: { id: input.id }, select: { purpose: true } });
    if (!existing || !canManage(user, existing.purpose)) return { message: "Η σύνδεση δεν βρέθηκε." };
    await prisma.dataConnection.update({
      where: { id },
      data: { ...data, lastTestStatus: "UNTESTED", lastTestError: null, lastTestedAt: null },
    });
  } else {
    await prisma.dataConnection.create({ data: { ...data, id, createdById: user.id } });
  }

  await audit({
    actorId: user.id,
    action: input.id ? "connection.update" : "connection.create",
    entity: "DataConnection",
    entityId: id,
    tenantId: data.tenantId,
    meta: { name: input.name, host: input.host, database: input.database, passwordChanged: !!input.password },
  });
  revalidatePath("/admin/settings/connections");
  return { ok: true, message: "Η σύνδεση αποθηκεύτηκε." };
}

/** Tests the values currently in the form, before saving. */
export async function testConnectionDraft(formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const input = parsed.data;
  if (!canManage(user, input.purpose)) return { message: "Δεν έχετε δικαίωμα για αυτή την ενέργεια." };
  const password = await resolvePassword(user, input);
  if (password === null) return { errors: { password: PASSWORD_REQUIRED } };
  return { test: await testConnection({ ...input, password }) };
}

/** Tests a stored connection and records the outcome. */
export async function testStoredConnection(id: string): Promise<TestResult> {
  const user = await requireUser();
  const conn = await prisma.dataConnection.findUnique({ where: { id } });
  if (!conn || !canManage(user, conn.purpose)) return { ok: false, error: "Η σύνδεση δεν βρέθηκε." };
  const creds = openCredentials(conn.id, conn.credentialsEnc);
  const result = await testConnection({ ...conn, ...creds });
  await prisma.dataConnection.update({
    where: { id },
    data: {
      lastTestedAt: new Date(),
      lastTestStatus: result.ok ? "OK" : "FAILED",
      lastTestError: result.ok ? null : result.error,
    },
  });
  revalidatePath("/admin/settings/connections");
  return result;
}

export async function deleteConnection(id: string): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const conn = await prisma.dataConnection.findUnique({ where: { id }, select: { purpose: true, name: true, tenantId: true } });
  if (!conn || !canManage(user, conn.purpose)) return { ok: false, message: "Η σύνδεση δεν βρέθηκε." };
  await prisma.dataConnection.delete({ where: { id } });
  await audit({
    actorId: user.id,
    action: "connection.delete",
    entity: "DataConnection",
    entityId: id,
    tenantId: conn.tenantId,
    meta: { name: conn.name },
  });
  revalidatePath("/admin/settings/connections");
  return { ok: true, message: "Η σύνδεση διαγράφηκε." };
}
