"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/components/admin/tone";
import type { SeriesReview, SeriesUsage } from "@/lib/doc-series";
import { loadSeriesReview, saveSeriesSign } from "./series-actions";

// How each document series counts in sales / purchases, with a health check: series without a
// name in SoftOne or negative net sales are flagged, and the admin can set the sign per series.

const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
const SIGN_LABEL: Record<number, string> = { 1: "Μετρά (+)", [-1]: "Αφαιρείται (−)", 0: "Δεν μετρά" };
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

      <div className="max-h-96 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
            <tr className="border-b text-left">
              <th className="py-2 pr-3 font-medium">Σειρά</th>
              <th className="py-2 pr-3 font-medium">Όνομα</th>
              <th className="py-2 pr-3 text-right font-medium">Παραστ. 12μ</th>
              <th className="py-2 pr-3 text-right font-medium">Αξία 12μ</th>
              <th className="py-2 font-medium">Πώς μετρά</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.series} className={`border-b last:border-0 ${r.origin === "unknown" && r.sign === 0 ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}>
                <td className="py-2 pr-3 tabular-nums">{r.series}</td>
                <td className="max-w-64 py-2 pr-3">
                  <span className="block truncate">{r.name ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{ORIGIN[r.origin]}</span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.docs.toLocaleString("el-GR")}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{eur(r.amount)}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Πρόσημο σειράς ${r.series}`}
                      value={r.origin === "override" ? String(r.sign) : "auto"}
                      disabled={busy !== null}
                      onChange={(e) => save(r, e.target.value)}
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="auto">Αυτόματα: {SIGN_LABEL[r.auto]}</option>
                      <option value="1">{SIGN_LABEL[1]}</option>
                      <option value="-1">{SIGN_LABEL[-1]}</option>
                      <option value="0">{SIGN_LABEL[0]}</option>
                    </select>
                    {busy === r.series && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                    {r.origin !== "override" && r.sign !== 0 && <StatusPill tone={r.sign > 0 ? "green" : "amber"}>{r.sign > 0 ? "+" : "−"}</StatusPill>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
