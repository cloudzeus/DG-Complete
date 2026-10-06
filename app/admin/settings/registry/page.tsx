import type { Metadata } from "next";
import { Landmark } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAfmSettings } from "@/lib/kad";
import { requirePermission } from "@/lib/rbac";
import { RegistryForm } from "./registry-form";

export const metadata: Metadata = { title: "Μητρώο ΑΦΜ · ΚΑΔ" };

export default async function RegistrySettingsPage() {
  await requirePermission("platform.settings.manage");
  const s = await getAfmSettings();
  return (
    <>
      <PageHeader
        eyebrow="Ρυθμίσεις"
        title="Μητρώο ΑΦΜ · ΚΑΔ"
        description="Οι κωδικοί δραστηριότητας (ΚΑΔ) των πελατών από το ΑΦΜ τους — η βάση της κλαδικής ανάλυσης. Κάθε ΑΦΜ ζητείται μία φορά και ανανεώνεται κάθε 6 μήνες."
        icon={Landmark}
        tone="violet"
        actions={s.enabled ? <StatusPill tone="green">Ενεργό</StatusPill> : <StatusPill tone="slate">Ανενεργό</StatusPill>}
      />
      <Card>
        <CardHeader>
          <CardTitle>
            <SectionTitle
              icon={Landmark}
              tone="violet"
              extra={s.lastTestAt && <StatusPill tone={s.lastTestOk ? "green" : "red"}>{s.lastTestOk ? "Επαληθευμένο" : "Σφάλμα"}</StatusPill>}
            >
              Υπηρεσία μητρώου
            </SectionTitle>
          </CardTitle>
          <CardDescription>Η κατηγοριοποίηση των ΚΑΔ σε κλάδους γίνεται με AI (OpenRouter) ανά πελάτη, από την καρτέλα του.</CardDescription>
        </CardHeader>
        <CardContent>
          {s.lastTestError && !s.lastTestOk && <p className="mb-3 text-sm text-destructive">{s.lastTestError}</p>}
          <RegistryForm values={{ url: s.url, enabled: s.enabled, batchSize: s.batchSize }} />
        </CardContent>
      </Card>
    </>
  );
}
