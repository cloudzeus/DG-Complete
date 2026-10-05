import type { Metadata } from "next";
import { Server } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildCubeCompose } from "@/lib/cube-compose";
import { getCubeDeployment, JWT_ISSUER, jwtAudience } from "@/lib/cube";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { TENANT_GROUP } from "@/lib/warehouse";
import { CubeSettingsForm } from "./cube-settings-form";
import { CopyBlock } from "./copy-block";
import { EnvPanel } from "./env-panel";

export const metadata: Metadata = { title: "Cube server" };

export default async function CubePage() {
  await requirePermission("platform.settings.manage");
  const [deployment, connections] = await Promise.all([
    getCubeDeployment(),
    prisma.dataConnection.findMany({
      where: { purpose: "CUBE_WAREHOUSE", engine: "POSTGRES" },
      select: { id: true, name: true, environment: true, host: true, database: true, lastTestStatus: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const wh = deployment?.warehouseConnection;
  const dev = deployment?.devConnection;
  const yaml =
    deployment && wh
      ? buildCubeCompose({
          apiUrl: deployment.apiUrl,
          devUrl: deployment.devUrl,
          controlPlaneUrl: deployment.controlPlaneUrl,
          jwtIssuer: JWT_ISSUER,
          jwtAudience: jwtAudience(deployment.apiUrl),
          warehouse: { host: wh.host, port: wh.port, database: wh.database, ssl: wh.ssl },
          dev: dev ? { host: dev.host, port: dev.port, database: dev.database, ssl: dev.ssl } : null,
        })
      : null;

  return (
    <>
      <PageHeader
        eyebrow="Ρυθμίσεις"
        title="Cube server"
        icon={Server}
        tone="red"
        description="Ρύθμιση του Cube.dev στο Coolify από τις αποθηκευμένες συνδέσεις. Το YAML δεν περιέχει secrets — αυτά δίνονται ξεχωριστά ως environment variables."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Ρυθμίσεις</CardTitle>
            <CardDescription>Ποιες βάσεις διαβάζει το Cube και σε ποια domains τρέχει.</CardDescription>
          </CardHeader>
          <CardContent>
            <CubeSettingsForm
              connections={connections}
              values={
                deployment
                  ? {
                      apiUrl: deployment.apiUrl,
                      devUrl: deployment.devUrl ?? "",
                      controlPlaneUrl: deployment.controlPlaneUrl,
                      warehouseConnectionId: deployment.warehouseConnectionId ?? "",
                      devConnectionId: deployment.devConnectionId ?? "",
                    }
                  : undefined
              }
            />
          </CardContent>
        </Card>

        {yaml && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>2. docker-compose για το Coolify</CardTitle>
                <CardDescription>
                  Coolify → New Resource → <b>Docker Compose Empty</b> → επικόλληση. Μετά ορίστε τα domains:{" "}
                  <code className="font-mono">cube</code> → <code className="font-mono">{deployment!.apiUrl}</code>
                  {deployment!.devUrl && dev && (
                    <>
                      {" "}
                      και <code className="font-mono">cube_dev</code> →{" "}
                      <code className="font-mono">{deployment!.devUrl}</code>
                    </>
                  )}
                  , internal port <code className="font-mono">4000</code>. Διαγράψτε όποιο αυτόματο domain έχει
                  προσθέσει το Coolify.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CopyBlock text={yaml} filename="dgsmartbi-cube.yml" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3. Environment variables</CardTitle>
                <CardDescription>
                  Coolify → Environment Variables → <b>Developer view</b> → επικόλληση. Περιέχουν secrets — η κάθε
                  εμφάνιση καταγράφεται.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EnvPanel />
              </CardContent>
            </Card>

            <Alert>
              <AlertTitle>4. Πρόσβαση στη βάση από το Coolify</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  Το Cube συνδέεται στη <code className="font-mono">{wh!.database}</code> με έναν ρόλο ανά πελάτη (
                  <code className="font-mono">r_&lt;tenant&gt;</code>, μέλη του group{" "}
                  <code className="font-mono">{TENANT_GROUP}</code>). Στο <code className="font-mono">pg_hba.conf</code>{" "}
                  του {wh!.host} βάλτε αυτές τις γραμμές <b>πάνω</b> από τους γενικούς κανόνες — η δεύτερη εμποδίζει
                  τους ρόλους πελατών να συνδεθούν σε οποιαδήποτε άλλη βάση του server:
                </p>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                  {`host  ${wh!.database}  +${TENANT_GROUP}  <COOLIFY_IP>/32  scram-sha-256
host  all  +${TENANT_GROUP}  0.0.0.0/0  reject${dev ? `\nhost  ${dev.database}  all  <COOLIFY_IP>/32  scram-sha-256` : ""}`}
                </pre>
                <p>Μετά: <code className="font-mono">SELECT pg_reload_conf();</code></p>
              </AlertDescription>
            </Alert>
          </>
        )}
      </div>
    </>
  );
}
