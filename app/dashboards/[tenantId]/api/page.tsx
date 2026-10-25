import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DATASETS } from "@/lib/api-datasets";
import { requireDashboardTenant } from "@/lib/dashboards";
import { APP_URL } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { ApiKeys } from "./api-keys";

export const metadata: Metadata = { title: "Web services" };

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg bg-[#14161b] p-3 text-xs leading-relaxed text-slate-100">{children}</pre>;
}

export default async function ApiPage({ params }: PageProps<"/dashboards/[tenantId]/api">) {
  const { tenantId } = await params;
  const { user, access } = await requireDashboardTenant(tenantId, "api");
  const canManage = can(user, "tenant.apikeys.manage", tenantId);
  const keys = await prisma.apiKey.findMany({ where: { tenantId }, orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }] });
  const datasets = DATASETS.filter((d) => access.services.has(d.service));
  const base = `${APP_URL}/api/v1`;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Web services</h1>
        <p className="text-xs text-muted-foreground">
          Τα αποτελέσματα του DGsmart BI μέσα στις δικές σας εφαρμογές (ERP, intranet, e-shop, Excel / Power BI): JSON μέσω HTTPS με API key.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Κάθε κλήση στέλνει το κλειδί στο header <code>Authorization: Bearer dgbi_…</code>. Τα κλειδιά δίνουν πρόσβαση μόνο στα δεδομένα της εταιρείας σας και
            μόνο στις υπηρεσίες του πακέτου σας · έως 120 αιτήματα ανά λεπτό ανά κλειδί. Χρησιμοποιήστε τα μόνο από server — ποτέ μέσα σε ιστοσελίδα.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeys
            tenantId={tenantId}
            canManage={canManage}
            keys={keys.map((k) => ({
              id: k.id,
              name: k.name,
              prefix: k.prefix,
              createdAt: k.createdAt.toISOString(),
              lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
              revoked: !!k.revokedAt,
            }))}
          />
          {!canManage && <p className="mt-2 text-xs text-muted-foreground">Κλειδιά δημιουργεί ο διαχειριστής της εταιρείας σας.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Έτοιμα σύνολα δεδομένων</CardTitle>
          <CardDescription>
            <code>GET {base}/datasets/{"{key}"}</code> · περίοδος με <code>?period=</code>today, 7d, 30d, mtd, qtd, ytd, 12m, last_year ή <code>?from=YYYY-MM-DD&amp;to=YYYY-MM-DD</code> ·{" "}
            <code>&amp;limit=</code> έως 10.000.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="py-2 pr-3 font-medium">key</th>
                  <th className="py-2 pr-3 font-medium">Περιεχόμενο</th>
                  <th className="py-2 font-medium">Περίοδος</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.key} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3">
                      <code className="text-xs">{d.key}</code>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{d.title}</div>
                      <div className="text-xs text-muted-foreground">{d.description}</div>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{d.periodic ? "ναι" : "στιγμιότυπο"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Code>{`curl -H "Authorization: Bearer $DGBI_KEY" \\
  "${base}/datasets/${datasets[0]?.key ?? "sales-monthly"}?period=ytd"`}</Code>
          <Code>{`{
  "dataset": "sales-monthly",
  "period": { "from": "2026-01-01", "to": "2026-10-06" },
  "count": 10,
  "data": [
    { "sales_lines.date.month": "2026-01-01T00:00:00.000", "sales_lines.revenue": 152340.12, "sales_lines.margin_pct": 27.4, … }
  ]
}`}</Code>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Δείκτες, κατάλογος και δικά σας ερωτήματα</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <code>GET {base}/kpis?period=ytd</code> — οι δείκτες και τα ευρήματα της Επισκόπησης.
          </p>
          <p>
            <code>GET {base}/meta</code> — όλα τα μεγέθη και οι διαστάσεις που μπορείτε να ζητήσετε (π.χ. <code>sales_lines.revenue</code>,{" "}
            <code>sales_lines.category</code>).
          </p>
          <p>
            <code>POST {base}/query</code> — δικό σας ερώτημα:
          </p>
          <Code>{`curl -X POST -H "Authorization: Bearer $DGBI_KEY" -H "Content-Type: application/json" \\
  "${base}/query" -d '{
  "query": {
    "measures": ["sales_lines.revenue", "sales_lines.margin_pct"],
    "dimensions": ["sales_lines.brand"],
    "timeDimensions": [{ "dimension": "sales_lines.date", "dateRange": ["2026-01-01", "2026-06-30"] }],
    "order": { "sales_lines.revenue": "desc" },
    "limit": 20
  }
}'`}</Code>
          <p className="text-xs text-muted-foreground">
            Σφάλματα: 401 λάθος ή ανακληθέν κλειδί · 403 εκτός πακέτου · 429 πολλά αιτήματα · 400 λάθος ερώτημα (το μήνυμα εξηγεί τι λείπει).
          </p>
        </CardContent>
      </Card>
    </>
  );
}
