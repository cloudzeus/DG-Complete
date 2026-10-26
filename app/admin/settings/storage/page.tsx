import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { HardDrive, Pencil, PlugZap } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { FormDialog } from "@/components/dg/form-dialog";
import { FormRow, RadioCards, SelectField, TextField } from "@/components/dg/fields";
import { Section } from "@/components/dg/section";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/rbac";
import { getStorageSettings } from "@/lib/storage/settings";
import { saveStorageSettings, testStorageSettings } from "./actions";

export const metadata: Metadata = { title: "Αρχεία · Bunny" };

const REGIONS = [
  { value: "", label: "Falkenstein, DE (κύρια)" },
  { value: "uk", label: "London, UK" },
  { value: "se", label: "Stockholm, SE" },
  { value: "ny", label: "New York, US" },
  { value: "la", label: "Los Angeles, US" },
  { value: "sg", label: "Singapore" },
  { value: "syd", label: "Sydney" },
  { value: "br", label: "São Paulo" },
  { value: "jh", label: "Johannesburg" },
];

export default async function StorageSettingsPage() {
  const user = await requirePermission("platform.settings.manage");
  if (user.platformRole !== "SUPER_ADMIN") forbidden();
  const s = await getStorageSettings();
  const bunny = s.driver === "bunny";

  return (
    <>
      <PageHeader
        eyebrow="Ρυθμίσεις"
        title="Αρχεία · Bunny"
        description="Πού αποθηκεύονται στιγμιότυπα, logs, traces και αρχεία του API. Τα κλειδιά αποθηκεύονται κρυπτογραφημένα και δεν εμφανίζονται ξανά."
        icon={HardDrive}
        tone="blue"
        actions={
          <>
            <FormDialog title="Δοκιμή σύνδεσης" description="Λίστα του storage zone με το access key που έχει αποθηκευτεί." action={testStorageSettings} submitLabel="Δοκιμή" size="sm" trigger={<Button size="sm" variant="outline"><PlugZap aria-hidden /> Δοκιμή σύνδεσης</Button>} />
            <FormDialog
              title="Ρυθμίσεις αρχείων"
              description="Αφήστε κενά τα πεδία κλειδιών για να κρατηθούν τα τρέχοντα."
              action={saveStorageSettings}
              size="lg"
              trigger={<Button size="sm"><Pencil aria-hidden /> Επεξεργασία</Button>}
            >
              <RadioCards
                name="driver"
                label="Αποθήκευση"
                defaultValue={s.driver}
                options={[
                  { value: "bunny", label: "Bunny Storage + Pull zone", hint: "Παραγωγή — ιδιωτικά αρχεία, signed URLs" },
                  { value: "local", label: "Τοπικός δίσκος", hint: "Μόνο για ανάπτυξη και tests" },
                ]}
              />
              <FormRow>
                <TextField name="storageZone" label="Storage zone" defaultValue={s.storageZone ?? ""} placeholder="dg-complete" />
                <SelectField name="region" label="Κύρια περιοχή" defaultValue={s.region ?? ""} options={REGIONS} hint="Μόνο περιοχές EU για δεδομένα πελατών (GDPR)." />
              </FormRow>
              <TextField name="accessKey" label="Storage zone password (AccessKey)" type="password" autoComplete="off" placeholder={s.accessKeyHint ? `Αποθηκευμένο: ${s.accessKeyHint}` : ""} hint="FTP & API access → Password του storage zone." />
              <TextField name="pullZoneHost" label="Pull zone host" defaultValue={s.pullZoneHost ?? ""} placeholder="dg-complete-artifacts.b-cdn.net" hint="Με Token Authentication ενεργό και «Block root path access»." />
              <TextField name="tokenKey" label="Token Authentication key" type="password" autoComplete="off" placeholder={s.tokenKeyHint ? `Αποθηκευμένο: ${s.tokenKeyHint}` : ""} hint="Pull zone → Security → Token Authentication → Url Token Authentication Key." />
              <TextField name="signedUrlTtlSec" label="Διάρκεια signed URL (″)" type="number" defaultValue={s.signedUrlTtlSec} hint="Προεπιλογή 900 (15′)." />
            </FormDialog>
          </>
        }
      />
      <div className="grid gap-4 *:min-w-0 lg:grid-cols-2">
        <Section title="Τρέχουσα ρύθμιση">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Αποθήκευση</dt>
            <dd>{bunny ? "Bunny Storage" : "Τοπικός δίσκος (dev)"}</dd>
            <dt className="text-muted-foreground">Storage zone</dt>
            <dd className="font-mono text-xs">{s.storageZone ?? "—"}</dd>
            <dt className="text-muted-foreground">Περιοχή</dt>
            <dd>{REGIONS.find((r) => r.value === (s.region ?? ""))?.label}</dd>
            <dt className="text-muted-foreground">AccessKey</dt>
            <dd className="font-mono text-xs">{s.accessKeyHint ?? "—"}</dd>
            <dt className="text-muted-foreground">Pull zone</dt>
            <dd className="font-mono text-xs break-all">{s.pullZoneHost ?? "—"}</dd>
            <dt className="text-muted-foreground">Token key</dt>
            <dd className="font-mono text-xs">{s.tokenKeyHint ?? "—"}</dd>
            <dt className="text-muted-foreground">Signed URL</dt>
            <dd className="tabular-nums">{Math.round(s.signedUrlTtlSec / 60)}′</dd>
          </dl>
        </Section>
        <Section title="Τελευταία δοκιμή">
          {s.lastTestAt ? (
            <div className="space-y-2 text-sm">
              {s.lastTestOk ? <StatusPill tone="green">Επιτυχής</StatusPill> : <StatusPill tone="red">Απέτυχε</StatusPill>}
              <p className="text-muted-foreground">{s.lastTestAt.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" })}</p>
              {s.lastTestError && <p className="text-danger-500">{s.lastTestError}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Δεν έχει γίνει δοκιμή.</p>
          )}
        </Section>
      </div>
    </>
  );
}
