"use server";

import { chatCompletion, getAiSettings } from "@/lib/openrouter";
import { can, requireUser } from "@/lib/rbac";
import { anomalies } from "@/lib/smart/anomalies";
import { collections } from "@/lib/smart/collections";
import { negotiation } from "@/lib/smart/negotiation";
import { pricing } from "@/lib/smart/pricing";
import { usersPerformance } from "@/lib/smart/users";
import { winback } from "@/lib/smart/winback";
import { hasService } from "@/lib/tenant-services";
import { prisma } from "@/lib/prisma";

// AI briefs of the smart modules. The facts are rebuilt here from the (cached) analysis — the
// browser only says which customer / supplier / user / alert — so nothing can be injected.

export type BriefKind = "pricing" | "collections" | "anomaly" | "winback" | "negotiation" | "user";
const SERVICE: Record<BriefKind, Parameters<typeof hasService>[1]> = {
  pricing: "pricing",
  collections: "collections",
  anomaly: "anomalies",
  winback: "winback",
  negotiation: "negotiation",
  user: "salespeople",
};
const FEATURE: Record<BriefKind, string> = { pricing: "pricing", collections: "collections", anomaly: "anomalies", winback: "winback", negotiation: "negotiation", user: "salespeople" };

const eur = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v).toLocaleString("el-GR")} €`);
const BASE =
  "Είσαι ο Κίμων, ο ψηφιακός σύμβουλος του DGsmart BI για εμπορικές εταιρείες που δουλεύουν με SoftOne. Γράφεις στα ελληνικά, σύντομα και πρακτικά, σαν έμπειρος διευθυντής. Χρησιμοποιείς ΜΟΝΟ τα στοιχεία που σου δίνονται — δεν επινοείς αριθμούς, ονόματα ή γεγονότα. Μορφή: τίτλοι ενοτήτων σε **έντονα** σε δική τους γραμμή, κουκκίδες «- », κενή γραμμή ανάμεσα στις ενότητες.";

const PROMPTS: Record<BriefKind, string> = {
  pricing:
    "Γράψε σχέδιο τιμολογιακής πολιτικής (έως 250 λέξεις): «**Τι δείχνουν τα δεδομένα**», «**Τρεις άμεσες κινήσεις**» (συγκεκριμένα είδη/πελάτες/μάρκες με ποσά), «**Τι να προσέξετε**» (κίνδυνοι, π.χ. αντίδραση πελατών, αξιοπιστία εκτίμησης).",
  collections:
    "Γράψε (α) «**Τι να πείτε στο τηλέφωνο**» με 3–4 κουκκίδες και (β) «**Email υπενθύμισης**»: έτοιμο ευγενικό email προς τον πελάτη (θέμα + κείμενο, έως 120 λέξεις), με ύφος ανάλογο του κινδύνου — φιλικό για χαμηλό, σταθερό για υψηλό. Χωρίς απειλές. Υπογραφή «Τμήμα Λογιστηρίου».",
  anomaly:
    "Εξήγησε την ειδοποίηση (έως 150 λέξεις): «**Τι συμβαίνει**», «**Πιθανές αιτίες**» (2–3, ως υποθέσεις), «**Τι να ελέγξετε / κάνετε**» (2–3 ενέργειες).",
  winback:
    "Γράψε (α) «**Γιατί πιθανόν φεύγει**» (2–3 υποθέσεις από τα στοιχεία), (β) «**Πρόταση επαναπροσέλκυσης**» με συγκεκριμένη προσφορά πάνω στις μάρκες που σταμάτησε ή που αγοράζουν οι όμοιοί του, και (γ) «**Email**» έτοιμο (θέμα + κείμενο έως 120 λέξεις), προσωπικό και όχι πιεστικό. Υπογραφή «Τμήμα Πωλήσεων».",
  negotiation:
    "Γράψε φάκελο διαπραγμάτευσης (έως 280 λέξεις): «**Η θέση μας**» (όγκος, εξάρτηση, εναλλακτικές), «**Τι ζητάμε**» (3–4 συγκεκριμένα αιτήματα με αριθμούς, π.χ. επαναφορά τιμών σε συγκεκριμένα είδη, έκπτωση όγκου %, όροι πληρωμής, χρόνοι παράδοσης), «**Επιχειρήματα**», «**Αν αρνηθεί**» (εναλλακτικές).",
  user:
    "Γράψε αξιολόγηση και coaching για τον χρήστη (έως 200 λέξεις): «**Δυνατά σημεία**», «**Τι να βελτιώσει**» (ειδικά εκπτώσεις και περιθώριο, με αριθμούς σε σύγκριση με την ομάδα), «**Στόχοι επόμενου τριμήνου**» (2–3 μετρήσιμοι). Επαγγελματικό, όχι επικριτικό ύφος.",
};

async function facts(tenantId: string, kind: BriefKind, ref: string): Promise<string> {
  if (kind === "pricing") {
    const p = await pricing(tenantId);
    return [
      `Προτεινόμενες αλλαγές τιμών: ${p.suggestions.length} είδη, εκτιμώμενο επιπλέον μικτό κέρδος ${eur(p.totalGain)}/έτος.`,
      ...p.suggestions.slice(0, 8).map((x) => `- ${x.name}${x.brand ? ` (${x.brand})` : ""}: τιμή ${x.price} → ${x.newPrice} € (${x.changePct > 0 ? "+" : ""}${x.changePct}%), ελαστικότητα ${x.elasticity} (${x.source === "item" ? "από το είδος" : "της κατηγορίας"}), κέρδος +${eur(x.profitGain)}`),
      `Εκπτώσεις 12 μηνών: ${eur(p.discountTotal)} (${p.discountPct}% της αξίας τιμοκαταλόγου). Πάνω από τους όμοιούς τους: ${eur(p.excessTotal)}.`,
      ...p.customers.slice(0, 6).map((c) => `- ${c.name}: έκπτωση ${c.discountPct}% έναντι ${c.peerPct}% των ομοίων, επιπλέον ${eur(c.excess)}, περιθώριο ${c.marginPct ?? "—"}%`),
      `Αυξήσεις κόστους που δεν περάστηκαν: ${p.creep.length} είδη, ${eur(p.creepTotal)}/έτος.`,
      ...p.creep.slice(0, 6).map((c) => `- ${c.name}: κόστος +${c.costChangePct}%, τιμή ${c.priceChangePct}%, χαμένο κέρδος ${eur(c.lost)}`),
    ].join("\n");
  }
  if (kind === "collections") {
    const c = (await collections(tenantId)).customers.find((x) => String(x.trdr) === ref);
    if (!c) throw new Error("Ο πελάτης δεν βρέθηκε.");
    return `Πελάτης: ${c.name}\nΥπόλοιπο: ${eur(c.balance)} · ληξιπρόθεσμο: ${eur(c.overdue)} · πάνω από 90 ημ.: ${eur(c.overdue90)}\nΠαλαιότερη οφειλή: ${c.oldestDays ?? "—"} ημέρες · συνήθως πληρώνει σε ${c.payDays ?? "—"} ημέρες · τελευταία πληρωμή: ${c.lastPayment ?? "—"}\nΚίνδυνος: ${c.risk}/100 (${c.riskBand}), συμπεριφορά: ${c.behaviour}\nΠροτεινόμενο πιστωτικό όριο: ${eur(c.creditLimit)}\nΤιμολογήσεις 12 μηνών: ${eur(c.invoiced12m)}\nΓιατί: ${c.reason}`;
  }
  if (kind === "anomaly") {
    const a = (await anomalies(tenantId)).items.find((x) => x.id === ref);
    if (!a) throw new Error("Η ειδοποίηση δεν βρέθηκε (ίσως ενημερώθηκε).");
    return `Περιοχή: ${a.area}\nΕιδοποίηση: ${a.title}\nΛεπτομέρειες: ${a.detail}\nΕκτιμώμενη επίδραση: ${eur(a.impact)}${a.z !== null ? `\nΑπόκλιση από το συνηθισμένο: ${a.z} τυπικές αποκλίσεις` : ""}`;
  }
  if (kind === "winback") {
    const c = (await winback(tenantId)).customers.find((x) => String(x.trdr) === ref);
    if (!c) throw new Error("Ο πελάτης δεν βρέθηκε.");
    return `Πελάτης: ${c.name}\nΤζίρος προηγούμενου έτους: ${eur(c.revenuePrev)}, τελευταίων 12 μηνών: ${eur(c.revenue12)}\nΤελευταία αγορά πριν από ${c.recency} ημέρες· συνήθως αγόραζε κάθε ${c.usualGap ?? "—"} ημέρες\nΠιθανότητα απώλειας: ${c.probability}% (${c.stage}), αξία σε κίνδυνο ${eur(c.valueAtRisk)}\nΚύρια κατηγορία: ${c.topCategory ?? "—"}\nΜάρκες που σταμάτησε: ${c.stoppedBrands.map((b) => `${b.brand} (${eur(b.before)} πέρσι)`).join(", ") || "—"}\nΜάρκες που αγοράζουν οι όμοιοί του και αυτός όχι: ${c.peerBrands.map((b) => `${b.brand} (${b.share}% των ομοίων)`).join(", ") || "—"}`;
  }
  if (kind === "negotiation") {
    const n = await negotiation(tenantId);
    const x = n.suppliers.find((s) => String(s.trdr) === ref);
    if (!x) throw new Error("Ο προμηθευτής δεν βρέθηκε.");
    return `Προμηθευτής: ${x.name}\nΑγορές 12 μηνών: ${eur(x.spend12)} (πέρσι ${eur(x.spendPrev)}, μεταβολή ${x.growthPct ?? "—"}%), ${x.sharePct}% των αγορών μας\nΕξάρτηση πωλήσεων: ${x.salesDependencyPct}% του τζίρου μας από είδη του\nΤάση τιμών: ${x.priceTrendPct ?? "—"}%/έτος (σύνολο προμηθευτών ${n.marketTrendPct ?? "—"}%)\nΠαράδοση: συνήθως ${x.leadMedian ?? "—"} ημέρες, 1 στις 10 πάνω από ${x.leadP90 ?? "—"}\nΤον πληρώνουμε σε ${x.payDays ?? "—"} ημέρες · υπόλοιπο ${eur(x.balance)}\nΕναλλακτικοί προμηθευτές για τις ίδιες μάρκες: ${x.alternatives}\nΑκριβότερα είδη:\n${x.topRises.slice(0, 6).map((r) => `- ${r.name}: ${r.before} → ${r.now} € (+${r.changePct}%), ${r.qty} τεμ.`).join("\n") || "—"}\nΜοχλοί:\n${x.levers.map((l) => `- ${l}`).join("\n")}`;
  }
  const u = await usersPerformance(tenantId);
  const x = u.users.find((y) => String(y.user) === ref);
  if (!x) throw new Error("Ο χρήστης δεν βρέθηκε.");
  const team = u.users.filter((y) => y.documents >= 20);
  const avg = (f: (y: (typeof team)[number]) => number) => (team.length ? team.reduce((a, y) => a + f(y), 0) / team.length : 0);
  return `Χρήστης: ${x.name}\nΤζίρος 12 μηνών: ${eur(x.revenue)} (πέρσι ${eur(x.revenuePrev)}, ${x.growthPct ?? "—"}%)\nΠεριθώριο: ${x.marginPct ?? "—"}% (μέσος όρος ομάδας ${avg((y) => y.marginPct ?? 0).toFixed(1)}%)\nΕκπτώσεις: ${eur(x.discount)} = ${x.discountPct}% της αξίας τιμοκαταλόγου (ομάδα ${avg((y) => y.discountPct).toFixed(1)}%), σε ${x.discountLines} από ${x.lines} γραμμές\nΠαραστατικά: ${x.documents}, μέση αξία ${eur(x.avgDocument)}\nΠελάτες: ${x.customers}, νέοι: ${x.newCustomers}\nΣτυλ: ${x.style}\nΜεγαλύτερες εκπτώσεις σε πελάτες:\n${u.pairs.filter((p) => p.user === x.user).slice(0, 5).map((p) => `- ${p.customer}: ${p.discountPct}% (${eur(p.discount)})`).join("\n") || "—"}`;
}

export async function smartBrief(tenantId: string, kind: BriefKind, ref: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "tenant.dashboards.view", tenantId)) return { ok: false, error: "Δεν έχετε πρόσβαση." };
    if (!(kind in PROMPTS)) return { ok: false, error: "Άγνωστο αίτημα." };
    if (!(await hasService(tenantId, SERVICE[kind]))) return { ok: false, error: "Η υπηρεσία δεν περιλαμβάνεται στο πακέτο σας." };
    if (!(await getAiSettings()).enabled) return { ok: false, error: "Το AI δεν είναι ενεργό." };
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const r = await chatCompletion({
      tenantId,
      userId: user.id,
      feature: FEATURE[kind],
      temperature: 0.4,
      maxTokens: 2000,
      messages: [
        { role: "system", content: `${BASE}\n\n${PROMPTS[kind]}` },
        { role: "user", content: `Εταιρεία: ${tenant?.name ?? ""}\n\nΣτοιχεία:\n${await facts(tenantId, kind, String(ref).slice(0, 60))}` },
      ],
    });
    const text = (r.choices[0]?.message?.content ?? "").trim();
    return text ? { ok: true, text } : { ok: false, error: "Το AI δεν απάντησε." };
  } catch (err) {
    const msg = (err as Error).message;
    return { ok: false, error: /token/i.test(msg) ? "Δεν υπάρχουν διαθέσιμα AI tokens." : msg.slice(0, 200) };
  }
}
