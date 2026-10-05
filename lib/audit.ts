import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

export async function audit(entry: {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string;
  tenantId?: string | null;
  meta?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({ data: { ...entry, tenantId: entry.tenantId ?? null } });
}
