import "server-only";
import { APP_URL, sendTemplate } from "@/lib/email";
import { buildInsights } from "@/lib/insights";
import { chatCompletion, getAiSettings } from "@/lib/openrouter";
import { resolvePeriod } from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { profitability } from "@/lib/profitability";
import { hasService } from "@/lib/tenant-services";
import { workingCapital } from "@/lib/working-capital";

// Κίμων's weekly report: every Monday morning (Athens) the facts of the past week — sales vs the
// week before and the same week last year, the overview findings, working capital, profit change,
// urgent orders — written up by the AI as a short management note and emailed to the users who
// opted in (Ειδοποιήσεις). Once per tenant and ISO week; without AI a plain summary goes out.

const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
const pct = (now: number, prev: number) => (prev ? `${now >= prev ? "+" : ""}${Math.round(((now - prev) / Math.abs(prev)) * 100)}%` : "—");

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - y.getTime()) / 86_400_000 + 1) / 7)).padStart(2, "0")}`;
}

/** The facts the report is written from (plain text for the model, also the fallback). */
async function collectFacts(tenantId: string) {
  const week = resolvePeriod({ period: "7d" });
  const ytd = resolvePeriod({ period: "ytd" });
  const [w, y, wc, pr, urgent] = await Promise.all([
    buildInsights(tenantId, week).catch(() => null),
    buildInsights(tenantId, ytd).catch(() => null),
    workingCapital(tenantId).catch(() => null),
    profitability(tenantId).catch(() => null),
    (async () => {
      const { withWarehouse } = await import("@/lib/warehouse-writer");
      const { schemaName } = await import("@/lib/warehouse");
      return withWarehouse(async (db) => {
        const r = await db.query(`SELECT COUNT(*)::int AS n FROM "${schemaName(tenantId)}".m_item_stats WHERE suggested_order_qty > 0 AND stock_qty <= 0 AND abc = 'A'`);
        return Number(r.rows[0]?.n ?? 0);
      }).catch(() => null);
    })(),
  ]);
  const lines: string[] = [];
  if (w) {
    const k = w.kpis;
    lines.push(
      `Εβδομάδα ${week.from} – ${week.to}: πωλήσεις ${eur(k.revenue.now)} (${pct(k.revenue.now, k.revenue.prev)} έναντι της προηγούμενης περιόδου), μικτό κέρδος ${eur(k.margin.now)}, περιθώριο ${k.marginPct.now.toFixed(1)}%, ${k.documents.now} παραστατικά, ${k.customers.now} πελάτες.`,
    );
  }
  if (y) lines.push(`Από αρχή έτους: πωλήσεις ${eur(y.kpis.revenue.now)} (${pct(y.kpis.revenue.now, y.kpis.revenue.prev)} έναντι πέρσι), μικτό κέρδος ${eur(y.kpis.margin.now)}.`);
  if (pr) lines.push(`Μεταβολή μικτού κέρδους έτους: ${pr.steps.filter((s) => !s.total).map((s) => `${s.name} ${s.value >= 0 ? "+" : "−"}${eur(Math.abs(s.value))}`).join(", ")}.`);
  if (wc?.now.ccc !== null && wc) {
    lines.push(
      `Κεφάλαιο κίνησης: κύκλος μετρητών ${Math.round(wc.now.ccc ?? 0)} ημέρες (απόθεμα ${Math.round(wc.now.dio ?? 0)}, είσπραξη ${Math.round(wc.now.dso ?? 0)}, πληρωμή προμηθευτών ${Math.round(wc.now.dpo ?? 0)}). Ληξιπρόθεσμα πελατών άνω των 90 ημερών ${eur(wc.overdue.d90plus)}.`,
    );
  }
  if (urgent) lines.push(`Αποθήκη: ${urgent} είδη τάξης Α εξαντλημένα με πρόταση παραγγελίας.`);
  const insights = [...(w?.insights ?? []), ...(y?.insights ?? [])]
    .filter((i, idx, all) => all.findIndex((x) => x.title === i.title) === idx)
    .slice(0, 10)
    .map((i) => `- [${i.area}] ${i.title}: ${i.detail}${i.action ? ` → ${i.action}` : ""}`);
  return { week, facts: lines.join("\n"), insights };
}

/** The report text (our mini-markup: **bold**, «- » lists, blank lines). */
export async function weeklyReportText(tenantId: string, tenantName: string): Promise<{ text: string; week: string; ai: boolean }> {
  const { week, facts, insights } = await collectFacts(tenantId);
  const label = `${new Date(week.from).toLocaleDateString("el-GR", { day: "numeric", month: "numeric" })} – ${new Date(week.to).toLocaleDateString("el-GR", { day: "numeric", month: "numeric" })}`;
  const settings = await getAiSettings();
  if (settings.enabled) {
    try {
      const r = await chatCompletion({
        tenantId,
        feature: "weekly_report",
        temperature: 0.3,
        maxTokens: 1200,
        messages: [
          {
            role: "system",
            content:
              "Είσαι ο Κίμων, ο ψηφιακός σύμβουλος του DGsmart BI. Γράφεις την εβδομαδιαία αναφορά για τη διοίκηση μιας εμπορικής εταιρείας: στα ελληνικά, σύντομα (έως 220 λέξεις), σαν έμπειρος οικονομικός διευθυντής. ΜΟΝΟ τα νούμερα που δίνονται — μην επινοείς. Μορφή: τρεις ενότητες με τίτλους σε **έντονα** σε δική τους γραμμή: «**Η εβδομάδα με μια ματιά**» (2–3 προτάσεις), «**Τι θέλει προσοχή**» (2–4 κουκκίδες «- »), «**Τι να κάνετε αυτή την εβδομάδα**» (2–3 συγκεκριμένες ενέργειες «- »). Κενή γραμμή ανάμεσα στις ενότητες. Χωρίς χαιρετισμό και υπογραφή.",
          },
          { role: "user", content: `Εταιρεία: ${tenantName}\n\nΣτοιχεία:\n${facts}\n\nΕυρήματα:\n${insights.join("\n") || "—"}` },
        ],
      });
      const text = (r.choices[0]?.message?.content ?? "").trim();
      if (text.length > 80) return { text, week: label, ai: true };
    } catch (err) {
      console.error("[weekly] AI:", (err as Error).message);
    }
  }
  // Without AI: the facts and the top findings as they are.
  const text = [`**Η εβδομάδα με μια ματιά**`, facts.split("\n").join("\n\n"), `**Τι θέλει προσοχή**`, insights.slice(0, 5).join("\n") || "- Δεν υπάρχουν σημαντικά ευρήματα."].join("\n\n");
  return { text, week: label, ai: false };
}

/** Sends the report of one tenant to the given addresses (or the opted-in users). */
export async function sendWeeklyReport(tenantId: string, opts: { to?: { email: string; name: string }[]; force?: boolean } = {}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  if (!tenant) return { sent: 0, error: "Ο πελάτης δεν βρέθηκε." };
  const recipients =
    opts.to ??
    (
      await prisma.membership.findMany({
        where: { tenantId, weeklyReport: true, user: { active: true } },
        select: { user: { select: { email: true, name: true } } },
      })
    ).map((m) => m.user);
  if (!recipients.length) return { sent: 0 };
  const key = isoWeek(new Date());
  const report = await weeklyReportText(tenantId, tenant.name);
  let sent = 0;
  for (const r of recipients) {
    const res = await sendTemplate({
      template: "weekly_report",
      to: [r.email],
      tenantId,
      force: opts.force,
      dedupeKey: opts.force ? undefined : `weekly:${tenantId}:${key}`,
      vars: { name: r.name?.split(" ")[0] ?? "", tenant: tenant.name, week: report.week, summary: report.text, link: `${APP_URL}/dashboards/${tenantId}` },
    });
    if (res.ok && !res.skipped) sent++;
  }
  return { sent, ai: report.ai };
}

/** Hourly: on Monday from 07:00 Athens, the week's report of every tenant with Κίμων (once a week). */
export async function runWeeklyReports() {
  const athens = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Athens" }));
  if (athens.getDay() !== 1 || athens.getHours() < 7) return { skipped: "not Monday morning" };
  const key = isoWeek(new Date());
  const tenants = await prisma.tenant.findMany({
    where: { status: { not: "CANCELED" }, memberships: { some: { weeklyReport: true } } },
    select: { id: true },
  });
  let sent = 0;
  for (const t of tenants) {
    if (!(await hasService(t.id, "kimon"))) continue;
    // Already done this week (the report is written once per tenant).
    if (await prisma.emailLog.findFirst({ where: { dedupeKey: { startsWith: `weekly:${t.id}:${key}|` } }, select: { id: true } })) continue;
    try {
      sent += (await sendWeeklyReport(t.id)).sent;
    } catch (err) {
      console.error("[weekly]", t.id, (err as Error).message);
    }
  }
  return { sent };
}
