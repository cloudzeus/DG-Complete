// Reporting period from ?period=…&from=…&to=… — shared by every dashboard. The comparison period
// is the same dates one year earlier. Dates are YYYY-MM-DD (Athens business days).

export const PERIOD_PRESETS = {
  today: "Σήμερα",
  "7d": "Τελευταίες 7 ημέρες",
  "30d": "Τελευταίες 30 ημέρες",
  mtd: "Τρέχων μήνας",
  qtd: "Τρέχον τρίμηνο",
  ytd: "Από αρχή έτους",
  "12m": "Τελευταίοι 12 μήνες",
  last_year: "Προηγούμενο έτος",
  custom: "Επιλογή ημερομηνιών",
} as const;
export type PeriodPreset = keyof typeof PERIOD_PRESETS;

export type Period = {
  preset: PeriodPreset;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  label: string;
  /** Days in the period (inclusive). */
  days: number;
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function athensToday() {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const shiftYear = (s: string, n: number) => {
  const [y, m, d] = s.split("-").map(Number);
  const last = new Date(y + n, m, 0).getDate(); // 29 Feb → 28 Feb
  return `${y + n}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
};

export const fmtDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" });
};

export function resolvePeriod(sp: Record<string, string | string[] | undefined>, fallback: PeriodPreset = "ytd"): Period {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  let preset = (one("period") ?? fallback) as PeriodPreset;
  if (!(preset in PERIOD_PRESETS)) preset = fallback;
  const today = athensToday();
  const y = today.getFullYear();
  let from: Date;
  let to = today;
  switch (preset) {
    case "today":
      from = today;
      break;
    case "7d":
      from = new Date(y, today.getMonth(), today.getDate() - 6);
      break;
    case "30d":
      from = new Date(y, today.getMonth(), today.getDate() - 29);
      break;
    case "mtd":
      from = new Date(y, today.getMonth(), 1);
      break;
    case "qtd":
      from = new Date(y, Math.floor(today.getMonth() / 3) * 3, 1);
      break;
    case "12m":
      from = new Date(y - 1, today.getMonth(), today.getDate() + 1);
      break;
    case "last_year":
      from = new Date(y - 1, 0, 1);
      to = new Date(y - 1, 11, 31);
      break;
    case "custom": {
      const f = one("from");
      const t = one("to");
      if (f && t && DATE.test(f) && DATE.test(t) && f <= t) {
        const [fy, fm, fd] = f.split("-").map(Number);
        const [ty, tm, td] = t.split("-").map(Number);
        from = new Date(fy, fm - 1, fd);
        to = new Date(ty, tm - 1, td);
      } else {
        preset = fallback;
        from = new Date(y, 0, 1);
      }
      break;
    }
    default:
      from = new Date(y, 0, 1);
  }
  const f = iso(from);
  const t = iso(to);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return {
    preset,
    from: f,
    to: t,
    prevFrom: shiftYear(f, -1),
    prevTo: shiftYear(t, -1),
    days,
    label: preset === "custom" ? `${fmtDate(f)} – ${fmtDate(t)}` : PERIOD_PRESETS[preset],
  };
}

/** Query string that keeps the period when navigating between dashboards. */
export function periodQuery(p: Pick<Period, "preset" | "from" | "to">) {
  return p.preset === "custom" ? `period=custom&from=${p.from}&to=${p.to}` : `period=${p.preset}`;
}
