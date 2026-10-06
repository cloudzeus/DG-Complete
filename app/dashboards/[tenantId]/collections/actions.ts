"use server";

import { randomUUID } from "node:crypto";
import { audit } from "@/lib/audit";
import { getEmailSettings, mailgunConfig, mailgunSend } from "@/lib/mailgun";
import { chatCompletion, getAiSettings } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { can, requireUser } from "@/lib/rbac";
import { customerStatement, type CustomerStatement } from "@/lib/smart/statement";
import { statementPdf } from "@/lib/smart/statement-pdf";
import { hasService } from "@/lib/tenant-services";

// Sends a customer their statement (PDF) by email — from the platform's sender with the tenant's
// name, replies to the user who sent it. Optional short AI note to the customer inside the PDF.

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Who signs the email and receives the replies: the sender if they belong to the company; for
 * platform staff, the company's administrator or first user (else the company name only).
 */
async function signer(tenantId: string, user: { id: string; name: string; email: string }) {
  const own = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: user.id, tenantId } }, select: { id: true } });
  if (own) return { name: user.name, email: user.email };
  // The company's administrator, else its first user.
  const admin =
    (await prisma.membership.findFirst({ where: { tenantId, role: "TENANT_ADMIN" }, orderBy: { createdAt: "asc" }, select: { user: { select: { name: true, email: true } } } })) ??
    (await prisma.membership.findFirst({ where: { tenantId }, orderBy: { createdAt: "asc" }, select: { user: { select: { name: true, email: true } } } }));
  return admin ? { name: admin.user.name, email: admin.user.email } : { name: null, email: null };
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const eur = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

async function aiNote(tenantId: string, userId: string, company: string, s: CustomerStatement) {
  if (!(await getAiSettings()).enabled) return null;
  const r = await chatCompletion({
    tenantId,
    userId,
    feature: "collections",
    temperature: 0.4,
    maxTokens: 700,
    messages: [
      {
        role: "system",
        content:
          "Γράφεις σύντομο σημείωμα (έως 90 λέξεις) ΠΡΟΣ τον πελάτη μιας εμπορικής εταιρείας, που μπαίνει στην αρχή της καρτέλας του. Στα ελληνικά, ευγενικό και επαγγελματικό, σε πληθυντικό ευγενείας. Ευχαρίστησε για τη συνεργασία, σύνοψη υπολοίπου και (αν υπάρχει) ληξιπρόθεσμου με σαφές αλλά φιλικό αίτημα τακτοποίησης, και μία θετική παρατήρηση για τη συνεργασία από τα στοιχεία. ΜΟΝΟ τα στοιχεία που δίνονται. Χωρίς χαιρετισμό στην αρχή, χωρίς υπογραφή, χωρίς markdown.",
      },
      {
        role: "user",
        content: `Εταιρεία: ${company}\nΠελάτης: ${s.customer.name}\nΥπόλοιπο: ${eur(s.closing)}\nΛηξιπρόθεσμο (>30 ημ.): ${eur(s.overdue)}\nΑγορές 12 μηνών: ${eur(s.revenue12)} (πέρσι ${eur(s.revenuePrev)})\nΤελευταία πληρωμή: ${s.lastPayment ?? "—"}\nΚύριες κατηγορίες: ${s.categories.map((c) => c.name).join(", ") || "—"}`,
      },
    ],
  });
  return (r.choices[0]?.message?.content ?? "").trim() || null;
}

export async function sendCustomerStatement(
  tenantId: string,
  trdr: number,
  input: { to: string; subject: string; message: string; aiNote: boolean },
): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "tenant.dashboards.edit", tenantId)) return { ok: false, message: "Δεν έχετε δικαίωμα αποστολής." };
    if (!(await hasService(tenantId, "collections"))) return { ok: false, message: "Η υπηρεσία δεν περιλαμβάνεται στο πακέτο σας." };
    const to = [...new Set(String(input.to).split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (!to.length || to.length > 3 || !to.every((e) => EMAIL.test(e))) return { ok: false, message: "Συμπληρώστε έως 3 έγκυρα email." };
    const settings = await getEmailSettings();
    if (!settings.enabled) return { ok: false, message: "Η αποστολή email είναι απενεργοποιημένη στην πλατφόρμα." };
    if (!settings.fromEmail) return { ok: false, message: "Δεν έχει οριστεί email αποστολέα στην πλατφόρμα." };
    const cfg = await mailgunConfig();

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const company = tenant?.name ?? "";
    const s = await customerStatement(tenantId, Number(trdr));
    const note = input.aiNote ? await aiNote(tenantId, user.id, company, s).catch(() => null) : null;
    const pdf = await statementPdf(s, company, note);
    const subject = String(input.subject).trim().slice(0, 200) || `Καρτέλα πελάτη — ${company}`;
    const body = String(input.message).trim().slice(0, 4000);
    const filename = `Kartela-${(s.customer.code ?? String(trdr)).replace(/[^\w.-]/g, "_")}.pdf`;
    const logId = randomUUID();
    let messageId = "";
    let error: string | null = null;
    try {
      messageId = await mailgunSend(cfg, {
        from: `${company.replace(/["<>]/g, "").slice(0, 80)} <${settings.fromEmail}>`,
        to,
        subject,
        text: body,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">${body
          .split(/\n{2,}/)
          .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
          .join("")}</div>`,
        replyTo: (await signer(tenantId, user)).email,
        tags: ["customer_statement"],
        variables: { logId },
        trackOpens: settings.trackOpens,
        attachments: [{ filename, content: new Uint8Array(pdf), contentType: "application/pdf" }],
      });
    } catch (err) {
      error = (err as Error).message.slice(0, 500);
    }
    await prisma.emailLog.create({
      data: { id: logId, template: "customer_statement", to: to.join(", "), subject, ok: !error, messageId: messageId || null, error, tenantId },
    });
    await audit({ actorId: user.id, action: "statement.send", entity: "Customer", entityId: String(trdr), tenantId, meta: { to, ok: !error, aiNote: !!note } });
    return error ? { ok: false, message: `Η αποστολή απέτυχε: ${error}` } : { ok: true, message: `Η καρτέλα στάλθηκε στο ${to.join(", ")}.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message.slice(0, 300) };
  }
}

/** Prefill for the send dialog: the customer's email from SoftOne and the default text. */
export async function statementDraft(tenantId: string, trdr: number) {
  const user = await requireUser();
  if (!can(user, "tenant.dashboards.view", tenantId)) throw new Error("Δεν έχετε πρόσβαση.");
  const s = await customerStatement(tenantId, Number(trdr));
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const company = tenant?.name ?? "";
  const sign = await signer(tenantId, user);
  return {
    to: s.customer.email ?? "",
    subject: `Καρτέλα πελάτη — ${company}`,
    message: `Αγαπητοί συνεργάτες,\n\nσας επισυνάπτουμε την αναλυτική καρτέλα σας στις ${new Date().toLocaleDateString("el-GR")}, με υπόλοιπο ${eur(s.closing)}${s.overdue > 0 ? `, από το οποίο ληξιπρόθεσμο ${eur(s.overdue)}` : ""}.\n\nΓια οποιαδήποτε διευκρίνιση είμαστε στη διάθεσή σας — απαντήστε απευθείας σε αυτό το email.\n\nΜε εκτίμηση,\n${sign.name ? `${sign.name}\n` : ""}${company}`,
    canSend: can(user, "tenant.dashboards.edit", tenantId),
  };
}
