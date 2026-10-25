import "server-only";
import { prisma } from "@/lib/prisma";

// Business registry lookup by AFM (afm2info): auto-fill of customer details from the AFM.

export async function getAfmSettings() {
  return (
    (await prisma.afmLookupSettings.findUnique({ where: { id: "default" } })) ?? (await prisma.afmLookupSettings.create({ data: { id: "default" } }))
  );
}

export type KadItem = { code: string; descr: string; main: boolean };
export type AfmInfo = {
  afm: string;
  name: string | null;
  title: string | null;
  legal: string | null;
  active: boolean;
  registered: string | null;
  mainKad: string | null;
  mainKadDescr: string | null;
  kads: KadItem[];
};

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function lookupAfm(url: string, afm: string): Promise<AfmInfo | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ afm }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`afm2info HTTP ${res.status}`);
  const body = (await res.json().catch(() => null)) as {
    basic_rec?: Record<string, unknown>;
    firm_act_tab?: { item?: Record<string, unknown>[] | Record<string, unknown> };
    error?: unknown;
  } | null;
  const b = body?.basic_rec;
  if (!b || !text(b.afm)) return null;
  const raw = body?.firm_act_tab?.item;
  const items = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map((i) => ({ code: String(i.firm_act_code ?? "").trim(), descr: String(i.firm_act_descr ?? "").trim(), main: String(i.firm_act_kind) === "1" }))
    .filter((i) => i.code);
  const main = items.find((i) => i.main) ?? items[0] ?? null;
  return {
    afm,
    name: text(b.onomasia),
    title: text(b.commer_title),
    legal: text(b.legal_status_descr),
    active: String(b.deactivation_flag ?? "1") === "1",
    registered: text(b.regist_date),
    mainKad: main?.code ?? null,
    mainKadDescr: main?.descr ?? null,
    kads: items,
  };
}
