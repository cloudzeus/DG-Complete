import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { swapTable } from "@/lib/bi-marts";
import { cubeLoadAll, num } from "@/lib/cube-client";
import { ensureRegistryTable } from "@/lib/kad";
import { chatCompletion } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Industry segmentation: the main activity codes (ΚΑΔ) of a tenant's customers grouped by AI into
// segments that make sense for THIS business (e.g. shipping / electricians / construction for a
// tools distributor), then <schema>.customer_segment for Cube (industry_sales) and AI profiles.

export type Segment = { key: string; name: string; description: string };
export const UNKNOWN: Segment = { key: "unknown", name: "Χωρίς ΚΑΔ", description: "Πελάτες χωρίς ΑΦΜ ή χωρίς στοιχεία μητρώου." };
export const OTHER_KEY = "other";

const qi = (s: string) => `"${s.replaceAll('"', '""')}"`;
const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;

type KadStat = { code: string; descr: string; customers: number; revenue: number };

async function kadStats(tenantId: string): Promise<{ kads: KadStat[]; categories: string[]; brands: string[] }> {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    await ensureRegistryTable(db, s);
    const kads = await db.query(
      `WITH rev AS (SELECT trdr, SUM(net) AS revenue FROM ${s}.f_sales_lines WHERE trndate >= now() - interval '24 months' GROUP BY trdr)
       SELECT r.main_kad AS code, MAX(r.main_kad_descr) AS descr, COUNT(DISTINCT c.trdr)::int AS customers, COALESCE(SUM(rev.revenue), 0)::float AS revenue
       FROM rev JOIN ${s}.customers c USING (trdr) JOIN ${s}.afm_registry r ON r.afm = c.afm AND r.status = 'ok'
       WHERE r.main_kad IS NOT NULL
       GROUP BY r.main_kad ORDER BY 4 DESC`,
    );
    const cats = await db.query(
      `SELECT c.name FROM ${s}.f_sales_lines f JOIN ${s}.items i ON i.mtrl = f.mtrl JOIN ${s}.item_categories c ON c.mtrcategory = i.mtrcategory
       WHERE f.trndate >= now() - interval '12 months' GROUP BY c.name ORDER BY SUM(f.net) DESC LIMIT 15`,
    ).catch(() => ({ rows: [] as { name: string }[] }));
    const brands = await db.query(
      `SELECT b.name FROM ${s}.f_sales_lines f JOIN ${s}.items i ON i.mtrl = f.mtrl JOIN ${s}.brands b ON b.mtrmark = i.mtrmark
       WHERE f.trndate >= now() - interval '12 months' GROUP BY b.name ORDER BY SUM(f.net) DESC LIMIT 15`,
    ).catch(() => ({ rows: [] as { name: string }[] }));
    return {
      kads: kads.rows.map((r) => ({ code: String(r.code), descr: String(r.descr ?? ""), customers: Number(r.customers), revenue: Number(r.revenue) })),
      categories: cats.rows.map((r) => String(r.name)),
      brands: brands.rows.map((r) => String(r.name)),
    };
  });
}

/** The first JSON object in a model answer (models sometimes wrap it in prose or ```json). */
function parseJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Το μοντέλο δεν επέστρεψε JSON.");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9α-ω]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "segment";

async function ask(tenantId: string, userId: string | null, system: string, user: string) {
  const r = await chatCompletion({
    tenantId,
    userId,
    feature: "industry",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    maxTokens: 6000,
  });
  return r.choices[0]?.message?.content ?? "";
}

/** Builds (or rebuilds) the segments and the ΚΑΔ → segment mapping, then customer_segment. */
export async function buildSegmentation(tenantId: string, userId: string | null) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const { kads, categories, brands } = await kadStats(tenantId);
  if (kads.length < 3) throw new Error("Δεν υπάρχουν ακόμα αρκετοί ΚΑΔ πελατών — περιμένετε να ολοκληρωθεί η άντληση από το μητρώο.");
  const total = kads.reduce((t, k) => t + k.revenue, 0) || 1;
  const line = (k: KadStat) => `${k.code} | ${k.descr} | ${k.customers} πελ. | ${((100 * k.revenue) / total).toFixed(1)}% τζίρου`;

  // 1) Segments designed for this business, from the codes that matter most.
  const system =
    "Είσαι αναλυτής πωλήσεων B2B στην Ελλάδα. Απαντάς ΜΟΝΟ με έγκυρο JSON, χωρίς σχόλια. Γράφεις στα ελληνικά, σύντομα και επαγγελματικά.";
  const taxonomyAnswer = await ask(
    tenantId,
    userId,
    system,
    `Επιχείρηση: «${tenant?.name}». Πουλάει κυρίως κατηγορίες: ${categories.join(", ") || "—"}. Μάρκες: ${brands.join(", ") || "—"}.
Παρακάτω οι κύριοι ΚΑΔ (κωδικός δραστηριότητας) των πελατών της, με πλήθος πελατών και μερίδιο τζίρου:
${kads.slice(0, 250).map(line).join("\n")}

Δημιούργησε 8 έως 14 κλάδους-στόχους (segments) πελατών που έχουν ΝΟΗΜΑ ΓΙΑ ΑΥΤΗ ΤΗΝ ΕΠΙΧΕΙΡΗΣΗ — ομάδες που αγοράζουν με παρόμοιο τρόπο και στις οποίες μπορεί να απευθυνθεί με κοινή εμπορική πολιτική. Ένας κλάδος «Λοιποί» με key "${OTHER_KEY}" για όσους δεν ταιριάζουν.
Μορφή: {"segments":[{"key":"λατινικά_snake_case","name":"σύντομο όνομα","description":"1–2 προτάσεις: ποιοι είναι και γιατί αγοράζουν"}]}`,
  );
  const parsed = parseJson<{ segments: Segment[] }>(taxonomyAnswer);
  const segments: Segment[] = [];
  for (const s of parsed.segments ?? []) {
    if (!s?.name) continue;
    const key = s.key && /^[a-z0-9_]{2,40}$/.test(s.key) ? s.key : slug(s.name);
    if (!segments.some((x) => x.key === key)) segments.push({ key, name: String(s.name).slice(0, 60), description: String(s.description ?? "").slice(0, 400) });
  }
  if (!segments.some((s) => s.key === OTHER_KEY)) segments.push({ key: OTHER_KEY, name: "Λοιποί", description: "Πελάτες με δραστηριότητα εκτός των βασικών κλάδων." });
  if (segments.length < 3) throw new Error("Το μοντέλο δεν πρότεινε κλάδους.");

  // 2) Every main code → one segment (in batches).
  const keys = new Set(segments.map((s) => s.key));
  const mapping: Record<string, string> = {};
  const list = segments.map((s) => `${s.key}: ${s.name} — ${s.description}`).join("\n");
  for (let i = 0; i < kads.length; i += 180) {
    const chunk = kads.slice(i, i + 180);
    const answer = await ask(
      tenantId,
      userId,
      system,
      `Κλάδοι:\n${list}\n\nΑντιστοίχισε ΚΑΘΕ ΚΑΔ σε ΕΝΑΝ κλάδο (key). Αν δεν ταιριάζει πουθενά: "${OTHER_KEY}".\n${chunk.map((k) => `${k.code} | ${k.descr}`).join("\n")}\n\nΜορφή: {"<ΚΑΔ>":"<key>", …}`,
    );
    const m = parseJson<Record<string, string>>(answer);
    for (const k of chunk) mapping[k.code] = keys.has(m[k.code]) ? m[k.code] : OTHER_KEY;
  }

  await prisma.industrySegmentation.upsert({
    where: { tenantId },
    update: { segments: segments as unknown as Prisma.InputJsonValue, mapping, profiles: {}, builtAt: new Date(), error: null },
    create: { tenantId, segments: segments as unknown as Prisma.InputJsonValue, mapping, profiles: {}, builtAt: new Date() },
  });
  await rebuildCustomerSegments(tenantId);
  return { segments: segments.length, kads: kads.length };
}

/** <schema>.customer_segment: every customer with its main ΚΑΔ and segment (mapping inlined). */
export async function rebuildCustomerSegments(tenantId: string) {
  const seg = await prisma.industrySegmentation.findUnique({ where: { tenantId } });
  const schema = schemaName(tenantId);
  const s = qi(schema);
  const segments = ((seg?.segments ?? []) as Segment[]).concat(UNKNOWN);
  const mapping = (seg?.mapping ?? {}) as Record<string, string>;
  const name = new Map(segments.map((x) => [x.key, x.name]));
  const values = Object.entries(mapping)
    .filter(([code]) => /^[0-9]{1,10}$/.test(code))
    .map(([code, key]) => `(${lit(code)}, ${lit(key)}, ${lit(name.get(key) ?? "Λοιποί")})`);
  await withWarehouse(async (db) => {
    await ensureRegistryTable(db, s);
    const map = values.length ? `(VALUES ${values.join(",")}) AS m(code, key, name)` : `(SELECT NULL::text code, NULL::text key, NULL::text name WHERE false) m`;
    await swapTable(
      db,
      schema,
      "customer_segment",
      `SELECT c.trdr, c.afm, r.main_kad, r.main_kad_descr, LEFT(r.main_kad, 2) AS kad_division,
              COALESCE(m.key, CASE WHEN r.main_kad IS NULL THEN '${UNKNOWN.key}' ELSE '${OTHER_KEY}' END) AS segment_key,
              COALESCE(m.name, CASE WHEN r.main_kad IS NULL THEN ${lit(UNKNOWN.name)} ELSE ${lit(name.get(OTHER_KEY) ?? "Λοιποί")} END) AS segment_name
       FROM ${s}.customers c
       LEFT JOIN ${s}.afm_registry r ON r.afm = c.afm AND r.status = 'ok'
       LEFT JOIN ${map} ON m.code = r.main_kad`,
      [],
      ["trdr", "segment_key"],
    );
  });
}

const I = (m: string) => `industry_sales.${m}`;

/** AI profile of one segment from its numbers (cached until the segmentation is rebuilt). */
export async function profileSegment(tenantId: string, key: string, userId: string | null) {
  const seg = await prisma.industrySegmentation.findUnique({ where: { tenantId } });
  const segment = ((seg?.segments ?? []) as Segment[]).find((s) => s.key === key);
  if (!seg || !segment) throw new Error("Ο κλάδος δεν βρέθηκε.");
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const y1 = iso(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
  const today = iso(now);
  const f = [{ member: I("segment_key"), operator: "equals", values: [key] }];
  const td = [{ dimension: I("date"), dateRange: [y1, today] as [string, string] }];
  const { data } = await cubeLoadAll(tenantId, {
    totals: { measures: [I("revenue"), I("customers"), I("documents"), I("margin_pct"), I("revenue_per_customer")], timeDimensions: td, filters: f },
    all: { measures: [I("revenue"), I("revenue_per_customer")], timeDimensions: td },
    months: { measures: [I("revenue")], timeDimensions: [{ dimension: I("date"), granularity: "month", dateRange: [iso(new Date(now.getFullYear() - 2, now.getMonth(), 1)), today] }], filters: f },
    categories: { measures: [I("revenue")], dimensions: [I("category")], timeDimensions: td, filters: f, order: { [I("revenue")]: "desc" }, limit: 10 },
    brands: { measures: [I("revenue")], dimensions: [I("brand")], timeDimensions: td, filters: f, order: { [I("revenue")]: "desc" }, limit: 10 },
    kads: { measures: [I("customers")], dimensions: [I("main_kad_descr")], timeDimensions: td, filters: f, order: { [I("customers")]: "desc" }, limit: 8 },
  });
  const t = data.totals[0] ?? {};
  const a = data.all[0] ?? {};
  const facts = [
    `Κλάδος: ${segment.name} — ${segment.description}`,
    `Τελευταίοι 12 μήνες: τζίρος ${Math.round(num(t[I("revenue")]))} €, ${num(t[I("customers")])} πελάτες, ${num(t[I("documents")])} παραστατικά, περιθώριο ${num(t[I("margin_pct")]).toFixed(1)}%.`,
    `Μέσος τζίρος ανά πελάτη: κλάδος ${Math.round(num(t[I("revenue_per_customer")]))} € έναντι ${Math.round(num(a[I("revenue_per_customer")]))} € συνολικά.`,
    `Μερίδιο στον συνολικό τζίρο: ${((100 * num(t[I("revenue")])) / (num(a[I("revenue")]) || 1)).toFixed(1)}%.`,
    `Τζίρος ανά μήνα (24 μήνες): ${data.months.map((r) => `${String(r[`${I("date")}.month`]).slice(0, 7)}: ${Math.round(num(r[I("revenue")]))}`).join(", ")}.`,
    `Κατηγορίες: ${data.categories.map((r) => `${r[I("category")]} (${Math.round(num(r[I("revenue")]))} €)`).join(", ")}.`,
    `Μάρκες: ${data.brands.map((r) => `${r[I("brand")]} (${Math.round(num(r[I("revenue")]))} €)`).join(", ")}.`,
    `Συχνότερες δραστηριότητες: ${data.kads.map((r) => `${r[I("main_kad_descr")]} (${num(r[I("customers")])})`).join("; ")}.`,
  ].join("\n");
  const answer = await chatCompletion({
    tenantId,
    userId,
    feature: "industry",
    messages: [
      {
        role: "system",
        content:
          "Είσαι σύμβουλος πωλήσεων B2B. Γράφεις στα ελληνικά, ουσιαστικά, χωρίς γενικολογίες. ΜΟΝΟ τα στοιχεία που δίνονται — μην επινοείς νούμερα. Μορφή: σύντομες παράγραφοι και λίστες «- », **έντονα** για τα βασικά.",
      },
      {
        role: "user",
        content: `${facts}\n\nΓράψε το προφίλ αυτού του κλάδου πελατών με ενότητες: «Ποιοι είναι», «Τι αγοράζουν», «Πότε αγοράζουν» (εποχικότητα από τους μήνες), «Αξία» (μέσος τζίρος, περιθώριο έναντι του συνόλου), «Πώς να τους προσεγγίσετε» (3–5 συγκεκριμένες ενέργειες: προϊόντα/μάρκες για cross-sell, χρονισμός προσφορών, target group για νέους πελάτες).`,
      },
    ],
    temperature: 0.3,
    maxTokens: 1800,
  });
  const text = answer.choices[0]?.message?.content?.trim() ?? "";
  const profiles = { ...((seg.profiles ?? {}) as Record<string, unknown>), [key]: { text, at: new Date().toISOString() } };
  await prisma.industrySegmentation.update({ where: { tenantId }, data: { profiles: profiles as Prisma.InputJsonValue } });
  return text;
}
