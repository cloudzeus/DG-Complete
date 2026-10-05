import "server-only";
import { prisma } from "@/lib/prisma";
import { formatS1Date, parseS1Date, s1GetTable } from "@/lib/softone";

// What does a customer's SoftOne installation actually contain?
// Light probes only: fiscal years, plus the ids of GL articles / documents of one recent month.

export type SourceProbe = { available: boolean; rowsLastMonth: number; error?: string };

export type Capabilities = {
  fiscalYears: { year: number; name: string; from: string | null; to: string | null }[];
  gl: SourceProbe; // Γενική Λογιστική (ACNHEADER / ACNTRN)
  sales: SourceProbe; // παραστατικά πωλήσεων (FINDOC, SOSOURCE 1351)
  purchases: SourceProbe; // παραστατικά αγορών (FINDOC, SOSOURCE 1251)
  recommended: "GL" | "COMMERCIAL" | "NONE";
  companyColumn: boolean; // whether COMPANY filtering works on this installation
};

const SOSOURCE_SALES = 1351;
const SOSOURCE_PURCHASES = 1251;

/** Tries the filter with COMPANY first, then without (installations differ). */
async function probe(connectionId: string, table: string, idField: string, filter: string, company: string) {
  const withCompany = /^\d+$/.test(company) ? `COMPANY=${company} AND ${filter}` : filter;
  try {
    return { rows: (await s1GetTable(connectionId, table, [idField], withCompany)).length, companyColumn: withCompany !== filter };
  } catch (err) {
    if (withCompany === filter) throw err;
    return { rows: (await s1GetTable(connectionId, table, [idField], filter)).length, companyColumn: false };
  }
}

async function probeSource(fn: () => Promise<{ rows: number; companyColumn: boolean }>): Promise<SourceProbe & { companyColumn?: boolean }> {
  try {
    const r = await fn();
    return { available: r.rows > 0, rowsLastMonth: r.rows, companyColumn: r.companyColumn };
  } catch (err) {
    return { available: false, rowsLastMonth: 0, error: (err as Error).message.slice(0, 300) };
  }
}

export async function detectCapabilities(connectionId: string): Promise<Capabilities> {
  const conn = await prisma.softOneConnection.findUniqueOrThrow({ where: { id: connectionId } });

  // Fiscal years (FISCPRD) — fall back to the calendar when the table can't be read.
  let fiscalYears: Capabilities["fiscalYears"] = [];
  try {
    const rows = await s1GetTable(
      conn.id,
      "FISCPRD",
      ["FISCPRD", "NAME", "FROMDATE", "FINALDATE"],
      /^\d+$/.test(conn.company) ? `COMPANY=${conn.company}` : "",
    ).catch(() => s1GetTable(conn.id, "FISCPRD", ["FISCPRD", "NAME", "FROMDATE", "FINALDATE"], ""));
    fiscalYears = rows
      .map((r) => ({
        year: Number(r.FISCPRD),
        name: String(r.NAME ?? r.FISCPRD),
        from: parseS1Date(r.FROMDATE)?.toISOString() ?? null,
        to: parseS1Date(r.FINALDATE)?.toISOString() ?? null,
      }))
      .filter((y) => Number.isInteger(y.year))
      .sort((a, b) => b.year - a.year);
  } catch {
    /* handled by the calendar fallback below */
  }

  // Probe the most recent complete month (documents of the current month may not be posted yet).
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 1);
  const range = `TRNDATE>='${formatS1Date(from)}' AND TRNDATE<'${formatS1Date(to)}'`;

  const [gl, sales, purchases] = await Promise.all([
    probeSource(() => probe(conn.id, "ACNHEADER", "ACNHEADER", `${range} AND ISCANCEL=0`, conn.company)),
    probeSource(() => probe(conn.id, "FINDOC", "FINDOC", `SOSOURCE=${SOSOURCE_SALES} AND ${range}`, conn.company)),
    probeSource(() => probe(conn.id, "FINDOC", "FINDOC", `SOSOURCE=${SOSOURCE_PURCHASES} AND ${range}`, conn.company)),
  ]);

  const caps: Capabilities = {
    fiscalYears,
    gl: { available: gl.available, rowsLastMonth: gl.rowsLastMonth, error: gl.error },
    sales: { available: sales.available, rowsLastMonth: sales.rowsLastMonth, error: sales.error },
    purchases: { available: purchases.available, rowsLastMonth: purchases.rowsLastMonth, error: purchases.error },
    recommended: gl.available ? "GL" : sales.available || purchases.available ? "COMMERCIAL" : "NONE",
    companyColumn: !!(gl.companyColumn ?? sales.companyColumn),
  };

  await prisma.softOneConnection.update({
    where: { id: conn.id },
    data: { capabilities: caps, detectedAt: new Date() },
  });
  return caps;
}
