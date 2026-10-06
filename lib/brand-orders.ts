import "server-only";
import type { Client } from "pg";
import { groupTrends, type CategoryTrend } from "@/lib/demand-trends";
import { chatCompletion, getAiSettings } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { orderLinesWhere, type OrderLine } from "@/lib/purchase-orders";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Παραγγελίες → Ανά μάρκα: the order suggestions of a brand with a plain-words justification
// (stock-out vs the supplier's measured delivery time, forecast and its basis, season ahead, sales at
// risk) and, per item, alternatives of other brands in the same category with better figures.

const qi = (v: string) => `"${v.replace(/"/g, '""')}"`;
const MONTHS = ["Ιανουάριο", "Φεβρουάριο", "Μάρτιο", "Απρίλιο", "Μάιο", "Ιούνιο", "Ιούλιο", "Αύγουστο", "Σεπτέμβριο", "Οκτώβριο", "Νοέμβριο", "Δεκέμβριο"];
const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
const n1 = (v: number) => v.toLocaleString("el-GR", { maximumFractionDigits: 1 });

export type LeadTime = { median: number; avg: number; deliveries: number; measured: boolean };

/** Measured delivery time per supplier (purchase order → first receipt, m_lead_times). */
async function supplierLeads(db: Client, s: string, trdrs: number[]): Promise<Map<number, LeadTime>> {
  if (!trdrs.length || !(await db.query("SELECT to_regclass($1) AS t", [`${s}.m_lead_times`])).rows[0]?.t) return new Map();
  const r = await db.query(
    `SELECT trdr, percentile_cont(0.5) WITHIN GROUP (ORDER BY lead_days)::float AS median, AVG(lead_days)::float AS avg, COUNT(*)::int AS n
     FROM ${s}.m_lead_times WHERE trdr = ANY($1::bigint[]) AND ordered >= now() - interval '24 months' GROUP BY trdr`,
    [trdrs],
  );
  return new Map(r.rows.map((x) => [Number(x.trdr), { median: Math.round(Number(x.median)), avg: Math.round(Number(x.avg) * 10) / 10, deliveries: Number(x.n), measured: true }]));
}

export type BrandSummary = {
  mtrmark: number;
  name: string;
  items: number;
  critical: number;
  /** Value of the suggested quantities at unit cost. */
  value: number;
  quarterPct: number | null;
  supplier: string | null;
  leadDays: number | null;
};

/** Brands with order suggestions: how many, how urgent, how much, their trend and supplier. */
export async function brandSummaries(tenantId: string): Promise<BrandSummary[]> {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    if (!(await db.query("SELECT to_regclass($1) AS t", [`${s}.brands`])).rows[0]?.t) return [];
    const r = await db.query(
      `SELECT b.mtrmark, b.name,
              COUNT(*) FILTER (WHERE m.suggested_order_qty > 0)::int AS items,
              COUNT(*) FILTER (WHERE m.suggested_order_qty > 0 AND m.stock_qty <= 0 AND m.abc = 'A')::int AS critical,
              COALESCE(SUM(m.suggested_order_qty * COALESCE(m.unit_cost, 0)) FILTER (WHERE m.suggested_order_qty > 0), 0)::float AS value,
              mode() WITHIN GROUP (ORDER BY m.main_supplier) AS supplier,
              mode() WITHIN GROUP (ORDER BY m.lead_days) AS lead_days
       FROM ${s}.m_item_stats m JOIN ${s}.items i ON i.mtrl = m.mtrl JOIN ${s}.brands b ON b.mtrmark = i.mtrmark
       GROUP BY b.mtrmark, b.name
       HAVING COUNT(*) FILTER (WHERE m.suggested_order_qty > 0) > 0
       ORDER BY critical DESC, value DESC`,
    );
    const suppliers = new Map(
      (await db.query(`SELECT trdr, name FROM ${s}.suppliers WHERE trdr = ANY($1::bigint[])`, [r.rows.map((x) => x.supplier).filter(Boolean)])).rows.map((x) => [
        Number(x.trdr),
        x.name as string,
      ]),
    );
    const trends = new Map((await groupTrends(db, s, "brand", r.rows.map((x) => Number(x.mtrmark)))).map((t) => [t.id, t]));
    return r.rows.map((x) => ({
      mtrmark: Number(x.mtrmark),
      name: x.name ?? `Μάρκα ${x.mtrmark}`,
      items: Number(x.items),
      critical: Number(x.critical),
      value: Number(x.value),
      quarterPct: trends.get(Number(x.mtrmark))?.quarterPct ?? null,
      supplier: x.supplier === null ? null : (suppliers.get(Number(x.supplier)) ?? null),
      leadDays: x.lead_days === null ? null : Number(x.lead_days),
    }));
  });
}

export type Alternative = {
  mtrl: number;
  code: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  group: string | null;
  supplier: string | null;
  stock: number;
  qty12m: number;
  growthPct: number | null;
  marginPct: number | null;
  avgPrice: number | null;
  leadDays: number | null;
  /** Why it is a better choice, in plain words. */
  better: string[];
  /** How well it substitutes the item, 0–100, and why (AI, or by the descriptions). */
  match: number;
  matchReason: string;
  matchSource: "ai" | "text";
};

export type PlanLine = OrderLine & { why: string[]; atRisk: number | null; alternatives: Alternative[] };

export type BrandPlan = {
  brand: { mtrmark: number; name: string; trend: CategoryTrend | null };
  supplier: { trdr: number | null; name: string | null; lead: LeadTime | null };
  value: number;
  lines: PlanLine[];
  /** Candidate pairs still waiting for an AI verdict. */
  pendingAi: number;
};

/** Plain-words reasons for one suggested line. */
function justify(l: OrderLine, lead: LeadTime | null, cat: CategoryTrend | undefined): { why: string[]; atRisk: number | null } {
  const why: string[] = [];
  const leadDays = lead?.median ?? l.leadDays ?? 30;
  const leadTxt = lead?.measured
    ? `παράδοση ~${lead.median} ημ. (μέσος όρος ${n1(lead.avg)} ημ. σε ${lead.deliveries} παραλαβές)`
    : `παράδοση ~${leadDays} ημ. (εκτίμηση — δεν υπάρχουν μετρημένες παραλαβές)`;
  const fc3 = l.forecast.reduce((a, v) => a + v, 0);
  const daily = fc3 / 91;
  if (l.stock <= 0) why.push(`Εξαντλημένο τώρα· ${leadTxt}.`);
  else if (l.stockoutDays !== null)
    why.push(
      l.stockoutDays <= leadDays
        ? `Το απόθεμα (${n1(l.stock)}) τελειώνει σε ~${l.stockoutDays} ημ., πριν φτάσει παραγγελία· ${leadTxt}.`
        : `Το απόθεμα (${n1(l.stock)}) φτάνει για ~${l.stockoutDays} ημ.· ${leadTxt}.`,
    );
  if (fc3 > 0) why.push(`Πρόβλεψη επόμενων 3 μηνών: ${n1(fc3)} τεμ.${l.forecastNote ? ` (${l.forecastNote})` : ""}.`);
  if (l.growthPct !== null && Math.abs(l.growthPct) >= 15) why.push(`Πωλήσεις 12μ ${l.growthPct > 0 ? "+" : ""}${l.growthPct}% έναντι του προηγούμενου 12μήνου.`);
  if (cat) {
    const month = new Date().getMonth();
    const k = [1, 2, 3].find((k) => cat.season[(month + k) % 12] >= 1.3);
    if (k) why.push(`Η κατηγορία ${cat.name} έχει αιχμή τον ${MONTHS[(month + k) % 12]} (+${Math.round((cat.season[(month + k) % 12] - 1) * 100)}%).`);
  }
  if (l.abc === "A") why.push("Τάξη Α: από τα είδη που κάνουν το 80% του τζίρου.");
  // Sales lost while out of stock until a new order arrives.
  const gap = l.stock <= 0 ? leadDays : l.stockoutDays !== null ? Math.max(0, leadDays - l.stockoutDays) : 0;
  const atRisk = gap > 0 && daily > 0 && l.avgPrice ? gap * daily * l.avgPrice : null;
  if (atRisk && atRisk >= 50) why.push(`Χωρίς παραγγελία, πωλήσεις ~${eur(atRisk)} σε κίνδυνο (${gap} ημ. χωρίς απόθεμα).`);
  return { why, atRisk };
}

/** Other brands' items in the same category (and group) at a similar price, with better figures. */
async function alternatives(
  db: Client,
  s: string,
  tenantId: string,
  lines: OrderLine[],
  mtrmark: number,
  useAi: boolean,
): Promise<{ alts: Map<number, Alternative[]>; pendingAi: number }> {
  const out = new Map<number, Alternative[]>();
  if (!lines.length) return { alts: out, pendingAi: 0 };
  const brands = !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.brands`])).rows[0]?.t;
  const catNames = !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.item_categories`])).rows[0]?.t;
  const groupNames = !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.item_groups`])).rows[0]?.t;
  const sodtype = (await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'items' AND column_name = 'sodtype'", [s.slice(1, -1)])).rowCount;
  const r = await db.query(
    `WITH base AS (
       SELECT m.mtrl, i.mtrcategory, i.mtrgroup, m.margin_pct, m.qty_12m, m.stock_qty, m.lead_days,
              CASE WHEN m.qty_12m > 0 THEN m.revenue_12m / m.qty_12m END AS price
       FROM ${s}.m_item_stats m JOIN ${s}.items i ON i.mtrl = m.mtrl
       WHERE m.mtrl = ANY($1::bigint[]) AND i.mtrcategory IS NOT NULL
     )
     SELECT b.mtrl AS for_mtrl, a.* FROM base b
     CROSS JOIN LATERAL (
       SELECT m2.mtrl, i2.code, i2.name, ${brands ? "br.name" : "NULL"} AS brand, sp.name AS supplier,
              ${catNames ? "(SELECT name FROM " + s + ".item_categories WHERE mtrcategory = i2.mtrcategory)" : "NULL"} AS category,
              ${groupNames ? "(SELECT name FROM " + s + ".item_groups WHERE mtrgroup = i2.mtrgroup)" : "NULL"} AS group_name,
              m2.stock_qty, m2.qty_12m, m2.growth_pct, m2.margin_pct, m2.lead_days,
              m2.revenue_12m / NULLIF(m2.qty_12m, 0) AS price,
              -- Score: margin gain, faster sales, in stock, quicker delivery.
              (COALESCE(m2.margin_pct, 0) - COALESCE(b.margin_pct, 0)) / 5.0
                + LN(GREATEST(m2.qty_12m, 0) + 1) - LN(GREATEST(b.qty_12m, 0) + 1)
                + CASE WHEN m2.stock_qty > 0 AND b.stock_qty <= 0 THEN 1 ELSE 0 END
                + (COALESCE(b.lead_days, 30) - COALESCE(m2.lead_days, 30)) / 15.0 AS score
       FROM ${s}.m_item_stats m2 JOIN ${s}.items i2 ON i2.mtrl = m2.mtrl
       ${brands ? `LEFT JOIN ${s}.brands br ON br.mtrmark = i2.mtrmark` : ""}
       LEFT JOIN ${s}.suppliers sp ON sp.trdr = m2.main_supplier
       WHERE i2.mtrcategory = b.mtrcategory
         AND (b.mtrgroup IS NULL OR i2.mtrgroup IS NULL OR i2.mtrgroup = b.mtrgroup)
         AND COALESCE(i2.mtrmark, -1) <> $2
         AND m2.qty_12m > 0
         ${sodtype ? "AND COALESCE(i2.sodtype, 51) = 51" : ""}
         AND (b.price IS NULL OR (m2.revenue_12m / NULLIF(m2.qty_12m, 0)) BETWEEN b.price * 0.6 AND b.price * 1.6)
       ORDER BY score DESC
       LIMIT 5
     ) a
     WHERE a.score > 0.3`,
    [lines.map((l) => l.mtrl), mtrmark],
  );
  const byMtrl = new Map(lines.map((l) => [l.mtrl, l]));
  const candidates: { base: OrderLine; alt: Alternative }[] = [];
  for (const x of r.rows) {
    const base = byMtrl.get(Number(x.for_mtrl));
    if (!base) continue;
    const alt: Alternative = {
      mtrl: Number(x.mtrl),
      code: x.code ?? null,
      name: x.name ?? `Είδος ${x.mtrl}`,
      brand: x.brand ?? null,
      category: x.category ?? null,
      group: x.group_name ?? null,
      supplier: x.supplier ?? null,
      stock: Number(x.stock_qty ?? 0),
      qty12m: Number(x.qty_12m ?? 0),
      growthPct: x.growth_pct === null ? null : Number(x.growth_pct),
      marginPct: x.margin_pct === null ? null : Number(x.margin_pct),
      avgPrice: x.price === null ? null : Number(x.price),
      leadDays: x.lead_days === null ? null : Number(x.lead_days),
      better: [],
      match: 0,
      matchReason: "",
      matchSource: "text",
    };
    if (sane(alt.marginPct) && (!sane(base.marginPct) || alt.marginPct! >= base.marginPct! + 3))
      alt.better.push(`περιθώριο ${n1(alt.marginPct!)}%${sane(base.marginPct) ? ` έναντι ${n1(base.marginPct!)}%` : ""}`);
    if (alt.qty12m >= base.qty12m * 1.3) alt.better.push(`πουλάει ${n1(alt.qty12m)} τεμ./έτος έναντι ${n1(base.qty12m)}`);
    if (alt.stock > 0 && base.stock <= 0) alt.better.push(`σε απόθεμα (${n1(alt.stock)})`);
    if (alt.leadDays !== null && alt.leadDays + 5 <= (base.leadDays ?? 30)) alt.better.push(`παράδοση ~${alt.leadDays} ημ. έναντι ${base.leadDays ?? 30}`);
    if (alt.growthPct !== null && alt.growthPct >= 15) alt.better.push(`ζήτηση +${Math.round(alt.growthPct)}%`);
    if (alt.better.length) candidates.push({ base, alt });
  }
  const { verdicts: judged, pendingAi } = await judgeSubstitutes(tenantId, candidates, useAi);
  for (const { base, alt } of candidates) {
    const j = judged.get(`${base.mtrl}:${alt.mtrl}`);
    if (!j || j.match < MIN_MATCH) continue;
    Object.assign(alt, { match: j.match, matchReason: j.reason, matchSource: j.source });
    out.set(base.mtrl, [...(out.get(base.mtrl) ?? []), alt]);
  }
  for (const [k, v] of out) out.set(k, v.sort((x, y) => y.match - x.match).slice(0, 2));
  return { alts: out, pendingAi };
}

/** Margins outside −50…85% come from wrong costs in SoftOne — not used for comparisons. */
const sane = (m: number | null) => m !== null && m > -50 && m < 85;

const STOP = new Set(["ΓΙΑ", "ΜΕ", "ΚΑΙ", "ΣΕΤ", "SET", "WITH", "FOR", "THE", "AND", "ΤΥΠΟΥ", "ΤΕΜ"]);
/** Word stems (first 5 letters) of a description, without codes and numbers. */
const stems = (name: string) =>
  new Set(
    name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toUpperCase()
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 4 && !STOP.has(w))
      .map((w) => w.slice(0, 5)),
  );

const MIN_MATCH = 60;
const KEEP_DAYS = 90;

/** Share of description words in common (when AI is off), 0–100. */
function textMatch(a: string, b: string) {
  const sa = stems(a);
  const sb = stems(b);
  if (!sa.size || !sb.size) return 0;
  let common = 0;
  for (const w of sb) if (sa.has(w)) common++;
  return Math.round((100 * common) / Math.min(sa.size, sb.size));
}

type Judgement = { match: number; reason: string; source: "ai" | "text" };

/**
 * How well each candidate substitutes its item: cached verdicts first, the rest judged by AI in one
 * call (25 s at most) and stored; without AI, the share of common description words.
 */
async function judgeSubstitutes(
  tenantId: string,
  pairs: { base: OrderLine; alt: Alternative }[],
  useAi: boolean,
): Promise<{ verdicts: Map<string, Judgement>; pendingAi: number }> {
  const out = new Map<string, Judgement>();
  if (!pairs.length) return { verdicts: out, pendingAi: 0 };
  const cached = await prisma.itemSubstitute.findMany({
    where: { tenantId, mtrl: { in: [...new Set(pairs.map((p) => p.base.mtrl))] }, createdAt: { gte: new Date(Date.now() - KEEP_DAYS * 86_400_000) } },
  });
  for (const c of cached) out.set(`${c.mtrl}:${c.altMtrl}`, { match: c.match, reason: c.reason, source: c.source === "ai" ? "ai" : "text" });
  const notAi = pairs.filter((p) => out.get(`${p.base.mtrl}:${p.alt.mtrl}`)?.source !== "ai");
  // Without AI now: the description match for what has no verdict yet (not stored — AI judges later).
  if (!useAi || !(await getAiSettings()).enabled) {
    for (const p of notAi) {
      const key = `${p.base.mtrl}:${p.alt.mtrl}`;
      if (!out.has(key)) out.set(key, { match: textMatch(p.base.name, p.alt.name), reason: "Κοινές λέξεις στην περιγραφή", source: "text" });
    }
    return { verdicts: out, pendingAi: useAi ? 0 : notAi.length };
  }

  // AI: groups of ~40 pairs in parallel, compact answers.
  const chunks: (typeof notAi)[] = [];
  for (let i = 0; i < notAi.length; i += 40) chunks.push(notAi.slice(i, i + 40));
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const items = new Map<number, { base: OrderLine; alts: Alternative[] }>();
      for (const p of chunk) items.set(p.base.mtrl, { base: p.base, alts: [...(items.get(p.base.mtrl)?.alts ?? []), p.alt] });
      const payload = [...items.values()].map(({ base, alts }) => ({
        id: base.mtrl,
        item: base.name,
        group: base.group ?? base.category,
        candidates: alts.map((a) => [a.mtrl, a.name]),
      }));
      try {
        const call = chatCompletion({
          tenantId,
          feature: "substitutes",
          temperature: 0,
          maxTokens: 3500,
          messages: [
            {
              role: "system",
              content:
                "Είσαι ειδικός σε εργαλεία, βιομηχανικά και τεχνικά είδη. Για κάθε είδος κρίνεις αν κάθε υποψήφιο άλλης μάρκας μπορεί να το αντικαταστήσει στον ίδιο πελάτη: ίδιο είδος προϊόντος, ίδια χρήση, συγκρίσιμες προδιαγραφές (μέγεθος, τάση/ισχύς, διαστάσεις, πλατφόρμα μπαταρίας). match 0–100: 90+ ισοδύναμο, 70–89 καλό υποκατάστατο, 50–69 μερικό, <50 όχι. Απάντησε ΜΟΝΟ JSON.",
            },
            {
              role: "user",
              content: `${JSON.stringify(payload)}\n\nΕπέστρεψε {"r":[[itemId,candidateId,match,"αιτιολογία έως 8 λέξεις"], ...]} για ΚΑΘΕ ζεύγος.`,
            },
          ],
        });
        const r = await Promise.race([call, new Promise<null>((res) => setTimeout(() => res(null), 60_000))]);
        const text = r?.choices[0]?.message?.content ?? "";
        const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
        const rows = json ? ((JSON.parse(json) as { r?: unknown[][] }).r ?? []) : [];
        if (!r) return { ok: false, rows: [] };
        return {
          ok: true,
          chunk,
          rows: rows
            .filter((x) => Array.isArray(x) && Number.isFinite(Number(x[2])))
            .map((x) => ({ key: `${Number(x[0])}:${Number(x[1])}`, match: Math.max(0, Math.min(100, Math.round(Number(x[2])))), reason: String(x[3] ?? "").slice(0, 160) })),
        };
      } catch (err) {
        console.error("[substitutes] AI:", (err as Error).message);
        return { ok: false, rows: [] };
      }
    }),
  );
  const ai = new Map(results.flatMap((r) => r.rows).map((x) => [x.key, x]));
  // Pairs the AI saw but left out: not a substitute (stored, so they are not asked again).
  const seen = new Set(results.flatMap((r) => (r.ok && r.chunk ? r.chunk.map((p) => `${p.base.mtrl}:${p.alt.mtrl}`) : [])));
  for (const p of notAi) {
    const key = `${p.base.mtrl}:${p.alt.mtrl}`;
    const v = ai.get(key) ?? (seen.has(key) ? { match: 0, reason: "Δεν θεωρείται υποκατάστατο" } : undefined);
    if (!v) {
      if (!out.has(key)) out.set(key, { match: textMatch(p.base.name, p.alt.name), reason: "Κοινές λέξεις στην περιγραφή", source: "text" });
      continue;
    }
    const j: Judgement = { match: v.match, reason: v.reason || "Κρίση AI", source: "ai" };
    out.set(key, j);
    await prisma.itemSubstitute.upsert({
      where: { tenantId_mtrl_altMtrl: { tenantId, mtrl: p.base.mtrl, altMtrl: p.alt.mtrl } },
      update: { match: j.match, reason: j.reason, source: "ai", createdAt: new Date() },
      create: { tenantId, mtrl: p.base.mtrl, altMtrl: p.alt.mtrl, match: j.match, reason: j.reason, source: "ai" },
    });
  }
  return { verdicts: out, pendingAi: notAi.filter((p) => out.get(`${p.base.mtrl}:${p.alt.mtrl}`)?.source !== "ai").length };
}

/** useAi: judge the candidates without an AI verdict now (slow — the page asks for it in the background). */
export async function brandPlan(tenantId: string, mtrmark: number, opts: { useAi?: boolean } = {}): Promise<BrandPlan> {
  const lines = await orderLinesWhere(tenantId, "i.mtrmark = $1 AND m.suggested_order_qty > 0", [mtrmark]);
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const name = (await db.query(`SELECT name FROM ${s}.brands WHERE mtrmark = $1`, [mtrmark])).rows[0]?.name ?? `Μάρκα ${mtrmark}`;
    const [trend] = await groupTrends(db, s, "brand", [mtrmark]);
    const cats = new Map(
      (await groupTrends(db, s, "category", [...new Set(lines.map((l) => l.categoryId).filter((v): v is number => v !== null))])).map((t) => [t.id, t]),
    );
    const supplierIds = [...new Set(lines.map((l) => l.supplierId).filter((v): v is number => v !== null))];
    const leads = await supplierLeads(db, s, supplierIds);
    // The brand's supplier: the one most of its suggested lines come from.
    const counts = new Map<number, number>();
    for (const l of lines) if (l.supplierId !== null) counts.set(l.supplierId, (counts.get(l.supplierId) ?? 0) + 1);
    const main = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const { alts, pendingAi } = await alternatives(db, s, tenantId, lines, mtrmark, !!opts.useAi);
    const plan = lines.map((l) => {
      const lead = l.supplierId !== null ? (leads.get(l.supplierId) ?? null) : null;
      return { ...l, ...justify(l, lead, l.categoryId !== null ? cats.get(l.categoryId) : undefined), alternatives: alts.get(l.mtrl) ?? [] };
    });
    return {
      brand: { mtrmark, name, trend: trend ?? null },
      supplier: { trdr: main, name: plan.find((l) => l.supplierId === main)?.supplier ?? null, lead: main !== null ? (leads.get(main) ?? null) : null },
      value: plan.reduce((a, l) => a + l.suggested * (l.unitCost ?? 0), 0),
      lines: plan,
      pendingAi,
    };
  });
}
