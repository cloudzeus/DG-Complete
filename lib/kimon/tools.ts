import "server-only";
import { cubeLoad, type CubeQuery, type CubeRow } from "@/lib/cube-client";
import { buildInsights } from "@/lib/insights";
import type { KimonCatalog } from "@/lib/kimon/catalog";
import type { KimonArtifact, KimonColumn, KimonContext, KimonFormat } from "@/lib/kimon/types";
import { resolvePeriod, PERIOD_PRESETS } from "@/lib/period";

// The tools Κίμων can call. Every query runs through Cube with the tenant's own short-lived token,
// so the data is scoped to that tenant inside Cube — the model can't reach anything else.

const FORMATS = ["text", "eur", "int", "num", "pct", "date"] as const;

const LISTS = {
  "customers:churn": "Πελάτες που σταμάτησαν να αγοράζουν",
  "customers:risk": "Πελάτες με επισφάλειες / κακή πληρωμή",
  "customers:top": "Μεγαλύτεροι πελάτες",
  "customers:all": "Όλοι οι πελάτες",
  "stock:reorder": "Προτάσεις παραγγελίας",
  "stock:dead": "Νεκρό απόθεμα",
  "stock:slow": "Αργή κίνηση αποθέματος",
  "stock:all": "Όλο το απόθεμα",
  orders: "Παραγγελία ανά προμηθευτή (επεξεργασία, Excel, αποστολή στο SoftOne)",
  "products:sales": "Προϊόντα με τις περισσότερες πωλήσεις",
  "products:profit": "Προϊόντα με το μεγαλύτερο κέρδος",
  "products:low-margin": "Προϊόντα με χαμηλό ή αρνητικό περιθώριο",
  "products:categories": "Πωλήσεις ανά κατηγορία",
  "products:brands": "Πωλήσεις ανά μάρκα",
  "suppliers:scorecard": "Αξιολόγηση προμηθευτών",
  "suppliers:prices": "Αυξήσεις τιμών προμηθευτών",
  "suppliers:lead": "Χρόνοι παράδοσης προμηθευτών",
  "suppliers:dependency": "Εξάρτηση από προμηθευτές",
  "cash:receivables": "Ανοιχτά υπόλοιπα πελατών",
  "cash:payables": "Ανοιχτά υπόλοιπα προμηθευτών",
  pnl: "Αποτελέσματα χρήσης",
  sales: "Πωλήσεις",
  purchases: "Αγορές",
  overview: "Επισκόπηση",
} as const;
type ListKey = keyof typeof LISTS;

export const KIMON_TOOLS = [
  {
    type: "function",
    function: {
      name: "query_cube",
      description:
        "Τρέχει ένα ερώτημα στο μοντέλο δεδομένων (Cube) της εταιρείας και επιστρέφει γραμμές και ένα result_id για show_table / show_chart.",
      parameters: {
        type: "object",
        properties: {
          purpose: { type: "string", description: "Τι θέλεις να μάθεις, σε λίγες λέξεις (εμφανίζεται στον χρήστη όσο τρέχει)." },
          query: {
            type: "object",
            description: "Cube REST query: measures, dimensions, timeDimensions, filters, order, limit.",
            properties: {
              measures: { type: "array", items: { type: "string" } },
              dimensions: { type: "array", items: { type: "string" } },
              timeDimensions: { type: "array", items: { type: "object" } },
              filters: { type: "array", items: { type: "object" } },
              order: { type: "object", additionalProperties: { type: "string", enum: ["asc", "desc"] } },
              limit: { type: "integer", minimum: 1, maximum: 1000 },
            },
          },
        },
        required: ["purpose", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_table",
      description: "Δείχνει στον χρήστη έναν πίνακα από αποτέλεσμα του query_cube (με εξαγωγή σε Excel).",
      parameters: {
        type: "object",
        properties: {
          result_id: { type: "string" },
          title: { type: "string" },
          columns: {
            type: "array",
            description: "Στήλες με τη σειρά εμφάνισης. member = πλήρες όνομα (π.χ. sales_lines.revenue).",
            items: {
              type: "object",
              properties: { member: { type: "string" }, label: { type: "string" }, format: { type: "string", enum: FORMATS } },
              required: ["member", "label"],
            },
          },
        },
        required: ["result_id", "title", "columns"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_chart",
      description: "Δείχνει γράφημα από αποτέλεσμα του query_cube: bar (σύγκριση), line / area (τάση στον χρόνο), pie (κατανομή, έως 8 κομμάτια).",
      parameters: {
        type: "object",
        properties: {
          result_id: { type: "string" },
          title: { type: "string" },
          kind: { type: "string", enum: ["bar", "line", "area", "pie"] },
          x: { type: "string", description: "Member του άξονα X / των κατηγοριών (για χρόνο: π.χ. sales_lines.date.month)." },
          series: {
            type: "array",
            items: {
              type: "object",
              properties: { member: { type: "string" }, label: { type: "string" }, format: { type: "string", enum: FORMATS } },
              required: ["member", "label"],
            },
          },
        },
        required: ["result_id", "title", "kind", "x", "series"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_to_list",
      description: "Προσθέτει σύνδεσμο προς έτοιμη λίστα / σελίδα των dashboards, όπου ο χρήστης βλέπει όλες τις γραμμές.",
      parameters: {
        type: "object",
        properties: {
          list: { type: "string", enum: Object.keys(LISTS) },
          label: { type: "string", description: "Κείμενο συνδέσμου, π.χ. «Δείτε τους 37 πελάτες σε κίνδυνο»." },
        },
        required: ["list", "label"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_insights",
      description: "Τα αυτόματα επιχειρηματικά ευρήματα της Επισκόπησης (πωλήσεις, κερδοφορία, πελάτες, εισπράξεις, αποθήκη) για μια περίοδο.",
      parameters: {
        type: "object",
        properties: { period: { type: "string", enum: Object.keys(PERIOD_PRESETS).filter((p) => p !== "custom") } },
        required: ["period"],
      },
    },
  },
];

const PCT = /(pct|percent|share|growth|change|margin_\w*pct)$/;
const EUR = /(revenue|margin|amount|net|gross|vat|balance|value|cost|spend|inflow|outflow|price|overdue|open_\d|invoiced|paid|returns|profit|cogs|opex|ebitda|ebit|expenses|income|financial|depreciation|tax|avg_invoice|_12m)$/;

/** Display format of a member: explicit from the model, else from its type and name. */
export function formatOf(member: string, catalog: KimonCatalog, explicit?: string): KimonFormat {
  if (explicit && (FORMATS as readonly string[]).includes(explicit)) return explicit as KimonFormat;
  const base = member.split(".").slice(0, 2).join(".");
  const type = catalog.types.get(base);
  const name = base.slice(base.indexOf(".") + 1);
  if (type === "time" || member.split(".").length > 2) return "date";
  if (type === "string" || type === "boolean") return "text";
  if (PCT.test(name)) return "pct";
  if (/days|_days_|lead_days/.test(name)) return "num";
  if (EUR.test(name)) return "eur";
  if (/count|documents|customers|items|invoices|suppliers|lines|orders|qty|quantity|stock$/.test(name)) return "num";
  return "num";
}

type Result = { query: CubeQuery; rows: CubeRow[] };

export type ToolRun = {
  tenantId: string;
  /** Dashboard pages of the tenant's plan (links only to those). */
  pages: Set<string>;
  catalog: KimonCatalog;
  context?: KimonContext;
  results: Map<string, Result>;
  artifacts: KimonArtifact[];
  status: (text: string) => void;
  artifact: (a: KimonArtifact) => void;
};

const idOf = (prefix: string, n: number) => `${prefix}${n}`;

function checkMembers(q: CubeQuery, catalog: KimonCatalog) {
  const used = [
    ...(q.measures ?? []),
    ...(q.dimensions ?? []),
    ...(q.timeDimensions ?? []).map((t) => t.dimension),
    ...JSON.stringify(q.filters ?? []).matchAll(/"(?:member|dimension)":"([^"]+)"/g).map((m) => m[1]),
    ...Object.keys(Array.isArray(q.order) ? Object.fromEntries(q.order) : (q.order ?? {})),
  ];
  const unknown = [...new Set(used.filter((m) => !catalog.members.has(m.split(".").slice(0, 2).join("."))))];
  return unknown;
}

const rowsForModel = (rows: CubeRow[]) => rows.slice(0, 60);

export async function runTool(name: string, rawArgs: string, run: ToolRun): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return JSON.stringify({ error: "Τα ορίσματα δεν είναι έγκυρο JSON." });
  }

  if (name === "query_cube") {
    const query = (args.query ?? {}) as CubeQuery;
    const unknown = checkMembers(query, run.catalog);
    if (unknown.length) return JSON.stringify({ error: `Άγνωστα members: ${unknown.join(", ")}. Χρησιμοποίησε μόνο τον κατάλογο.` });
    const limit = Math.min(Math.max(Number(query.limit ?? 100), 1), 1000);
    run.status(String(args.purpose ?? "Αναζήτηση στα δεδομένα…").slice(0, 120));
    try {
      const rows = await cubeLoad(run.tenantId, { ...query, limit });
      const id = idOf("r", run.results.size + 1);
      run.results.set(id, { query: { ...query, limit }, rows });
      return JSON.stringify({ result_id: id, row_count: rows.length, truncated: rows.length >= limit, rows: rowsForModel(rows) });
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message.slice(0, 400) });
    }
  }

  if (name === "show_table" || name === "show_chart") {
    const result = run.results.get(String(args.result_id));
    if (!result) return JSON.stringify({ error: "Άγνωστο result_id — τρέξε πρώτα query_cube." });
    const title = String(args.title ?? "").slice(0, 150) || "Αποτελέσματα";
    if (name === "show_table") {
      const cols = (Array.isArray(args.columns) ? args.columns : []) as { member: string; label: string; format?: string }[];
      const columns: KimonColumn[] = cols
        .filter((c) => typeof c.member === "string")
        .slice(0, 20)
        .map((c) => ({ key: c.member, label: String(c.label ?? c.member).slice(0, 60), format: formatOf(c.member, run.catalog, c.format) }));
      if (!columns.length) return JSON.stringify({ error: "Δώσε τουλάχιστον μία στήλη." });
      const artifact: KimonArtifact = {
        type: "table",
        id: idOf("t", run.artifacts.length + 1),
        title,
        columns,
        rows: result.rows.slice(0, 500),
        truncated: result.rows.length > 500,
        query: result.query as Record<string, unknown>,
      };
      run.artifacts.push(artifact);
      run.artifact(artifact);
      return JSON.stringify({ ok: true, shown_rows: artifact.rows.length });
    }
    const series = ((Array.isArray(args.series) ? args.series : []) as { member: string; label: string; format?: string }[])
      .filter((s) => typeof s.member === "string")
      .slice(0, 4)
      .map((s) => ({ key: s.member, label: String(s.label ?? s.member).slice(0, 60), format: formatOf(s.member, run.catalog, s.format) }));
    const x = String(args.x ?? "");
    if (!series.length || !x) return JSON.stringify({ error: "Δώσε x και τουλάχιστον μία σειρά." });
    const kind = (["bar", "line", "area", "pie"] as const).find((k) => k === args.kind) ?? "bar";
    const artifact: KimonArtifact = {
      type: "chart",
      id: idOf("c", run.artifacts.length + 1),
      title,
      kind,
      x,
      xFormat: formatOf(x, run.catalog),
      series,
      rows: result.rows.slice(0, kind === "pie" ? 8 : 400),
    };
    run.artifacts.push(artifact);
    run.artifact(artifact);
    return JSON.stringify({ ok: true });
  }

  if (name === "link_to_list") {
    const list = String(args.list) as ListKey;
    if (!(list in LISTS)) return JSON.stringify({ error: "Άγνωστη λίστα." });
    const [pageOf] = list === "overview" ? [""] : list.split(":");
    if (!run.pages.has(pageOf)) return JSON.stringify({ error: "Η σελίδα δεν περιλαμβάνεται στο πακέτο του πελάτη." });
    const [page, tab] = list === "overview" ? [""] : (list.split(":") as [string, string?]);
    const q = new URLSearchParams();
    if (tab) q.set("tab", tab);
    if (run.context?.period) q.set("period", run.context.period);
    if (run.context?.period === "custom" && run.context.from && run.context.to) {
      q.set("from", run.context.from);
      q.set("to", run.context.to);
    }
    const qs = q.toString();
    const artifact: KimonArtifact = {
      type: "link",
      id: idOf("l", run.artifacts.length + 1),
      label: String(args.label ?? LISTS[list]).slice(0, 120),
      href: `/dashboards/${run.tenantId}${page ? `/${page}` : ""}${qs ? `?${qs}` : ""}`,
    };
    run.artifacts.push(artifact);
    run.artifact(artifact);
    return JSON.stringify({ ok: true });
  }

  if (name === "get_insights") {
    run.status("Διαβάζω τα ευρήματα της επισκόπησης…");
    const period = resolvePeriod({ period: String(args.period ?? "ytd") });
    try {
      const { insights, kpis } = await buildInsights(run.tenantId, period);
      return JSON.stringify({
        period: `${period.from} έως ${period.to} (σύγκριση ${period.prevFrom} έως ${period.prevTo})`,
        kpis,
        insights: insights.map((i) => ({ area: i.area, severity: i.severity, title: i.title, detail: i.detail, action: i.action })),
      });
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message.slice(0, 400) });
    }
  }

  return JSON.stringify({ error: `Άγνωστο εργαλείο ${name}.` });
}
