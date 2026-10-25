import "server-only";
import { prisma } from "@/lib/prisma";
import { formatS1Date, getDgsoftConnection, s1GetData, s1SetData } from "@/lib/softone";

// Posts a paid subscription payment to the SoftOne of DGsoft as a sales document (SALDOC → FINDOC)
// with one service line (SRVLINES). Then reads the document back: setData success ≠ persisted.

const round2 = (n: number) => Math.round(n * 100) / 100;

export type PostResult = { ok: true; findoc: number; fincode: string | null } | { ok: false; error: string };

export async function postPaymentToSoftOne(paymentId: string): Promise<PostResult> {
  const conn = await getDgsoftConnection();
  if (!conn) return { ok: false, error: "Δεν έχει ρυθμιστεί σύνδεση με το SoftOne της DGsoft." };
  if (!conn.invoiceSeries || !conn.serviceMtrl) {
    return { ok: false, error: "Ορίστε σειρά παραστατικού και υπηρεσία στις Ρυθμίσεις → SoftOne → Τιμολόγηση." };
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { tenant: true } });
  if (!payment) return { ok: false, error: "Η πληρωμή δεν βρέθηκε." };
  if (payment.s1Status === "POSTED" && payment.s1Findoc) {
    return { ok: true, findoc: payment.s1Findoc, fincode: payment.s1Fincode };
  }
  if (payment.status !== "PAID") return { ok: false, error: "Μόνο εξοφλημένες πληρωμές αποστέλλονται στο SoftOne." };
  if (!payment.tenant.s1Trdr) return { ok: false, error: "Ο πελάτης δεν είναι αντιστοιχισμένος με πελάτη του SoftOne." };

  // Atomic claim: only one request may post a given payment.
  const claimed = await prisma.payment.updateMany({
    where: {
      id: payment.id,
      OR: [
        { s1Status: { in: ["NOT_POSTED", "FAILED"] } },
        // a POSTING left behind by a crashed request
        { s1Status: "POSTING", updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
      ],
    },
    data: { s1Status: "POSTING", s1Error: null },
  });
  if (claimed.count === 0) return { ok: false, error: "Η πληρωμή αποστέλλεται ήδη στο SoftOne." };

  const gross = Number(payment.amount);
  const vatRate = conn.vatRate ? Number(conn.vatRate) : 24;
  const net = conn.pricesIncludeVat ? round2(gross / (1 + vatRate / 100)) : gross;
  const reference = `DGSMART-PAY-${payment.id}`;

  try {
    const header: Record<string, unknown> = {
      SERIES: conn.invoiceSeries,
      TRDR: payment.tenant.s1Trdr,
      TRNDATE: formatS1Date(payment.paidAt),
      COMMENTS: `${payment.description} · ${reference}`.slice(0, 255),
    };
    if (conn.paymentCode) header.PAYMENT = conn.paymentCode;

    // Retry after an unverified post: never create a second document, only re-verify.
    let findoc = payment.s1Findoc ?? 0;
    if (!findoc) {
      const id = await s1SetData(conn.id, "SALDOC", {
        SALDOC: [header],
        SRVLINES: [{ MTRL: conn.serviceMtrl, QTY1: 1, PRICE: net, COMMENTS: payment.description.slice(0, 255) }],
      });
      findoc = Number(id);
      if (!Number.isInteger(findoc) || findoc <= 0) throw new Error(`Το SoftOne δεν επέστρεψε αριθμό παραστατικού (${id}).`);
      await prisma.payment.update({ where: { id: payment.id }, data: { s1Findoc: findoc } });
    }

    // Read back and verify the document really exists for this customer.
    const doc = await s1GetData(conn.id, "SALDOC", findoc, "SALDOC:FINDOC,FINCODE,TRDR,SUMAMNT");
    const saved = ((doc.data as Record<string, Record<string, unknown>[]> | undefined)?.SALDOC ?? [])[0];
    if (!saved || Number(saved.TRDR) !== payment.tenant.s1Trdr) {
      throw new Error(`Το παραστατικό ${findoc} δεν επιβεβαιώθηκε στο SoftOne.`);
    }
    const fincode = saved.FINCODE ? String(saved.FINCODE) : null;
    const sum = Number(saved.SUMAMNT);
    const mismatch = Number.isFinite(sum) && Math.abs(sum - gross) > 0.02;

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        s1Status: "POSTED",
        s1Findoc: findoc,
        s1Fincode: fincode,
        s1PostedAt: new Date(),
        s1Error: mismatch ? `Προσοχή: σύνολο παραστατικού ${sum.toFixed(2)} ≠ πληρωμή ${gross.toFixed(2)}` : null,
      },
    });
    return { ok: true, findoc, fincode };
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    await prisma.payment.update({ where: { id: payment.id }, data: { s1Status: "FAILED", s1Error: error } });
    return { ok: false, error };
  }
}
