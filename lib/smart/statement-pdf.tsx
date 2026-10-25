import "server-only";
import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { CustomerStatement } from "@/lib/smart/statement";

// The customer statement as a PDF (A4): header, key figures, ageing, purchases vs payments by
// month, what the customer buys, an optional note (AI), and the statement table with the running
// balance. Noto Sans (OFL, Greek + Latin) from /public/fonts.

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
let registered = false;
function registerFonts() {
  if (registered) return;
  Font.register({
    family: "NotoSans",
    fonts: [
      { src: path.join(FONT_DIR, "NotoSans-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "NotoSans-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
  registered = true;
}

const RED = "#e31e2a";
const BLUE = "#2563eb";
const GREEN = "#16a34a";
const GREY = "#6b7280";
const LIGHT = "#f3f4f6";

const st = StyleSheet.create({
  page: { fontFamily: "NotoSans", fontSize: 8.5, padding: 32, paddingBottom: 44, color: "#111827" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: RED, paddingBottom: 8, marginBottom: 12 },
  company: { fontSize: 14, fontWeight: 700 },
  title: { fontSize: 11, fontWeight: 700, color: RED, textAlign: "right" },
  small: { fontSize: 7.5, color: GREY },
  section: { marginTop: 12 },
  h2: { fontSize: 10, fontWeight: 700, marginBottom: 5 },
  kpis: { flexDirection: "row", gap: 6 },
  kpi: { flex: 1, backgroundColor: LIGHT, borderRadius: 4, padding: 6 },
  kpiValue: { fontSize: 12, fontWeight: 700, marginTop: 2 },
  row: { flexDirection: "row" },
  th: { flexDirection: "row", backgroundColor: "#111827", color: "white", fontWeight: 700, paddingVertical: 3 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 2.5 },
  cell: { paddingHorizontal: 3 },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: GREY },
  note: { backgroundColor: "#f5f3ff", borderLeftWidth: 3, borderLeftColor: "#7c3aed", padding: 8, borderRadius: 3 },
});

const eur = (v: number, dec = 2) => `${v.toLocaleString("el-GR", { minimumFractionDigits: dec, maximumFractionDigits: dec })} €`;
const date = (iso: string) => new Date(iso).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" });
const MONTHS = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];

function Bars({ data }: { data: CustomerStatement["monthly"] }) {
  const max = Math.max(1, ...data.flatMap((d) => [Math.abs(d.purchases), d.payments]));
  const H = 70;
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: H, gap: 4, borderBottomWidth: 0.5, borderBottomColor: GREY }}>
        {data.map((d) => (
          <View key={d.month} style={{ flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 1 }}>
            <View style={{ flex: 1, height: Math.max(1, (Math.max(0, d.purchases) / max) * H), backgroundColor: BLUE }} />
            <View style={{ flex: 1, height: Math.max(1, (d.payments / max) * H), backgroundColor: GREEN }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 4, marginTop: 2 }}>
        {data.map((d) => (
          <Text key={d.month} style={{ flex: 1, textAlign: "center", fontSize: 6.5, color: GREY }}>
            {MONTHS[Number(d.month.slice(5, 7)) - 1]} {d.month.slice(2, 4)}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 3 }}>
        {[
          ["Αγορές", BLUE],
          ["Πληρωμές", GREEN],
        ].map(([label, color]) => (
          <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <View style={{ width: 6, height: 6, backgroundColor: color }} />
            <Text style={{ fontSize: 7, color: GREY }}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function HBars({ items, color }: { items: { name: string; amount: number }[]; color: string }) {
  const max = Math.max(1, ...items.map((i) => i.amount));
  return (
    <View style={{ gap: 3 }}>
      {items.map((i) => (
        <View key={i.name} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ width: 90, fontSize: 7.5 }}>{i.name.slice(0, 28)}</Text>
          <View style={{ flex: 1, height: 7, backgroundColor: LIGHT }}>
            <View style={{ width: `${(i.amount / max) * 100}%`, height: 7, backgroundColor: color }} />
          </View>
          <Text style={{ width: 52, textAlign: "right", fontSize: 7.5 }}>{eur(i.amount, 0)}</Text>
        </View>
      ))}
    </View>
  );
}

function StatementDoc({ s, company, note }: { s: CustomerStatement; company: string; note?: string | null }) {
  const cols = [
    { w: 60, label: "Ημερομηνία" },
    { w: 70, label: "Παραστατικό" },
    { w: 0, label: "Είδος" },
    { w: 62, label: "Χρέωση" },
    { w: 62, label: "Πίστωση" },
    { w: 66, label: "Υπόλοιπο" },
  ];
  const ageMax = Math.max(1, ...s.ageing.map((a) => a.amount));
  const growth = s.revenuePrev > 0 ? Math.round((s.revenue12 / s.revenuePrev - 1) * 100) : null;
  return (
    <Document title={`Καρτέλα ${s.customer.name}`} author={company} creator="DGsmart BI">
      <Page size="A4" style={st.page}>
        <View style={st.header} fixed>
          <View>
            <Text style={st.company}>{company}</Text>
            <Text style={st.small}>Αναλυτική καρτέλα πελάτη · {date(s.from)} – {date(s.to)}</Text>
          </View>
          <View>
            <Text style={st.title}>ΚΑΡΤΕΛΑ ΠΕΛΑΤΗ</Text>
            <Text style={[st.small, { textAlign: "right" }]}>{s.customer.name}</Text>
            <Text style={[st.small, { textAlign: "right" }]}>
              {[s.customer.code && `Κωδ. ${s.customer.code}`, s.customer.afm && `ΑΦΜ ${s.customer.afm}`].filter(Boolean).join(" · ")}
            </Text>
            {(s.customer.address || s.customer.city) && <Text style={[st.small, { textAlign: "right" }]}>{[s.customer.address, s.customer.city].filter(Boolean).join(", ")}</Text>}
          </View>
        </View>

        <View style={st.kpis}>
          <View style={[st.kpi, { borderTopWidth: 2, borderTopColor: RED }]}>
            <Text style={st.small}>Υπόλοιπο σήμερα</Text>
            <Text style={st.kpiValue}>{eur(s.closing)}</Text>
          </View>
          <View style={st.kpi}>
            <Text style={st.small}>Ληξιπρόθεσμο (&gt; 30 ημ.)</Text>
            <Text style={[st.kpiValue, { color: s.overdue > 0 ? RED : "#111827" }]}>{eur(s.overdue)}</Text>
          </View>
          <View style={st.kpi}>
            <Text style={st.small}>Αγορές 12 μηνών</Text>
            <Text style={st.kpiValue}>{eur(s.revenue12, 0)}</Text>
            {growth !== null && <Text style={st.small}>{growth >= 0 ? "+" : ""}{growth}% έναντι πέρσι</Text>}
          </View>
          <View style={st.kpi}>
            <Text style={st.small}>Μέσος χρόνος εξόφλησης</Text>
            <Text style={st.kpiValue}>{s.payDays !== null ? `${s.payDays} ημέρες` : "—"}</Text>
            {s.lastPayment && <Text style={st.small}>τελευταία πληρωμή {date(s.lastPayment)}</Text>}
          </View>
        </View>

        {note && (
          <View style={[st.section, st.note]}>
            {note.split(/\n+/).filter(Boolean).map((p, i) => (
              <Text key={i} style={{ marginBottom: 3, lineHeight: 1.4 }}>
                {p.replace(/\*\*/g, "")}
              </Text>
            ))}
          </View>
        )}

        <View style={[st.section, st.row, { gap: 16 }]}>
          <View style={{ flex: 1.4 }}>
            <Text style={st.h2}>Αγορές και πληρωμές ανά μήνα</Text>
            <Bars data={s.monthly} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.h2}>Ενηλικίωση υπολοίπου</Text>
            <View style={{ gap: 4 }}>
              {s.ageing.map((a, i) => (
                <View key={a.label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ width: 60, fontSize: 7.5 }}>{a.label}</Text>
                  <View style={{ flex: 1, height: 8, backgroundColor: LIGHT }}>
                    <View style={{ width: `${(a.amount / ageMax) * 100}%`, height: 8, backgroundColor: ["#16a34a", "#d97706", "#ea580c", RED][i] }} />
                  </View>
                  <Text style={{ width: 52, textAlign: "right", fontSize: 7.5 }}>{eur(a.amount, 0)}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {(s.categories.length > 0 || s.brands.length > 0) && (
          <View style={[st.section, st.row, { gap: 16 }]}>
            {s.categories.length > 0 && (
              <View style={{ flex: 1 }}>
                <Text style={st.h2}>Τι αγοράσατε — κατηγορίες</Text>
                <HBars items={s.categories} color={BLUE} />
              </View>
            )}
            {s.brands.length > 0 && (
              <View style={{ flex: 1 }}>
                <Text style={st.h2}>Μάρκες</Text>
                <HBars items={s.brands} color="#7c3aed" />
              </View>
            )}
          </View>
        )}

        <View style={st.section}>
          <Text style={st.h2}>Κινήσεις</Text>
          <View style={st.th} fixed>
            {cols.map((c, i) => (
              <Text key={c.label} style={[st.cell, c.w ? { width: c.w } : { flex: 1 }, i >= 3 ? { textAlign: "right" } : {}]}>
                {c.label}
              </Text>
            ))}
          </View>
          <View style={[st.tr, { backgroundColor: LIGHT }]}>
            <Text style={[st.cell, { width: 60 }]}>{date(s.from)}</Text>
            <Text style={[st.cell, { width: 70 }]} />
            <Text style={[st.cell, { flex: 1, fontWeight: 700 }]}>Από μεταφορά</Text>
            <Text style={[st.cell, { width: 62 }]} />
            <Text style={[st.cell, { width: 62 }]} />
            <Text style={[st.cell, { width: 66, textAlign: "right", fontWeight: 700 }]}>{eur(s.opening)}</Text>
          </View>
          {s.lines.map((l, i) => (
            <View key={i} style={st.tr} wrap={false}>
              <Text style={[st.cell, { width: 60 }]}>{date(l.date)}</Text>
              <Text style={[st.cell, { width: 70 }]}>{l.doc}</Text>
              <Text style={[st.cell, { flex: 1 }]}>{l.kind}</Text>
              <Text style={[st.cell, { width: 62, textAlign: "right" }]}>{l.debit ? eur(l.debit) : ""}</Text>
              <Text style={[st.cell, { width: 62, textAlign: "right" }]}>{l.credit ? eur(l.credit) : ""}</Text>
              <Text style={[st.cell, { width: 66, textAlign: "right" }]}>{eur(l.balance)}</Text>
            </View>
          ))}
          <View style={[st.tr, { backgroundColor: LIGHT, borderBottomWidth: 0 }]} wrap={false}>
            <Text style={[st.cell, { flex: 1, fontWeight: 700 }]}>Σύνολα περιόδου</Text>
            <Text style={[st.cell, { width: 62, textAlign: "right", fontWeight: 700 }]}>{eur(s.lines.reduce((a, l) => a + l.debit, 0))}</Text>
            <Text style={[st.cell, { width: 62, textAlign: "right", fontWeight: 700 }]}>{eur(s.lines.reduce((a, l) => a + l.credit, 0))}</Text>
            <Text style={[st.cell, { width: 66, textAlign: "right", fontWeight: 700 }]}>{eur(s.closing)}</Text>
          </View>
        </View>

        <View style={st.footer} fixed>
          <Text>
            {company} · Υπόλοιπο σύμφωνα με τα λογιστικά βιβλία στις {date(s.to)}. Για οποιαδήποτε διαφορά παρακαλούμε επικοινωνήστε μαζί μας.
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function statementPdf(s: CustomerStatement, company: string, note?: string | null): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<StatementDoc s={s} company={company} note={note} />);
}
