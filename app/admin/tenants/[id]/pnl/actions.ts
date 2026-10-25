"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { applyTemplate, rebuildFinFact } from "@/lib/pnl";
import { TEMPLATES, type TemplateKey } from "@/lib/pnl-templates";

// P&L mapping of a tenant: lines + rules (app DB) → fin_fact (tenant warehouse).

type Result = { ok: boolean; message: string };

const PERM = "tenant.dashboards.edit" as const;
const refresh = (tenantId: string) => revalidatePath(`/admin/tenants/${tenantId}/pnl`);

async function rebuild(tenantId: string): Promise<string> {
  try {
    const n = await rebuildFinFact(tenantId);
    return `Τα αποτελέσματα ξαναϋπολογίστηκαν (${n.toLocaleString("el-GR")} κινήσεις).`;
  } catch (err) {
    return `Ο υπολογισμός απέτυχε: ${(err as Error).message.slice(0, 200)}`;
  }
}

export async function applyPnlTemplate(tenantId: string, key: TemplateKey): Promise<Result> {
  const user = await requirePermission(PERM, tenantId);
  if (!(key in TEMPLATES)) return { ok: false, message: "Άγνωστο πρότυπο." };
  try {
    const n = await applyTemplate(tenantId, key);
    await audit({ actorId: user.id, action: "pnl.template.apply", entity: "PnlConfig", entityId: tenantId, tenantId, meta: { key } });
    const msg = await rebuild(tenantId);
    refresh(tenantId);
    return { ok: true, message: `Δημιουργήθηκαν ${n} γραμμές από το πρότυπο. ${msg}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message.slice(0, 300) };
  }
}

export async function rebuildPnl(tenantId: string): Promise<Result> {
  await requirePermission(PERM, tenantId);
  try {
    const n = await rebuildFinFact(tenantId);
    refresh(tenantId);
    return { ok: true, message: `Ο υπολογισμός ολοκληρώθηκε — ${n.toLocaleString("el-GR")} κινήσεις.` };
  } catch (err) {
    refresh(tenantId);
    return { ok: false, message: (err as Error).message.slice(0, 300) };
  }
}

const ruleSchema = z.object({
  source: z.enum(["GL", "SALES", "PURCHASES"]),
  pattern: z
    .string()
    .trim()
    .min(1, "Κενός κανόνας")
    .max(40)
    .regex(/^[0-9A-Za-z.\-_]+\*?$|^\*$/, "Μη έγκυρος κωδικός"),
  negate: z.boolean(),
});

const lineSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, "Λατινικά κεφαλαία, αριθμοί και _ (π.χ. OPEX_RENT)"),
  name: z.string().trim().min(2, "Υποχρεωτικό").max(120),
  section: z.enum(["REVENUE", "COGS", "OTHER_INCOME", "OPEX", "DEPRECIATION", "FINANCIAL", "EXTRAORDINARY", "TAX"]),
  sortOrder: z.coerce.number().int().min(0).max(100000),
  rules: z.array(ruleSchema).max(200),
});

export type LineInput = z.input<typeof lineSchema>;

export async function savePnlLine(tenantId: string, input: LineInput): Promise<Result> {
  const user = await requirePermission(PERM, tenantId);
  const parsed = lineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const l = parsed.data;
  const config = await prisma.pnlConfig.findUnique({ where: { tenantId } });
  if (!config) return { ok: false, message: "Εφαρμόστε πρώτα ένα πρότυπο." };
  const clash = await prisma.pnlLine.findFirst({ where: { tenantId, code: l.code, NOT: l.id ? { id: l.id } : undefined } });
  if (clash) return { ok: false, message: `Ο κωδικός ${l.code} χρησιμοποιείται ήδη.` };

  const rules = l.rules.map((r) => ({ source: r.source, pattern: r.pattern, negate: r.negate }));
  if (l.id) {
    const existing = await prisma.pnlLine.findFirst({ where: { id: l.id, tenantId } });
    if (!existing) return { ok: false, message: "Η γραμμή δεν βρέθηκε." };
    await prisma.$transaction([
      prisma.pnlRule.deleteMany({ where: { lineId: l.id } }),
      prisma.pnlLine.update({
        where: { id: l.id },
        data: { code: l.code, name: l.name, section: l.section, sortOrder: l.sortOrder, rules: { create: rules } },
      }),
    ]);
  } else {
    await prisma.pnlLine.create({
      data: { tenantId, code: l.code, name: l.name, section: l.section, sortOrder: l.sortOrder, rules: { create: rules } },
    });
  }
  await audit({ actorId: user.id, action: l.id ? "pnl.line.update" : "pnl.line.create", entity: "PnlLine", entityId: l.id, tenantId, meta: { code: l.code, rules: rules.length } });
  const msg = await rebuild(tenantId);
  refresh(tenantId);
  return { ok: true, message: `Η γραμμή «${l.name}» αποθηκεύτηκε. ${msg}` };
}

export async function deletePnlLine(tenantId: string, lineId: string): Promise<Result> {
  const user = await requirePermission(PERM, tenantId);
  const deleted = await prisma.pnlLine.deleteMany({ where: { id: lineId, tenantId } });
  if (!deleted.count) return { ok: false, message: "Η γραμμή δεν βρέθηκε." };
  await audit({ actorId: user.id, action: "pnl.line.delete", entity: "PnlLine", entityId: lineId, tenantId });
  const msg = await rebuild(tenantId);
  refresh(tenantId);
  return { ok: true, message: `Η γραμμή διαγράφηκε. ${msg}` };
}

/** Maps an unmapped GL account (or prefix) to a line. */
export async function mapAccountToLine(tenantId: string, lineId: string, pattern: string): Promise<Result> {
  const user = await requirePermission(PERM, tenantId);
  const p = ruleSchema.shape.pattern.safeParse(pattern);
  if (!p.success) return { ok: false, message: "Μη έγκυρος λογαριασμός." };
  const line = await prisma.pnlLine.findFirst({ where: { id: lineId, tenantId } });
  if (!line) return { ok: false, message: "Η γραμμή δεν βρέθηκε." };
  await prisma.pnlRule.create({ data: { lineId, source: "GL", pattern: p.data, negate: false } });
  await audit({ actorId: user.id, action: "pnl.rule.create", entity: "PnlRule", tenantId, meta: { line: line.code, pattern: p.data } });
  const msg = await rebuild(tenantId);
  refresh(tenantId);
  return { ok: true, message: `Ο ${p.data} αντιστοιχίστηκε στο «${line.name}». ${msg}` };
}
