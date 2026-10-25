import "server-only";
import ExcelJS from "exceljs";

// Excel workbooks for every export: Greek headers, € / % / number formats, autofilter, frozen
// header row, sensible widths. Values arrive already scaled (percent = 12.5 → "12,5%").

export type ExportFormat = "text" | "eur" | "int" | "num" | "pct" | "date";
export type ExportColumn = { key: string; label: string; format?: ExportFormat };
export type ExportSheet = { name: string; columns: ExportColumn[]; rows: Record<string, unknown>[] };

const NUM_FMT: Record<ExportFormat, string | undefined> = {
  text: undefined,
  eur: '#,##0.00 "€";[Red]-#,##0.00 "€"',
  int: "#,##0",
  num: "#,##0.00",
  pct: '0.0"%"',
  date: "dd/mm/yyyy",
};

const cell = (v: unknown, f: ExportFormat) => {
  if (v === null || v === undefined || v === "") return null;
  if (f === "date") {
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d;
  }
  if (f === "text") return String(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : String(v);
};

export async function buildWorkbook(title: string, sheets: ExportSheet[], meta: { subtitle?: string } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DG Complete";
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Δεδομένα", {
      views: [{ state: "frozen", ySplit: 3 }],
    });
    ws.addRow([title]).font = { bold: true, size: 13 };
    ws.addRow([meta.subtitle ?? `Εξαγωγή ${new Date().toLocaleString("el-GR", { timeZone: "Europe/Athens" })}`]).font = { italic: true, color: { argb: "FF6B6B6B" } };
    const header = ws.addRow(s.columns.map((c) => c.label));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE31E2A" } };
      c.alignment = { vertical: "middle" };
    });
    for (const r of s.rows) ws.addRow(s.columns.map((c) => cell(r[c.key], c.format ?? "text")));
    s.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      const fmt = NUM_FMT[c.format ?? "text"];
      if (fmt) col.numFmt = fmt;
      const longest = Math.max(c.label.length, ...s.rows.slice(0, 500).map((r) => String(r[c.key] ?? "").length));
      col.width = Math.min(60, Math.max(10, c.format && c.format !== "text" ? 14 : longest + 2));
    });
    if (s.rows.length) {
      ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + s.rows.length, column: s.columns.length } };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
