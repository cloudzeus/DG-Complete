"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { SeriesReview, SeriesUsage } from "@/lib/doc-series";
import { loadSeriesReview, saveSeriesSign } from "./series-actions";

// How each document series counts in sales / purchases, with a health check: series without a
// name in SoftOne or negative net sales are flagged, and the admin can set the sign per series.

const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
const compact = (v: number) => `${new Intl.NumberFormat("el-GR", { notation: "compact", maximumFractionDigits: 1 }).format(v)} €`;
const SIGN_LABEL: Record<number, string> = { 1: "Πώληση / αγορά (+)", [-1]: "Επιστροφή (−)", 0: "Εκτός" };
const CHOICES = [
  { sign: 1, label: "+", title: "Προστίθεται (τιμολόγιο, απόδειξη)", active: "bg-emerald-600 text-white" },
  { sign: -1, label: "−", title: "Αφαιρείται (πιστωτικό, επιστροφή)", active: "bg-amber-500 text-white" },
  { sign: 0, label: "Εκτός", title: "Δεν μετρά (παραγγελία, προσφορά, δελτίο)", active: "bg-slate-500 text-white" },
];
const ORIGIN: Record<SeriesUsage["origin"], string> = { series: "SoftOne σειρά", doc_type: "Τύπος παραστατικού", unknown: "Χωρίς όνομα", override: "Χειροκίνητα" };

export function SeriesPanel({ tenantId }: { tenantId: string }) {
  const [review, setReview] = useState<SeriesReview | null | undefined>(undefined);
  const [kind, setKind] = useState<"sales" | "purchases">("sales");
  const [busy, setBusy] = useState<number | null>(null);
  const [, start] = useTransition();
  const reload = useCallback(() => loadSeriesReview(tenantId).then(setReview, () => setReview(null)), [tenantId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  if (review === undefined) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Έλεγχος σειρών…
      </div>
    );
  }
  if (!review || !review.rows.length) return <p className="text-sm text-muted-foreground">Δεν υπάρχουν ακόμα παραστατικά στην αποθήκη του πελάτη.</p>;

  const save = (r: SeriesUsage, value: string) =>
    start(async () => {
      setBusy(r.series);
      const sign = value === "auto" ? null : Number(value);
      const res = await saveSeriesSign(tenantId, r.series, sign);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      await reload();
      setBusy(null);
    });

  const rows = review.rows.filter((r) => r.kind === kind);
  const net = kind === "sales" ? review.sales : review.purchases;
  return (
    <div className="space-y-4 text-sm">
      {review.issues.length === 0 ? (
        <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" /> Όλες οι σειρές με κίνηση είναι χαρακτηρισμένες.
        </p>
      ) : (
        <ul className="space-y-1.5" role="alert">
          {review.issues.map((i) => (
            <li key={i.message} className={`flex items-start gap-2 ${i.level === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}>
              {i.level === "error" ? <XCircle className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
              {i.message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["sales", "purchases"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${kind === k ? "border-sisyphus-500 bg-sisyphus-500 text-white" : "bg-card hover:bg-muted"}`}
          >
            {k === "sales" ? "Πωλήσεις" : "Αγορές"}
          </button>
        ))}
        {net !== null && <span className="text-xs text-muted-foreground">Καθαρό 12 μηνών: <strong className={net < 0 ? "text-destructive" : ""}>{eur(net)}</strong></span>}
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-emerald-700 dark:text-emerald-400">+</span> προστίθεται (τιμολόγια, αποδείξεις) ·{" "}
        <span className="font-medium text-amber-700 dark:text-amber-400">−</span> αφαιρείται (πιστωτικά, επιστροφές) ·{" "}
        <span className="font-medium">Εκτός</span> δεν μετρά (παραγγελίες, προσφορές, δελτία). Η πρόταση γίνεται αυτόματα από το όνομα της σειράς.
      </p>

      <div className="max-h-96 overflow-y-auto rounded-md border">
        <table className="w-full table-fixed text-xs">
          <colgroup>
            <col className="w-14" />
            <col />
            <col className="w-20" />
            <col className="w-24" />
            <col className="w-40" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-muted/80 text-muted-foreground backdrop-blur">
            <tr className="text-left">
              <th className="px-2 py-1.5 font-medium">Σειρά</th>
              <th className="px-2 py-1.5 font-medium">Όνομα</th>
              <th className="px-2 py-1.5 text-right font-medium">Παραστατικά</th>
              <th className="px-2 py-1.5 text-right font-medium">Αξία 12μ</th>
              <th className="px-2 py-1.5 font-medium" title="Αυτόματη πρόταση από το όνομα, εκτός αν αλλαχτεί">
                Πώς μετρά
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const manual = r.origin === "override";
              return (
                <tr key={r.series} className={`border-t ${r.origin === "unknown" && r.sign === 0 ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}>
                  <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.series}</td>
                  <td className="px-2 py-1.5">
                    <span className="block truncate font-medium" title={r.name ?? undefined}>
                      {r.name ?? "Χωρίς όνομα στο SoftOne"}
                    </span>
                    <span className="block truncate text-2xs text-muted-foreground">{ORIGIN[r.origin]}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{r.docs.toLocaleString("el-GR")}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap" title={eur(r.amount)}>
                    {compact(r.amount)}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div role="radiogroup" aria-label={`Πώς μετρά η σειρά ${r.series}`} className="inline-flex overflow-hidden rounded-md border">
                        {CHOICES.map((c) => {
                          const active = r.sign === c.sign;
                          return (
                            <button
                              key={c.sign}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              title={c.title}
                              disabled={busy !== null}
                              onClick={() => !active && save(r, String(c.sign))}
                              className={`min-h-8 min-w-8 px-2 font-semibold whitespace-nowrap transition-colors disabled:opacity-60 ${active ? c.active : "bg-background text-muted-foreground hover:bg-muted"}`}
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                      {busy === r.series ? (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                      ) : manual ? (
                        <button type="button" disabled={busy !== null} onClick={() => save(r, "auto")} className="text-sisyphus-600 underline-offset-2 hover:underline" title={`Αυτόματα: ${SIGN_LABEL[r.auto]}`}>
                          επαναφορά
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
