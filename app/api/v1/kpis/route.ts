import { apiHandler, apiJson } from "@/lib/api-v1";
import { buildInsights } from "@/lib/insights";
import { resolvePeriod } from "@/lib/period";

// GET /api/v1/kpis?period=ytd — the overview's KPIs and findings for a period.
export const GET = apiHandler(async (req, { tenantId }) => {
  const period = resolvePeriod(Object.fromEntries(new URL(req.url).searchParams));
  const { kpis, insights } = await buildInsights(tenantId, period);
  return apiJson({
    period: { from: period.from, to: period.to, compareFrom: period.prevFrom, compareTo: period.prevTo },
    kpis,
    insights: insights.map((i) => ({ area: i.area, severity: i.severity, title: i.title, detail: i.detail, action: i.action ?? null })),
  });
});
