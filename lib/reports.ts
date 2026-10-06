import "server-only";
import { cubeLoad, type CubeQuery } from "@/lib/cube-client";
import { tenantCubeMeta, type MetaCubeInfo } from "@/lib/kimon/catalog";
import { resolvePeriod } from "@/lib/period";
import { REPORT_LIBRARY, type ReportDefinition } from "@/lib/report-types";

// Report builder: turns a report definition into one Cube query (only fields of the tenant's plan,
// all from the same cube), and lists the library reports the tenant can run.

const MAX_ROWS = 5000;

export async function reportMeta(tenantId: string): Promise<MetaCubeInfo[]> {
  const cubes = await tenantCubeMeta(tenantId);
  // Only cubes that can be grouped (dimensions) and measured.
  return cubes.filter((c) => c.fields.some((f) => f.kind === "measure") && c.fields.some((f) => f.kind === "dimension"));
}

/** Library reports whose cube the tenant has. */
export async function availableLibrary(tenantId: string) {
  const cubes = new Set((await reportMeta(tenantId)).map((c) => c.name));
  return REPORT_LIBRARY.filter((r) => cubes.has(r.definition.cube));
}

export type ReportResult = { rows: Record<string, unknown>[]; truncated: boolean; period: { from: string; to: string; label: string } | null };

/** «cube.date@month» → time dimension + granularity. */
export const parseField = (f: string) => {
  const [name, granularity] = f.split("@");
  return { name, granularity: granularity as "day" | "week" | "month" | "quarter" | "year" | undefined };
};
/** Key of the field in Cube's result rows. */
export const resultKey = (f: string) => {
  const { name, granularity } = parseField(f);
  return granularity ? `${name}.${granularity}` : name;
};

export async function runReport(tenantId: string, def: ReportDefinition): Promise<ReportResult> {
  const cubes = await reportMeta(tenantId);
  const cube = cubes.find((c) => c.name === def.cube);
  if (!cube) throw new Error("Το θέμα της αναφοράς δεν είναι διαθέσιμο στο πακέτο σας.");
  const fields = new Map(cube.fields.map((f) => [f.name, f]));
  const check = (f: string, kind: "measure" | "dimension") => {
    const x = fields.get(parseField(f).name);
    if (!x || x.kind !== kind) throw new Error(`Άγνωστο πεδίο: ${f}`);
    return x;
  };
  const groupBy = [...def.rows, ...def.columns];
  if (!def.values.length) throw new Error("Προσθέστε τουλάχιστον μία τιμή (π.χ. Τζίρος).");
  def.values.forEach((v) => check(v, "measure"));
  groupBy.forEach((g) => check(g, "dimension"));

  const timeFields = groupBy.filter((g) => parseField(g).granularity);
  if (new Set(timeFields.map((t) => parseField(t).name)).size > 1 || timeFields.length > 1) throw new Error("Χρησιμοποιήστε μία ομαδοποίηση ημερομηνίας (π.χ. μήνας) ανά αναφορά.");
  // The period applies to the cube's transaction date; a date grouping may use any time field.
  const dateDim = cube.fields.find((f) => f.kind === "dimension" && f.type === "time" && /\.date$/.test(f.name));
  const period = def.period && dateDim ? resolvePeriod({ period: def.period.preset, from: def.period.from, to: def.period.to }) : null;
  const grouped = timeFields[0] ? parseField(timeFields[0]) : null;
  const timeDimensions: NonNullable<CubeQuery["timeDimensions"]> = [];
  if (grouped && grouped.name !== dateDim?.name) timeDimensions.push({ dimension: grouped.name, granularity: grouped.granularity });
  if (dateDim && (period || grouped?.name === dateDim.name)) {
    timeDimensions.push({
      dimension: dateDim.name,
      ...(period ? { dateRange: [period.from, period.to] as [string, string] } : {}),
      ...(grouped?.name === dateDim.name ? { granularity: grouped.granularity } : {}),
    });
  }

  const query: CubeQuery = {
    measures: def.values,
    dimensions: groupBy.filter((g) => !parseField(g).granularity),
    timeDimensions,
    filters: (def.filters ?? [])
      .filter((f) => f.values.length || f.operator === "set" || f.operator === "notSet")
      .map((f) => {
        check(f.member, fields.get(f.member)?.kind === "measure" ? "measure" : "dimension");
        return { member: f.member, operator: f.operator, values: f.values.map(String) };
      }),
    // Time series in date order; otherwise the biggest first.
    order: def.sort
      ? { [resultKey(def.sort.by)]: def.sort.desc ? "desc" : "asc" }
      : grouped
        ? { [grouped.name]: "asc" }
        : { [def.values[0]]: "desc" },
    limit: Math.min(def.limit ?? MAX_ROWS, MAX_ROWS),
  };
  const rows = await cubeLoad(tenantId, query);
  return { rows, truncated: rows.length >= (query.limit ?? MAX_ROWS), period: period ? { from: period.from, to: period.to, label: period.label } : null };
}

/** Distinct values of a dimension for the filter picker. */
export async function dimensionValues(tenantId: string, cubeName: string, member: string, search: string) {
  const cube = (await reportMeta(tenantId)).find((c) => c.name === cubeName);
  const f = cube?.fields.find((x) => x.name === member && x.kind === "dimension");
  if (!f) return [];
  const measure = cube!.fields.find((x) => x.kind === "measure")!.name;
  const rows = await cubeLoad(tenantId, {
    dimensions: [member],
    measures: [measure],
    ...(search.trim() ? { filters: [{ member, operator: "contains", values: [search.trim(), search.trim().toUpperCase()] }] } : {}),
    order: { [measure]: "desc" },
    limit: 50,
  });
  return rows.map((r) => String(r[member] ?? "")).filter(Boolean);
}
