import "server-only";
import { gunzipSync } from "node:zlib";
import iconv from "iconv-lite";
import { decryptJson, encrypt, decrypt, encryptJson } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

// SoftOne Web Services client (official services only).
// Rules: two-step login → authenticate · permanent clientID cached for the whole day (encrypted in DB)
// · re-auth only on errorcode -100/-101 · every response decoded from windows-1253.

export type SoftOneCredentials = { username: string; password: string };

export type SoftOneTarget = {
  baseUrl: string;
  appId: string;
  company: string;
  branch: string;
  module: string;
  refId: string;
} & SoftOneCredentials;

export type SoftOneResponse = { success: boolean; error?: string; errorcode?: number; [key: string]: unknown };

export type SoftOneLoginObj = {
  COMPANY: string;
  COMPANYNAME?: string;
  BRANCH: string;
  BRANCHNAME?: string;
  MODULE: string;
  MODULENAME?: string;
  REFID: string;
  REFIDNAME?: string;
};

export class SoftOneError extends Error {
  constructor(
    message: string,
    readonly errorcode?: number,
  ) {
    super(message);
    this.name = "SoftOneError";
  }
}

const SESSION_EXPIRED = new Set([-100, -101]);
const TIMEOUT_MS = 30_000;

/** Today in Greece — the clientID is valid for one calendar day. */
function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date());
}

/** POST to /s1services and decode the windows-1253 (optionally gzipped) JSON body. */
export async function s1Fetch(baseUrl: string, body: object): Promise<SoftOneResponse> {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept-Encoding": "gzip" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let buf = Buffer.from(await res.arrayBuffer());
  // fetch usually inflates gzip already; only gunzip when the gzip magic bytes are still there.
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  const text = iconv.decode(buf, "win1253");
  try {
    return JSON.parse(text) as SoftOneResponse;
  } catch {
    throw new SoftOneError(`Μη αναμενόμενη απάντηση (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

/** Step 1 — temporary clientID + the company/branch/module/refid combinations of the account. */
export async function s1Login(t: Pick<SoftOneTarget, "baseUrl" | "appId" | "username" | "password">) {
  const login = await s1Fetch(t.baseUrl, {
    SERVICE: "Login",
    USERNAME: t.username,
    PASSWORD: t.password,
    APPID: t.appId,
    VERSION: "2",
  });
  if (!login.success) throw new SoftOneError(`Login: ${login.error ?? "αποτυχία"}`, login.errorcode);
  return { clientID: String(login.clientID), objs: (login.objs as SoftOneLoginObj[] | undefined) ?? [] };
}

/** Step 2 — permanent clientID. */
export async function s1Authenticate(t: SoftOneTarget, tempClientId: string): Promise<string> {
  // Only COMPANY is mandatory; BRANCH / MODULE / REFID are sent when configured.
  const optional = Object.fromEntries(
    ([["BRANCH", t.branch], ["MODULE", t.module], ["REFID", t.refId]] as const).filter(([, v]) => v !== ""),
  );
  const auth = await s1Fetch(t.baseUrl, {
    service: "authenticate",
    clientID: tempClientId,
    COMPANY: t.company,
    ...optional,
    VERSION: "2",
  });
  if (!auth.success) throw new SoftOneError(`Authenticate: ${auth.error ?? "αποτυχία"}`, auth.errorcode);
  return String(auth.clientID);
}

// ───────────── Stored connections (softone_connection) ─────────────

const credAad = (id: string) => `softone_connection:${id}:credentials`;
const sessionAad = (id: string) => `softone_connection:${id}:session`;

export function sealSoftOneCredentials(id: string, creds: SoftOneCredentials) {
  return encryptJson(creds, credAad(id));
}

export function openSoftOneCredentials(id: string, envelope: string) {
  return decryptJson<SoftOneCredentials>(envelope, credAad(id));
}

async function loadTarget(connectionId: string) {
  const conn = await prisma.softOneConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new SoftOneError("Η σύνδεση SoftOne δεν βρέθηκε.");
  return { conn, target: { ...conn, ...openSoftOneCredentials(conn.id, conn.credentialsEnc) } as SoftOneTarget };
}

async function freshSession(connectionId: string, target: SoftOneTarget) {
  const { clientID } = await s1Login(target);
  const permanent = await s1Authenticate(target, clientID);
  await prisma.softOneConnection.update({
    where: { id: connectionId },
    data: { sessionEnc: encrypt(permanent, sessionAad(connectionId)), sessionDate: today() },
  });
  return permanent;
}

/** Cached clientID of today, or a new login → authenticate. */
async function sessionFor(connectionId: string) {
  const { conn, target } = await loadTarget(connectionId);
  if (conn.sessionEnc && conn.sessionDate === today()) {
    return { clientID: decrypt(conn.sessionEnc, sessionAad(conn.id)), target };
  }
  return { clientID: await freshSession(conn.id, target), target };
}

/** Calls an official S1 service through a stored connection; re-authenticates once on -100/-101. */
export async function s1Call(connectionId: string, service: string, params: Record<string, unknown> = {}) {
  const { clientID, target } = await sessionFor(connectionId);
  const call = (id: string) => s1Fetch(target.baseUrl, { service, clientID: id, appId: target.appId, VERSION: "2", ...params });
  const data = await call(clientID);
  if (!data.success && data.errorcode !== undefined && SESSION_EXPIRED.has(Number(data.errorcode))) {
    return call(await freshSession(connectionId, target));
  }
  return data;
}

export async function getDgsoftConnection() {
  return prisma.softOneConnection.findFirst({ where: { scope: "DGSOFT" } });
}

// ───────────── Official data services ─────────────

export type Row = Record<string, unknown>;

/** Normalises the row shapes S1 returns (objects, or arrays + model/field list). */
export function rowsOf(resp: SoftOneResponse, fields: string[] = []): Row[] {
  const data = (resp.data ?? resp.rows ?? []) as unknown[];
  if (!Array.isArray(data) || data.length === 0) return [];
  if (!Array.isArray(data[0])) return data as Row[];
  const model = resp.model as unknown;
  let names: string[] = fields;
  if (Array.isArray(model)) {
    const flat = (Array.isArray(model[0]) ? model[0] : model) as ({ name?: string } | string)[];
    const fromModel = flat.map((m) => (typeof m === "string" ? m : (m?.name ?? ""))).filter(Boolean);
    if (fromModel.length === (data[0] as unknown[]).length) names = fromModel;
  }
  return (data as unknown[][]).map((r) => Object.fromEntries(names.map((n, i) => [n.toUpperCase(), r[i]])));
}

function ensure(resp: SoftOneResponse, what: string) {
  if (!resp.success) throw new SoftOneError(`${what}: ${resp.error ?? "αποτυχία"}`, resp.errorcode);
  return resp;
}

/** GetTable — direct read of a database table (TABLE, FIELDS, FILTER). */
export async function s1GetTable(connectionId: string, table: string, fields: string[], filter = "") {
  const resp = ensure(
    await s1Call(connectionId, "GetTable", { TABLE: table, FIELDS: fields.join(","), FILTER: filter }),
    `GetTable ${table}`,
  );
  return rowsOf(resp, fields);
}

export async function s1GetData(connectionId: string, object: string, key: string | number, locateinfo = "") {
  return ensure(await s1Call(connectionId, "getData", { OBJECT: object, KEY: key, LOCATEINFO: locateinfo }), `getData ${object}`);
}

/** setData — insert when key is empty. Returns the record id. */
export async function s1SetData(connectionId: string, object: string, data: Record<string, Row[]>, key = "") {
  const resp = ensure(await s1Call(connectionId, "setData", { OBJECT: object, KEY: key, DATA: data }), `setData ${object}`);
  return String(resp.id ?? key);
}

/** Parses S1 date strings ("2026-10-05 13:22:11" / "2026-10-05T13:22:11") as Athens local time. */
export function parseS1Date(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  // Interpret as Europe/Athens wall time.
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  const offset = new Date(asUtc).toLocaleString("en-US", { timeZone: "Europe/Athens", timeZoneName: "shortOffset" });
  const off = offset.match(/GMT([+-]\d+)/)?.[1] ?? "+2";
  return new Date(asUtc - Number(off) * 3600_000);
}

/** Formats a Date as S1 wall time in Athens: "YYYY-MM-DD HH:mm:ss". */
export function formatS1Date(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
