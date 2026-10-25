import type { Metadata } from "next";
import { Database, Server } from "lucide-react";
import { SectionTitle } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { openCredentials } from "@/lib/connections";
import { prisma } from "@/lib/prisma";
import { can, requireUser } from "@/lib/rbac";
import type { ConnectionPurpose } from "@/lib/generated/prisma/enums";
import { ConnectionDialog, type ConnectionFormValues } from "./connection-dialog";
import { ConnectionRowActions } from "./connection-row-actions";

export const metadata: Metadata = { title: "Συνδέσεις δεδομένων" };

const ENGINE_LABEL = { POSTGRES: "PostgreSQL", MYSQL: "MySQL", MSSQL: "SQL Server" } as const;

export default async function ConnectionsPage() {
  const user = await requireUser();
  const canWarehouse = can(user, "connections.warehouse.manage");
  const canTenant = can(user, "connections.tenant.manage");

  const purposes: ConnectionPurpose[] = [
    ...(canWarehouse ? (["CUBE_WAREHOUSE"] as const) : []),
    ...(canTenant ? (["TENANT_SOURCE"] as const) : []),
  ];

  const [connections, tenants] = await Promise.all([
    prisma.dataConnection.findMany({
      where: { purpose: { in: purposes } },
      include: { tenant: { select: { name: true } } },
      orderBy: [{ purpose: "asc" }, { name: "asc" }],
    }),
    prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const rows = connections.map((c) => {
    // Username is decrypted server-side for the edit form; the password never leaves the server.
    const values: ConnectionFormValues = {
      id: c.id,
      name: c.name,
      purpose: c.purpose,
      engine: c.engine,
      environment: c.environment,
      host: c.host,
      port: c.port,
      database: c.database,
      ssl: c.ssl,
      tenantId: c.tenantId ?? "",
      username: openCredentials(c.id, c.credentialsEnc).username,
    };
    return { ...c, values };
  });

  const sections = [
    {
      purpose: "CUBE_WAREHOUSE" as const,
      title: "Βάσεις Cube",
      description: "Οι βάσεις από τις οποίες διαβάζει ο Cube server (π.χ. cubebiproduction, cubebidev).",
      icon: Server,
      visible: canWarehouse,
    },
    {
      purpose: "TENANT_SOURCE" as const,
      title: "Πηγές δεδομένων πελατών",
      description: "Βάσεις που συνδέουμε για λογαριασμό κάθε πελάτη.",
      icon: Database,
      visible: canTenant,
    },
  ].filter((s) => s.visible);

  return (
    <>
      <PageHeader
        eyebrow="Ρυθμίσεις"
        title="Συνδέσεις δεδομένων"
        description="Τα credentials αποθηκεύονται κρυπτογραφημένα (AES-256-GCM) και δεν εμφανίζονται ποτέ ξανά."
        icon={Database}
        tone="teal"
        actions={<ConnectionDialog tenants={tenants} allowedPurposes={purposes} />}
      />

      <div className="space-y-6">
        {sections.map((section) => {
          const list = rows.filter((r) => r.purpose === section.purpose);
          return (
            <Card key={section.purpose}>
              <CardHeader>
                <CardTitle>
                  <SectionTitle icon={section.icon} tone={section.purpose === "CUBE_WAREHOUSE" ? "red" : "teal"}>
                    {section.title}
                  </SectionTitle>
                </CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {list.length === 0 ? (
                  <p className="py-6 text-center text-muted-foreground">Δεν υπάρχουν συνδέσεις ακόμα.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Όνομα</TableHead>
                          {section.purpose === "TENANT_SOURCE" && <TableHead>Πελάτης</TableHead>}
                          <TableHead>Server</TableHead>
                          <TableHead>Βάση</TableHead>
                          <TableHead>Περιβάλλον</TableHead>
                          <TableHead>Κατάσταση</TableHead>
                          <TableHead className="w-0" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">
                              {c.name}
                              <div className="text-xs text-muted-foreground">{ENGINE_LABEL[c.engine]}</div>
                            </TableCell>
                            {section.purpose === "TENANT_SOURCE" && <TableCell>{c.tenant?.name}</TableCell>}
                            <TableCell className="font-mono text-xs">
                              {c.host}:{c.port}
                              {c.ssl && <span className="ml-1 text-muted-foreground">· SSL</span>}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{c.database}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{c.environment === "PRODUCTION" ? "Production" : "Development"}</Badge>
                            </TableCell>
                            <TableCell>
                              <TestStatus status={c.lastTestStatus} error={c.lastTestError} testedAt={c.lastTestedAt} />
                            </TableCell>
                            <TableCell>
                              <ConnectionRowActions values={c.values} tenants={tenants} allowedPurposes={purposes} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function TestStatus({ status, error, testedAt }: { status: string; error: string | null; testedAt: Date | null }) {
  const when = testedAt?.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" });
  if (status === "OK")
    return (
      <span className="flex flex-col gap-0.5">
        <StatusPill tone="green">Επιτυχής</StatusPill>
        <span className="text-xs text-muted-foreground">{when}</span>
      </span>
    );
  if (status === "FAILED")
    return (
      <span className="flex max-w-56 flex-col gap-0.5" title={error ?? undefined}>
        <StatusPill tone="red">Αποτυχία</StatusPill>
        <span className="truncate text-xs text-muted-foreground">{error}</span>
      </span>
    );
  return <StatusPill tone="slate">Μη ελεγμένη</StatusPill>;
}
