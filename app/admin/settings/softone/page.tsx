import type { Metadata } from "next";
import { PlugZap } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/rbac";
import { getDgsoftConnection, openSoftOneCredentials } from "@/lib/softone";
import { saveSoftOne, testSoftOneDraft } from "../actions";
import { SoftOneForm } from "@/components/admin/softone-form";

export const metadata: Metadata = { title: "SoftOne DGsoft" };

export default async function SoftOneSettingsPage() {
  await requirePermission("platform.settings.manage");
  const conn = await getDgsoftConnection();

  return (
    <>
      <PageHeader
        eyebrow="Ρυθμίσεις"
        title="SoftOne DGsoft"
        description="Η σύνδεση με το SoftOne της DGsoft: πελάτες → tenants και παραστατικά συνδρομών."
        icon={PlugZap}
        tone="violet"
      />
      <Card>
        <CardHeader>
          <CardTitle>
            <SectionTitle
              icon={PlugZap}
              tone="violet"
              extra={
                conn &&
                (conn.lastTestStatus === "OK" ? (
                  <StatusPill tone="green">Συνδεδεμένο</StatusPill>
                ) : conn.lastTestStatus === "UNTESTED" ? (
                  <StatusPill tone="slate">Ημιτελής</StatusPill>
                ) : (
                  <StatusPill tone="red">Σφάλμα</StatusPill>
                ))
              }
            >
              Στοιχεία Web Services
            </SectionTitle>
          </CardTitle>
          <CardDescription>
            Ο κωδικός και το session κρυπτογραφούνται· το session ανανεώνεται μία φορά την ημέρα.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SoftOneForm
            save={saveSoftOne}
            test={testSoftOneDraft}
            values={
              conn
                ? {
                    id: conn.id,
                    baseUrl: conn.baseUrl,
                    appId: conn.appId,
                    username: openSoftOneCredentials(conn.id, conn.credentialsEnc).username,
                    company: conn.company,
                    branch: conn.branch,
                    module: conn.module,
                    refId: conn.refId,
                  }
                : undefined
            }
          />
        </CardContent>
      </Card>
    </>
  );
}
