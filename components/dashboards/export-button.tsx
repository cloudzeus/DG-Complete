"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type ExportSheetSpec = {
  name: string;
  columns: { key: string; label: string; format?: "text" | "eur" | "int" | "num" | "pct" | "date" }[];
  query?: Record<string, unknown>;
  rows?: Record<string, unknown>[];
};

/** Downloads an .xlsx built on the server (Cube query or the rows on screen). */
export function ExportButton({
  tenantId,
  title,
  subtitle,
  sheets,
  label = "Excel",
  size = "sm",
}: {
  tenantId: string;
  title: string;
  subtitle?: string;
  sheets: ExportSheetSpec[];
  label?: string;
  size?: "sm" | "xs";
}) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/bi/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, title, subtitle, sheets }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Η εξαγωγή απέτυχε", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" variant="outline" size={size} onClick={run} disabled={busy} className="bg-card">
      {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet className="text-emerald-600" />}
      {label}
    </Button>
  );
}
