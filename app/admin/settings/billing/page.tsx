import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/rbac";
import { getDgsoftConnection } from "@/lib/softone";
import { BillingForm } from "./billing-form";

export const metadata: Metadata = { title: "Τιμολόγηση" };

export default async function BillingSettingsPage() {
  await requirePermission("platform.settings.manage");
  const conn = await getDgsoftConnection();

  return (
    <>
      <PageHeader
        eyebrow="Ρυθμίσεις"
        title="Τιμολόγηση συνδρομών"
        description="Πώς καταχωρείται κάθε εξοφλημένη πληρωμή ως παραστατικό στο SoftOne της DGsoft."
        icon={ReceiptText}
        tone="green"
      />
      <Card>
        <CardHeader>
          <CardTitle>
            <SectionTitle icon={ReceiptText} tone="green">
              Παραστατικό πώλησης (SALDOC)
            </SectionTitle>
          </CardTitle>
          <CardDescription>
            Μία γραμμή υπηρεσίας ανά πληρωμή. Επιλέξτε σειρά που καταγράφει και την είσπραξη (π.χ. Τιμολόγιο Παροχής –
            Απόδειξη Είσπραξης).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {conn ? (
            <BillingForm
              values={{
                invoiceSeries: conn.invoiceSeries,
                serviceMtrl: conn.serviceMtrl,
                paymentCode: conn.paymentCode,
                vatRate: conn.vatRate ? Number(conn.vatRate) : 24,
                pricesIncludeVat: conn.pricesIncludeVat,
              }}
            />
          ) : (
            <p className="py-6 text-center text-muted-foreground">
              Ρυθμίστε πρώτα τη{" "}
              <Link href="/admin/settings/softone" className="text-primary hover:underline">
                σύνδεση SoftOne
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
