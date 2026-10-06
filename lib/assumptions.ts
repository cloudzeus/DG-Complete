import "server-only";
import { prisma } from "@/lib/prisma";

// Assumptions behind the estimates (Ρυθμίσεις → Πρόβλεψη & στόχοι → Παράμετροι), per tenant.

export const DEFAULT_ASSUMPTIONS = { perDocument: 8, financingRate: 0.08, returnsHandling: 0.05, lostShare: 0.5 };
export type Assumptions = typeof DEFAULT_ASSUMPTIONS;

export async function getAssumptions(tenantId: string): Promise<Assumptions> {
  const s = await prisma.planningSettings.findUnique({ where: { tenantId }, select: { costPerDocument: true, financingRatePct: true, lostSharePct: true } });
  return {
    perDocument: s?.costPerDocument != null ? Number(s.costPerDocument) : DEFAULT_ASSUMPTIONS.perDocument,
    financingRate: s?.financingRatePct != null ? Number(s.financingRatePct) / 100 : DEFAULT_ASSUMPTIONS.financingRate,
    returnsHandling: DEFAULT_ASSUMPTIONS.returnsHandling,
    lostShare: s?.lostSharePct != null ? Number(s.lostSharePct) / 100 : DEFAULT_ASSUMPTIONS.lostShare,
  };
}
