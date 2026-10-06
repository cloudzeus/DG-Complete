"use server";

import { z } from "zod";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createPurchaseOrder, orderTarget, supplierOrderLines, supplierOrderSeries, type OrderLine } from "@/lib/purchase-orders";
import { can, requireUser } from "@/lib/rbac";
import { hasService } from "@/lib/tenant-services";

async function viewer(tenantId: string) {
  const user = await requireUser();
  if (!can(user, "tenant.dashboards.view", tenantId)) throw new Error("forbidden");
  return user;
}

/**
 * The supplier's suggested lines + the series to preselect: the one of their latest purchase order
 * in SoftOne (domestic / EU / third country …), else the one we last used for them.
 */
export async function loadSupplierLines(tenantId: string, trdr: number): Promise<{ lines: OrderLine[]; series: number | null }> {
  await viewer(tenantId);
  const allowed = (await orderTarget(tenantId)).series.map((x) => x.id);
  const [lines, fromSoftOne, last] = await Promise.all([
    supplierOrderLines(tenantId, trdr),
    supplierOrderSeries(tenantId, trdr, allowed),
    prisma.auditLog.findFirst({
      where: { tenantId, action: "purchase_order.create", entityId: String(trdr) },
      orderBy: { createdAt: "desc" },
      select: { meta: true },
    }),
  ]);
  const used = (last?.meta as { series?: number } | null)?.series;
  return { lines, series: fromSoftOne ?? (typeof used === "number" && allowed.includes(used) ? used : null) };
}

const orderInput = z.object({
  tenantId: z.string().regex(/^[a-z0-9]{1,40}$/),
  trdr: z.number().int().positive(),
  series: z.number().int().positive(),
  supplierName: z.string().max(200),
  lines: z
    .array(z.object({ mtrl: z.number().int().positive(), qty: z.number().positive().max(1_000_000) }))
    .min(1, "Η παραγγελία δεν έχει γραμμές.")
    .max(300, "Έως 300 γραμμές ανά παραγγελία."),
  force: z.boolean().optional(),
});

export type OrderResult =
  | { ok: true; fincode: string; findoc: number; lines: number }
  | { ok: false; error: string; duplicate?: boolean };

export async function submitPurchaseOrder(input: z.infer<typeof orderInput>): Promise<OrderResult> {
  const parsed = orderInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const { tenantId, trdr, series, lines, supplierName, force } = parsed.data;
  const user = await requireUser();
  if (!can(user, "tenant.orders.create", tenantId)) return { ok: false, error: "Δεν έχετε δικαίωμα δημιουργίας παραγγελιών." };
  if (!(await hasService(tenantId, "purchase_orders"))) return { ok: false, error: "Οι παραγγελίες αγορών δεν περιλαμβάνονται στο πακέτο σας." };

  // A second order to the same supplier within minutes is almost always a double click.
  if (!force) {
    const recent = await prisma.auditLog.findFirst({
      where: { tenantId, action: "purchase_order.create", entityId: String(trdr), createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
      select: { meta: true },
    });
    if (recent) {
      const code = (recent.meta as { fincode?: string } | null)?.fincode;
      return { ok: false, duplicate: true, error: `Στάλθηκε ήδη παραγγελία σε αυτόν τον προμηθευτή πριν από λίγο${code ? ` (${code})` : ""}.` };
    }
  }

  try {
    const r = await createPurchaseOrder(tenantId, {
      trdr,
      series,
      lines,
      comment: `DGsmart BI · πρόταση παραγγελίας · ${user.name ?? user.email}`,
    });
    await audit({
      actorId: user.id,
      action: "purchase_order.create",
      entity: "Supplier",
      entityId: String(trdr),
      tenantId,
      meta: { supplier: supplierName, series, findoc: r.findoc, fincode: r.fincode, lines: lines.length },
    });
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 400) };
  }
}
