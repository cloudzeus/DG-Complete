import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can, requireUser } from "@/lib/rbac";
import { customerStatement } from "@/lib/smart/statement";
import { statementPdf } from "@/lib/smart/statement-pdf";
import { hasService } from "@/lib/tenant-services";

// GET /api/smart/statement?tenant=…&trdr=… — the customer statement PDF (preview / download).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenant") ?? "";
  const trdr = Number(url.searchParams.get("trdr"));
  const user = await requireUser();
  if (!can(user, "tenant.dashboards.view", tenantId) || !(await hasService(tenantId, "collections"))) return NextResponse.json({ error: "Δεν έχετε πρόσβαση." }, { status: 403 });
  if (!Number.isInteger(trdr) || trdr <= 0) return NextResponse.json({ error: "Μη έγκυρος πελάτης." }, { status: 400 });
  try {
    const [tenant, s] = await Promise.all([prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }), customerStatement(tenantId, trdr)]);
    const pdf = await statementPdf(s, tenant?.name ?? "", null);
    const name = `kartela-${(s.customer.code ?? String(trdr)).replace(/[^\w.-]/g, "_")}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message.slice(0, 300) }, { status: 500 });
  }
}
