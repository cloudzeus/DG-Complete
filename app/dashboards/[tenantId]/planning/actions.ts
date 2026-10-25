"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { memoForget } from "@/lib/memo";
import { suggestBudget } from "@/lib/planning";
import { prisma } from "@/lib/prisma";
import { can, requireUser } from "@/lib/rbac";
import { hasService } from "@/lib/tenant-services";

type Result = { ok: boolean; message: string };

async function editor(tenantId: string) {
  const user = await requireUser();
  if (!can(user, "tenant.dashboards.edit", tenantId)) throw new Error("Μόνο ο διαχειριστής της εταιρείας αλλάζει στόχους και παραμέτρους.");
  return user;
}

const budgetSchema = z.array(z.object({ month: z.number().int().min(1).max(12), revenue: z.number().min(0).nullable(), margin: z.number().nullable() })).length(12);

export async function saveBudget(tenantId: string, year: number, rows: z.input<typeof budgetSchema>): Promise<Result> {
  try {
    const user = await editor(tenantId);
    if (!(await hasService(tenantId, "budget"))) return { ok: false, message: "Το Budget δεν περιλαμβάνεται στο πακέτο σας." };
    const parsed = budgetSchema.safeParse(rows);
    if (!parsed.success || year < 2000 || year > 2100) return { ok: false, message: "Μη έγκυρα στοιχεία." };
    await prisma.$transaction(
      parsed.data.map((r) =>
        prisma.budgetMonth.upsert({
          where: { tenantId_year_month: { tenantId, year, month: r.month } },
          update: { revenue: r.revenue?.toFixed(2) ?? null, margin: r.margin?.toFixed(2) ?? null, updatedBy: user.id },
          create: { tenantId, year, month: r.month, revenue: r.revenue?.toFixed(2) ?? null, margin: r.margin?.toFixed(2) ?? null, updatedBy: user.id },
        }),
      ),
    );
    await audit({ actorId: user.id, action: "budget.save", entity: "Tenant", entityId: tenantId, tenantId, meta: { year } });
    revalidatePath(`/dashboards/${tenantId}/planning`);
    return { ok: true, message: `Οι στόχοι ${year} αποθηκεύτηκαν.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function proposeBudget(tenantId: string, year: number, growthPct: number) {
  await editor(tenantId);
  return suggestBudget(tenantId, year, Math.max(-50, Math.min(100, growthPct)));
}

export async function savePlanningSettings(
  tenantId: string,
  v: { fixedCostsMonthly: number | null; minCash: number | null; costPerDocument: number | null; financingRatePct: number | null; lostSharePct: number | null },
): Promise<Result> {
  try {
    const user = await editor(tenantId);
    const d = (x: number | null, max = 1e12) => (x === null || !Number.isFinite(x) || x < 0 || x > max ? null : x.toFixed(2));
    const data = {
      fixedCostsMonthly: d(v.fixedCostsMonthly),
      minCash: d(v.minCash),
      costPerDocument: d(v.costPerDocument, 10_000),
      financingRatePct: d(v.financingRatePct, 100),
      lostSharePct: d(v.lostSharePct, 100),
    };
    await prisma.planningSettings.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } });
    memoForget(tenantId); // cached analyses use these assumptions
    await audit({ actorId: user.id, action: "planning.settings", entity: "Tenant", entityId: tenantId, tenantId, meta: v });
    revalidatePath(`/dashboards/${tenantId}`, "layout");
    return { ok: true, message: "Αποθηκεύτηκε." };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
