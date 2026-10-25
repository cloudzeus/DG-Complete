import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BarChart3, Eye, MailOpen, MailX, Radio, Send, UserMinus } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { IconTile, StatusPill, type Tone } from "@/components/admin/tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_URL } from "@/lib/email";
import { TEMPLATES } from "@/lib/email-templates";
import { getEmailSettings } from "@/lib/mailgun";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { Suppressions } from "./suppressions";
import { TrackingForm } from "./tracking-form";

export const metadata: Metadata = { title: "Email · Στατιστικά" };

const PERIODS = [30, 90, 365] as const;
const when = (d: Date) => d.toLocaleString("el-GR", { timeZone: "Europe/Athens", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 3600_000);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function Kpi({ icon, tone, label, value, hint }: { icon: typeof Send; tone: Tone; label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-fluent-2">
      <IconTile icon={icon} tone={tone} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export default async function EmailStatsPage({ searchParams }: PageProps<"/admin/settings/email/stats">) {
  await requirePermission("platform.settings.manage");
  const sp = await searchParams;
  const days = PERIODS.find((p) => String(p) === sp.days) ?? 30;
  const since = daysAgo(days);
  const inPeriod = { createdAt: { gte: since } };

  const [settings, groups, opened, suppressions, unsubscribed, lastEvent] = await Promise.all([
    getEmailSettings(),
    prisma.emailLog.groupBy({
      by: ["template", "ok"],
      where: inPeriod,
      _count: { _all: true, deliveredAt: true, openedAt: true, failedAt: true },
    }),
    prisma.emailLog.findMany({
      where: { ...inPeriod, openedAt: { not: null } },
      orderBy: { lastOpenedAt: "desc" },
      take: 100,
      select: {
        id: true,
        to: true,
        template: true,
        subject: true,
        createdAt: true,
        openedAt: true,
        openCount: true,
        tenant: { select: { name: true } },
        events: { where: { event: "opened" }, orderBy: { at: "desc" }, take: 1, select: { client: true, city: true, country: true } },
      },
    }),
    prisma.emailSuppression.findMany({ orderBy: { createdAt: "desc" }, include: { tenant: { select: { name: true } } } }),
    prisma.emailSuppression.count({ where: inPeriod }),
    prisma.emailEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  const names = Object.fromEntries(TEMPLATES.map((t) => [t.key, t.name]));
  const byTemplate = new Map<string, { sent: number; failed: number; delivered: number; opened: number; bounced: number }>();
  for (const g of groups) {
    const row = byTemplate.get(g.template) ?? { sent: 0, failed: 0, delivered: 0, opened: 0, bounced: 0 };
    if (g.ok) row.sent += g._count._all;
    else row.failed += g._count._all;
    row.delivered += g._count.deliveredAt;
    row.opened += g._count.openedAt;
    row.bounced += g._count.failedAt;
    byTemplate.set(g.template, row);
  }
  const total = [...byTemplate.values()].reduce(
    (a, r) => ({ sent: a.sent + r.sent, failed: a.failed + r.failed, delivered: a.delivered + r.delivered, opened: a.opened + r.opened, bounced: a.bounced + r.bounced }),
    { sent: 0, failed: 0, delivered: 0, opened: 0, bounced: 0 },
  );
  const tracking = !!settings.webhookKeyEnc;

  return (
    <>
      <PageHeader
        eyebrow="Ρυθμίσεις · Email"
        title="Στατιστικά email"
        description="Ποιοι έλαβαν και ποιοι άνοιξαν τα email της πλατφόρμας, και ποιοι δεν θέλουν να λαμβάνουν υπενθυμίσεις."
        icon={BarChart3}
        tone="blue"
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/settings/email">
              <ArrowLeft className="size-4" /> Email · Mailgun
            </Link>
          </Button>
        }
      />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Περίοδος">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`?days=${p}`}
              aria-current={p === days ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                p === days ? "border-sisyphus-500 bg-sisyphus-500 text-white" : "bg-card hover:bg-muted",
              )}
            >
              {p === 365 ? "12 μήνες" : `${p} ημέρες`}
            </Link>
          ))}
          {!tracking && <StatusPill tone="amber">Η παρακολούθηση δεν έχει ρυθμιστεί — δείτε παρακάτω</StatusPill>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Kpi icon={Send} tone="blue" label="Στάλθηκαν" value={total.sent.toLocaleString("el-GR")} hint={total.failed ? `${total.failed} απέτυχαν στην αποστολή` : undefined} />
          <Kpi icon={MailOpen} tone="teal" label="Παραδόθηκαν" value={total.delivered.toLocaleString("el-GR")} hint={pct(total.delivered, total.sent)} />
          <Kpi icon={Eye} tone="green" label="Ανοίχτηκαν" value={total.opened.toLocaleString("el-GR")} hint={`${pct(total.opened, total.delivered || total.sent)} των παραδοθέντων`} />
          <Kpi icon={MailX} tone="red" label="Απορρίφθηκαν" value={total.bounced.toLocaleString("el-GR")} hint="Μόνιμη αποτυχία παράδοσης" />
          <Kpi icon={UserMinus} tone="amber" label="Διαγραφές" value={unsubscribed.toLocaleString("el-GR")} hint={`${suppressions.length} συνολικά στη λίστα`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              <SectionTitle icon={BarChart3} tone="blue">
                Ανά πρότυπο
              </SectionTitle>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="py-2 pr-3 font-medium">Πρότυπο</th>
                  <th className="py-2 pr-3 text-right font-medium">Στάλθηκαν</th>
                  <th className="py-2 pr-3 text-right font-medium">Παραδόθηκαν</th>
                  <th className="py-2 pr-3 text-right font-medium">Ανοίχτηκαν</th>
                  <th className="py-2 pr-3 text-right font-medium">Ποσοστό ανοίγματος</th>
                  <th className="py-2 text-right font-medium">Αποτυχίες</th>
                </tr>
              </thead>
              <tbody>
                {TEMPLATES.map((t) => {
                  const r = byTemplate.get(t.key) ?? { sent: 0, failed: 0, delivered: 0, opened: 0, bounced: 0 };
                  return (
                    <tr key={t.key} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        {t.name}
                        {t.optional && <span className="ml-2 text-xs text-muted-foreground">με επιλογή διαγραφής</span>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.sent}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.delivered}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.opened}</td>
                      <td className="py-2 pr-3 text-right font-medium tabular-nums">{pct(r.opened, r.delivered || r.sent)}</td>
                      <td className={cn("py-2 text-right tabular-nums", r.failed + r.bounced > 0 && "text-destructive")}>{r.failed + r.bounced}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <SectionTitle icon={Eye} tone="green">
                Ποιοι άνοιξαν
              </SectionTitle>
            </CardTitle>
            <CardDescription>Τα 100 πιο πρόσφατα ανοίγματα της περιόδου. Κάποια προγράμματα (π.χ. Apple Mail) ανοίγουν τα email αυτόματα, οπότε τα ανοίγματα είναι ενδεικτικά.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {opened.length === 0 ? (
              <p className="text-sm text-muted-foreground">Δεν έχει καταγραφεί άνοιγμα στην περίοδο.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 font-medium">Παραλήπτης</th>
                    <th className="py-2 pr-3 font-medium">Πελάτης</th>
                    <th className="py-2 pr-3 font-medium">Πρότυπο</th>
                    <th className="py-2 pr-3 font-medium">Στάλθηκε</th>
                    <th className="py-2 pr-3 font-medium">Άνοιξε</th>
                    <th className="py-2 pr-3 text-right font-medium">Φορές</th>
                    <th className="py-2 font-medium">Πρόγραμμα / τοποθεσία</th>
                  </tr>
                </thead>
                <tbody>
                  {opened.map((l) => {
                    const ev = l.events[0];
                    return (
                      <tr key={l.id} className="border-b last:border-0">
                        <td className="max-w-56 truncate py-2 pr-3 font-medium">{l.to}</td>
                        <td className="max-w-48 truncate py-2 pr-3">{l.tenant?.name ?? "—"}</td>
                        <td className="py-2 pr-3" title={l.subject}>
                          {names[l.template] ?? l.template}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{when(l.createdAt)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{l.openedAt ? when(l.openedAt) : "—"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{l.openCount}</td>
                        <td className="max-w-56 truncate py-2 text-muted-foreground">{[ev?.client, ev?.city, ev?.country].filter(Boolean).join(" · ") || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <SectionTitle icon={UserMinus} tone="amber">
                Δεν επιθυμούν υπενθυμίσεις
              </SectionTitle>
            </CardTitle>
            <CardDescription>
              Σε αυτές τις διευθύνσεις δεν στέλνονται υπενθυμίσεις ανανέωσης και πληρωμής. Τα email λογαριασμού (νέος κωδικός, καλωσόρισμα) και τα αποδεικτικά πληρωμής στέλνονται κανονικά.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suppressions
              templates={names}
              rows={suppressions.map((s) => ({
                email: s.email,
                reason: s.reason,
                source: s.source,
                template: s.template,
                tenant: s.tenant?.name ?? null,
                createdAt: when(s.createdAt),
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <SectionTitle
                icon={Radio}
                tone="violet"
                extra={
                  tracking ? (
                    <StatusPill tone={lastEvent ? "green" : "amber"}>{lastEvent ? `Τελευταίο γεγονός ${when(lastEvent.createdAt)}` : "Αναμονή για γεγονότα"}</StatusPill>
                  ) : (
                    <StatusPill tone="slate">Δεν έχει ρυθμιστεί</StatusPill>
                  )
                }
              >
                Παρακολούθηση (Mailgun webhooks)
              </SectionTitle>
            </CardTitle>
            <CardDescription>
              Αντιγράψτε το «HTTP webhook signing key» από το Mailgun (Sending → Webhooks), αποθηκεύστε το και πατήστε «Καταχώρηση webhooks».
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrackingForm keyHint={settings.webhookKeyHint} trackOpens={settings.trackOpens} webhookUrl={`${APP_URL}/api/webhooks/mailgun`} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
