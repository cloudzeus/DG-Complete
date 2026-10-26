// Display helpers (el-GR, Europe/Athens).
const dt = new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" });
const d = new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeZone: "Europe/Athens" });

export const fmtDateTime = (iso: string | null | undefined) => (iso ? dt.format(new Date(iso)) : "—");
export const fmtDate = (iso: string | null | undefined) => (iso ? d.format(new Date(iso)) : "—");
export const fmtNum = (n: number, digits = 0) => n.toLocaleString("el-GR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtDuration = (ms: number | null) => (ms === null ? "—" : ms < 60_000 ? `${(ms / 1000).toFixed(1)}″` : `${Math.floor(ms / 60_000)}′ ${Math.round((ms % 60_000) / 1000)}″`);
const t = new Intl.DateTimeFormat("el-GR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Europe/Athens" });
/** HH:MM:SS for log lines. */
export const fmtTime = (iso: string | null | undefined) => (iso ? t.format(new Date(iso)) : "—");
