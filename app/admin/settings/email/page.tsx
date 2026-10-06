import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, History, Mail, MailCheck, Palette } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { templateText } from "@/lib/email";
import { TEMPLATES } from "@/lib/email-templates";
import { getEmailSettings } from "@/lib/mailgun";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { EmailForm } from "./email-form";
import { TemplatesEditor } from "./templates-editor";

export const metadata: Metadata = { title: "Email · Mailgun" };

export default async function EmailSettingsPage() {
  await requirePermission("platform.settings.manage");
  const [settings, templates, log] = await Promise.all([
    getEmailSettings(),
    Promise.all(TEMPLATES.map(async (t) => ({ key: t.key, ...(await templateText(t.key)) }))),
    prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { tenant: { select: { name: true } } } }),
  ]);
  const names = Object.fromEntries(TEMPLATES.map((t) => [t.key, t.name]));

  return (
    <>
      <PageHeader
        eyebrow="Ρυθμίσεις"
        title="Email · Mailgun"
        description="Αποστολή email της πλατφόρμας μέσω Mailgun (EU): απώλεια κωδικού, καλωσόρισμα χρηστών, υπενθυμίσεις ανανέωσης και πληρωμής, αποδεικτικά πληρωμής."
        icon={Mail}
        tone="blue"
        actions={
          <>
            {settings.enabled ? <StatusPill tone="green">Ενεργό</StatusPill> : <StatusPill tone="slate">Ανενεργό</StatusPill>}
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/settings/email/stats">
                <BarChart3 className="size-4" /> Στατιστικά & διαγραφές
              </Link>
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <SectionTitle
                icon={MailCheck}
                tone="blue"
                extra={settings.lastTestAt && <StatusPill tone={settings.lastTestOk ? "green" : "red"}>{settings.lastTestOk ? "Επαληθευμένο" : "Σφάλμα"}</StatusPill>}
              >
                Σύνδεση Mailgun
              </SectionTitle>
            </CardTitle>
            <CardDescription>Το κλειδί και το domain ελέγχονται στο Mailgun πριν αποθηκευτούν.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmailForm
              values={{
                keyHint: settings.keyHint,
                webhookKeyHint: settings.webhookKeyHint,
                domain: settings.domain ?? "",
                region: settings.region,
                fromName: settings.fromName,
                fromEmail: settings.fromEmail ?? "",
                replyTo: settings.replyTo ?? "",
                bcc: settings.bcc ?? "",
                reminderDays: settings.reminderDays,
                overdueDays: settings.overdueDays,
                enabled: settings.enabled,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <SectionTitle icon={Palette} tone="violet">
                Πρότυπα email
              </SectionTitle>
            </CardTitle>
            <CardDescription>Το κείμενο κάθε email, με προεπισκόπηση και δοκιμαστική αποστολή στο δικό σας email.</CardDescription>
          </CardHeader>
          <CardContent>
            <TemplatesEditor templates={templates.map((t) => ({ key: t.key, subject: t.subject, body: t.body, edited: t.edited }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <SectionTitle icon={History} tone="slate">
                Τελευταίες αποστολές
              </SectionTitle>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {log.length === 0 ? (
              <p className="text-sm text-muted-foreground">Δεν έχει σταλεί ακόμα κανένα email.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 font-medium">Πότε</th>
                    <th className="py-2 pr-3 font-medium">Πρότυπο</th>
                    <th className="py-2 pr-3 font-medium">Προς</th>
                    <th className="py-2 pr-3 font-medium">Πελάτης</th>
                    <th className="py-2 pr-3 font-medium">Αποτέλεσμα</th>
                    <th className="py-2 font-medium">Άνοιξε</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{l.createdAt.toLocaleString("el-GR", { timeZone: "Europe/Athens" })}</td>
                      <td className="py-2 pr-3">{names[l.template] ?? l.template}</td>
                      <td className="max-w-64 truncate py-2 pr-3">{l.to}</td>
                      <td className="max-w-48 truncate py-2 pr-3">{l.tenant?.name ?? "—"}</td>
                      <td className="py-2 pr-3">
                        {!l.ok ? (
                          <span className="text-xs text-destructive">{l.error}</span>
                        ) : l.failedAt ? (
                          <span className="text-xs text-destructive" title={l.failReason ?? undefined}>Απορρίφθηκε</span>
                        ) : l.deliveredAt ? (
                          <StatusPill tone="green">Παραδόθηκε</StatusPill>
                        ) : (
                          <StatusPill tone="blue">Στάλθηκε</StatusPill>
                        )}
                      </td>
                      <td className="py-2 whitespace-nowrap tabular-nums">
                        {l.openedAt ? `${l.openedAt.toLocaleString("el-GR", { timeZone: "Europe/Athens", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${l.openCount > 1 ? ` ×${l.openCount}` : ""}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
