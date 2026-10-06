import "server-only";
import type { Client } from "pg";
import { prisma } from "@/lib/prisma";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Πρόβλεψη & στόχοι: year-end forecast (actual months + the rest from last year × this year's
// pace, with a range), break-even (fixed costs from the General Ledger, or entered by hand), the
// budget vs actual, and the 13-week cash forecast that the scenario sliders move.

const qi = (v: string) => `"${v.replace(/"/g, '""')}"`;
const has = async (db: Client, s: string, t: string) => !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.${t}`])).rows[0]?.t;

export type ForecastMonth = {
  month: number; // 1–12
  revenue: number | null; // actual (current month: so far)
  margin: number | null;
  lastYear: number;
  lastYearMargin: number;
  forecast: number | null; // remaining months (current month: full-month estimate)
  forecastMargin: number | null;
  low: number | null;
  high: number | null;
  budget: number | null;
  budgetMargin: number | null;
};

export type Planning = {
  year: number;
  months: ForecastMonth[];
  totals: { actual: number; forecastYear: number; low: number; high: number; lastYear: number; marginYear: number; lastYearMargin: number; budget: number | null; budgetMargin: number | null };
  pace: { ytd: number | null; recent: number | null; used: number };
  breakEven: {
    source: "gl" | "manual" | null;
    fixedYear: number | null;
    marginRatio: number | null;
    revenue12m: number;
    breakEvenRevenue: number | null;
    safetyPct: number | null;
    fixedParts: { name: string; value: number }[];
  };
  cash: { balance: number; weeks: { week: number; start: string; inflow: number; outflow: number }[]; minCash: number | null };
  settings: { fixedCostsMonthly: number | null; minCash: number | null };
};

const SECTION_NAMES: Record<string, string> = { OPEX: "Λειτουργικά έξοδα", DEPRECIATION: "Αποσβέσεις", FINANCIAL: "Χρηματοοικονομικά" };

export async function planning(tenantId: string, year = new Date().getFullYear()): Promise<Planning> {
  const s = qi(schemaName(tenantId));
  const [budget, settings] = await Promise.all([
    prisma.budgetMonth.findMany({ where: { tenantId, year } }),
    prisma.planningSettings.findUnique({ where: { tenantId } }),
  ]);
  const now = new Date();
  const curMonth = year === now.getFullYear() ? now.getMonth() + 1 : year < now.getFullYear() ? 13 : 0;
  const dayShare = curMonth <= 12 && curMonth > 0 ? now.getDate() / new Date(year, curMonth, 0).getDate() : 1;

  return withWarehouse(async (db) => {
    const monthly = await db.query(
      `SELECT EXTRACT(YEAR FROM trndate)::int AS y, EXTRACT(MONTH FROM trndate)::int AS m, SUM(net)::float AS rev, SUM(net - COALESCE(cost, 0))::float AS margin
       FROM ${s}.f_sales_lines WHERE trndate >= $1 AND trndate < $2 GROUP BY 1, 2`,
      [`${year - 1}-01-01`, `${year + 1}-01-01`],
    );
    const get = (y: number, m: number) => monthly.rows.find((x) => Number(x.y) === y && Number(x.m) === m);
    const cur = Array.from({ length: 12 }, (_, i) => ({ rev: Number(get(year, i + 1)?.rev ?? 0), margin: Number(get(year, i + 1)?.margin ?? 0) }));
    const ly = Array.from({ length: 12 }, (_, i) => ({ rev: Number(get(year - 1, i + 1)?.rev ?? 0), margin: Number(get(year - 1, i + 1)?.margin ?? 0) }));

    // Pace vs last year: year to date (full months) and the last 3 full months; blended 60/40.
    const full = Math.max(0, Math.min(12, curMonth - 1));
    const sum = (a: { rev: number }[], from: number, to: number) => a.slice(from, to).reduce((x, v) => x + v.rev, 0);
    const ytd = full > 0 && sum(ly, 0, full) > 0 ? sum(cur, 0, full) / sum(ly, 0, full) : null;
    const recent = full >= 3 && sum(ly, full - 3, full) > 0 ? sum(cur, full - 3, full) / sum(ly, full - 3, full) : null;
    const used = Math.min(2, Math.max(0.3, ytd !== null && recent !== null ? 0.6 * ytd + 0.4 * recent : (ytd ?? recent ?? 1)));
    // Spread of the monthly ratios this year → the range of the forecast.
    const ratios = cur.slice(0, full).map((v, i) => (ly[i].rev > 0 ? v.rev / ly[i].rev : null)).filter((v): v is number => v !== null);
    const mean = ratios.length ? ratios.reduce((a, v) => a + v, 0) / ratios.length : used;
    const sd = ratios.length > 1 ? Math.sqrt(ratios.reduce((a, v) => a + (v - mean) ** 2, 0) / (ratios.length - 1)) : 0.15;
    const band = Math.min(0.5, Math.max(0.05, sd / Math.sqrt(Math.max(1, 12 - full))));
    const lyMarginPct = ly.reduce((a, v) => a + v.margin, 0) / Math.max(1, ly.reduce((a, v) => a + v.rev, 0));
    const curMarginPct = full > 0 && sum(cur, 0, full) > 0 ? cur.slice(0, full).reduce((a, v) => a + v.margin, 0) / sum(cur, 0, full) : lyMarginPct;

    const b = (m: number) => budget.find((x) => x.month === m);
    const months: ForecastMonth[] = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const past = m < curMonth;
      const isCur = m === curMonth;
      const fc = !past ? ly[i].rev * used : null;
      // Current month: what is already sold plus the rest of the month at the forecast pace.
      const fcCur = isCur && fc !== null ? cur[i].rev + fc * (1 - dayShare) : fc;
      return {
        month: m,
        revenue: past || isCur ? cur[i].rev : null,
        margin: past || isCur ? cur[i].margin : null,
        lastYear: ly[i].rev,
        lastYearMargin: ly[i].margin,
        forecast: fcCur,
        forecastMargin: fcCur === null ? null : isCur ? cur[i].margin + fc! * (1 - dayShare) * curMarginPct : fcCur * curMarginPct,
        low: fcCur === null ? null : fcCur * (1 - band),
        high: fcCur === null ? null : fcCur * (1 + band),
        budget: b(m)?.revenue === undefined || b(m)?.revenue === null ? null : Number(b(m)!.revenue),
        budgetMargin: b(m)?.margin === undefined || b(m)?.margin === null ? null : Number(b(m)!.margin),
      };
    });
    const actual = months.filter((x) => x.month < curMonth).reduce((a, x) => a + (x.revenue ?? 0), 0);
    const rest = months.filter((x) => x.month >= curMonth).reduce((a, x) => a + (x.forecast ?? 0), 0);
    const restLow = months.filter((x) => x.month >= curMonth).reduce((a, x) => a + (x.low ?? 0), 0);
    const restHigh = months.filter((x) => x.month >= curMonth).reduce((a, x) => a + (x.high ?? 0), 0);
    const marginYear = months.reduce((a, x) => a + (x.month < curMonth ? (x.margin ?? 0) : (x.forecastMargin ?? 0)), 0);
    const budgetTotal = budget.some((x) => x.revenue !== null) ? budget.reduce((a, x) => a + Number(x.revenue ?? 0), 0) : null;
    const budgetMargin = budget.some((x) => x.margin !== null) ? budget.reduce((a, x) => a + Number(x.margin ?? 0), 0) : null;

    // ── Break-even: fixed costs from the General Ledger P&L (12 months), else entered monthly.
    let source: Planning["breakEven"]["source"] = null;
    let fixedYear: number | null = null;
    let marginRatio: number | null = null;
    const fixedParts: { name: string; value: number }[] = [];
    const last12 = (await db.query(`SELECT COALESCE(SUM(net), 0)::float AS r, COALESCE(SUM(net - COALESCE(cost, 0)), 0)::float AS m FROM ${s}.f_sales_lines WHERE trndate >= now() - interval '12 months'`)).rows[0];
    let rev12 = Number(last12.r);
    const m12 = Number(last12.m);
    if ((await has(db, s, "fin_fact")) && (await has(db, s, "pnl_lines"))) {
      const r = await db.query(
        `SELECT l.section, SUM(f.amount)::float AS amt FROM ${s}.fin_fact f JOIN ${s}.pnl_lines l ON l.code = f.line_code
         WHERE f.trndate >= now() - interval '12 months' GROUP BY 1`,
      );
      const sec = new Map(r.rows.map((x) => [x.section as string, Number(x.amt)]));
      const fixed = ["OPEX", "DEPRECIATION", "FINANCIAL"].reduce((a, k) => a + Math.max(0, -(sec.get(k) ?? 0)), 0);
      if (fixed > 0 && (sec.get("REVENUE") ?? 0) > 0) {
        source = "gl";
        fixedYear = fixed;
        marginRatio = (sec.get("REVENUE")! + (sec.get("COGS") ?? 0)) / sec.get("REVENUE")!;
        rev12 = sec.get("REVENUE")!; // same source as the costs
        for (const k of ["OPEX", "DEPRECIATION", "FINANCIAL"]) if ((sec.get(k) ?? 0) < 0) fixedParts.push({ name: SECTION_NAMES[k], value: -sec.get(k)! });
      }
    }
    if (source === null && settings?.fixedCostsMonthly) {
      source = "manual";
      fixedYear = Number(settings.fixedCostsMonthly) * 12;
      marginRatio = rev12 > 0 ? m12 / rev12 : null;
      fixedParts.push({ name: "Σταθερά έξοδα (δηλωμένα)", value: fixedYear });
    }
    const breakEvenRevenue = fixedYear !== null && marginRatio && marginRatio > 0 ? fixedYear / marginRatio : null;

    // ── Cash: today's balance and the 13-week forecast.
    let balance = 0;
    let weeks: Planning["cash"]["weeks"] = [];
    if (await has(db, s, "m_cash_monthly")) balance = Number((await db.query(`SELECT balance::float AS b FROM ${s}.m_cash_monthly ORDER BY month DESC LIMIT 1`)).rows[0]?.b ?? 0);
    if (await has(db, s, "m_cash_forecast")) {
      weeks = (await db.query(`SELECT week, week_start, inflow::float, outflow::float FROM ${s}.m_cash_forecast ORDER BY week`)).rows.map((x) => ({
        week: Number(x.week),
        start: new Date(x.week_start).toISOString().slice(0, 10),
        inflow: Number(x.inflow),
        outflow: Number(x.outflow),
      }));
    }

    return {
      year,
      months,
      totals: { actual, forecastYear: actual + rest, low: actual + restLow, high: actual + restHigh, lastYear: ly.reduce((a, v) => a + v.rev, 0), marginYear, lastYearMargin: ly.reduce((a, v) => a + v.margin, 0), budget: budgetTotal, budgetMargin },
      pace: { ytd, recent, used },
      breakEven: { source, fixedYear, marginRatio, revenue12m: rev12, breakEvenRevenue, safetyPct: breakEvenRevenue && rev12 > 0 ? ((rev12 - breakEvenRevenue) / rev12) * 100 : null, fixedParts },
      cash: { balance, weeks, minCash: settings?.minCash ? Number(settings.minCash) : null },
      settings: { fixedCostsMonthly: settings?.fixedCostsMonthly ? Number(settings.fixedCostsMonthly) : null, minCash: settings?.minCash ? Number(settings.minCash) : null },
    };
  });
}

/** Suggested budget: last year's month × (1 + growth %). */
export async function suggestBudget(tenantId: string, year: number, growthPct: number) {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const r = await db.query(
      `SELECT EXTRACT(MONTH FROM trndate)::int AS m, SUM(net)::float AS rev, SUM(net - COALESCE(cost, 0))::float AS margin
       FROM ${s}.f_sales_lines WHERE trndate >= $1 AND trndate < $2 GROUP BY 1`,
      [`${year - 1}-01-01`, `${year}-01-01`],
    );
    const f = 1 + growthPct / 100;
    return Array.from({ length: 12 }, (_, i) => {
      const x = r.rows.find((v) => Number(v.m) === i + 1);
      return { month: i + 1, revenue: Math.round(Number(x?.rev ?? 0) * f), margin: Math.round(Number(x?.margin ?? 0) * f) };
    });
  });
}
