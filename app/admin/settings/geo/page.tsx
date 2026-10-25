import type { Metadata } from "next";
import { MapPinned } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getGeoSettings } from "@/lib/mapbox";
import { requirePermission } from "@/lib/rbac";
import { GeoForm } from "./geo-form";

export const metadata: Metadata = { title: "Χάρτες · Mapbox" };

export default async function GeoSettingsPage() {
  await requirePermission("platform.settings.manage");
  const s = await getGeoSettings();
  return (
    <>
      <PageHeader
        eyebrow="Ρυθμίσεις"
        title="Χάρτες · Mapbox"
        description="Geocoding των διευθύνσεων πελατών (μία φορά ανά διεύθυνση, permanent geocoding του Mapbox) και χάρτες για τη γεωγραφική ανάλυση πωλήσεων."
        icon={MapPinned}
        tone="teal"
        actions={s.enabled ? <StatusPill tone="green">Ενεργό</StatusPill> : <StatusPill tone="slate">Ανενεργό</StatusPill>}
      />
      <Card>
        <CardHeader>
          <CardTitle>
            <SectionTitle
              icon={MapPinned}
              tone="teal"
              extra={s.lastTestAt && <StatusPill tone={s.lastTestOk ? "green" : "red"}>{s.lastTestOk ? "Επαληθευμένο" : "Σφάλμα"}</StatusPill>}
            >
              Σύνδεση Mapbox
            </SectionTitle>
          </CardTitle>
          <CardDescription>
            Το token ελέγχεται με μια δοκιμαστική αναζήτηση πριν αποθηκευτεί. Το geocoding χρεώνεται από το Mapbox ως «permanent» (απαραίτητο για να
            αποθηκεύονται οι συντεταγμένες)· κάθε διεύθυνση γίνεται μία φορά, εκτός αν αλλάξει.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {s.lastTestError && !s.lastTestOk && <p className="mb-3 text-sm text-destructive">{s.lastTestError}</p>}
          <GeoForm values={{ keyHint: s.keyHint, enabled: s.enabled, batchSize: s.batchSize }} />
        </CardContent>
      </Card>
    </>
  );
}
