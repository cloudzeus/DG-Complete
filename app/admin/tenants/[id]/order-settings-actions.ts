"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/audit";
import { getBiSettings } from "@/lib/bi-marts";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { s1GetTable } from "@/lib/softone";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Where purchase orders created from the order suggestions go in the tenant's SoftOne.

export type OrderOptions = {
  series: { id: number; label: string }[];
  warehouses: { id: number; label: string }[];
  current: { series: number[]; warehouse: number | null };
  error?: string;
};

export async function loadOrderOptions(tenantId: string): Promise<OrderOptions> {
  await requirePermission("connections.tenant.manage", tenantId);
  const settings = await getBiSettings(tenantId);
  const current = { series: (Array.isArray(settings.purchaseOrderSeries) ? settings.purchaseOrderSeries : []).map((s) => s.id), warehouse: settings.orderWarehouse ?? settings.mainWarehouses[0] ?? null };
  const conn = await prisma.softOneConnection.findFirst({ where: { scope: "TENANT", tenantId, lastTestStatus: "OK" }, select: { id: true, company: true } });
  if (!conn) return { series: [], warehouses: [], current, error: "Χρειάζεται ενεργή σύνδεση με το SoftOne του πελάτη." };
  try {
    const company = /^\d+$/.test(conn.company) ? ` AND COMPANY=${conn.company}` : "";
    const [series, warehouses] = await Promise.all([
      s1GetTable(conn.id, "SERIES", ["SERIES", "CODE", "NAME"], `SOSOURCE=1251 AND ISACTIVE=1${company}`),
      withWarehouse(async (db) => (await db.query(`SELECT whouse, name FROM "${schemaName(tenantId)}".warehouses ORDER BY whouse`)).rows),
    ]);
    return {
      current,
      series: series.map((s) => ({ id: Number(s.SERIES), label: `${s.SERIES} · ${s.NAME ?? s.CODE ?? ""}`.trim() })).filter((s) => Number.isFinite(s.id)),
      warehouses: warehouses.map((w) => ({ id: Number(w.whouse), label: `${w.whouse} · ${w.name ?? ""}`.trim() })),
    };
  } catch (err) {
    return { series: [], warehouses: [], current, error: (err as Error).message.slice(0, 300) };
  }
}

export async function saveOrderSettings(tenantId: string, series: { id: number; label: string }[], warehouse: number | null) {
  const user = await requirePermission("connections.tenant.manage", tenantId);
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { biSettings: true } });
  const next = { ...((t?.biSettings ?? {}) as Record<string, unknown>), purchaseOrderSeries: series.slice(0, 20).map((x) => ({ id: Math.trunc(x.id), label: String(x.label).slice(0, 120) })), orderWarehouse: warehouse };
  await prisma.tenant.update({ where: { id: tenantId }, data: { biSettings: next as Prisma.InputJsonValue } });
  await audit({ actorId: user.id, action: "tenant.order_settings", entity: "Tenant", entityId: tenantId, tenantId, meta: { series: series.map((x) => x.id), warehouse } });
  revalidatePath(`/admin/tenants/${tenantId}`);
}
