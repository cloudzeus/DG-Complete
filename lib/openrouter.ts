import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

// The platform's OpenRouter account. Every call is metered per tenant in ai_usage with the cost
// OpenRouter reports (usage accounting) and our markup, snapshotted at call time.

const API = "https://openrouter.ai/api/v1";
const AAD = "ai_settings:default";
const APP_URL = process.env.BETTER_AUTH_URL ?? "https://bi.dgsmart.gr";

export async function getAiSettings() {
  return (
    (await prisma.aiSettings.findUnique({ where: { id: "default" } })) ??
    (await prisma.aiSettings.create({ data: { id: "default" } }))
  );
}

export const sealApiKey = (key: string) => encrypt(key, AAD);

async function apiKey(): Promise<string> {
  const s = await getAiSettings();
  if (!s.apiKeyEnc) throw new Error("Δεν έχει οριστεί κλειδί OpenRouter (Ρυθμίσεις → AI).");
  return decrypt(s.apiKeyEnc, AAD);
}

const headers = (key: string) => ({
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  "HTTP-Referer": APP_URL,
  "X-Title": "DGsmart BI",
});

async function orFetch<T>(path: string, key: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: headers(key), cache: "no-store", signal: AbortSignal.timeout(60_000) });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? text.slice(0, 200);
    throw new Error(`OpenRouter ${res.status}: ${msg}`);
  }
  return body as T;
}

export type KeyInfo = {
  label: string | null;
  usage: number; // USD spent with this key
  limit: number | null; // USD, null = unlimited
  limitRemaining: number | null;
  isFreeTier: boolean;
};

/** Validates a key (the given one, or the stored one) and returns its spend/limit. */
export async function checkKey(key?: string): Promise<KeyInfo> {
  const k = key ?? (await apiKey());
  const r = await orFetch<{ data: { label?: string; usage?: number; limit?: number | null; limit_remaining?: number | null; is_free_tier?: boolean } }>(
    "/key",
    k,
  );
  return {
    label: r.data.label ?? null,
    usage: Number(r.data.usage ?? 0),
    limit: r.data.limit ?? null,
    limitRemaining: r.data.limit_remaining ?? null,
    isFreeTier: !!r.data.is_free_tier,
  };
}

export type ModelInfo = { id: string; name: string; context: number; promptPerM: number; completionPerM: number };

let modelsCache: { at: number; models: ModelInfo[] } | null = null;

/** OpenRouter model catalog with prices per 1M tokens (cached 1h). */
export async function listModels(): Promise<ModelInfo[]> {
  if (modelsCache && Date.now() - modelsCache.at < 3_600_000) return modelsCache.models;
  const r = await fetch(`${API}/models`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`OpenRouter models ${r.status}`);
  const body = (await r.json()) as {
    data: { id: string; name: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }[];
  };
  const models = body.data
    .map((m) => ({
      id: m.id,
      name: m.name,
      context: m.context_length ?? 0,
      promptPerM: Number(m.pricing?.prompt ?? 0) * 1e6,
      completionPerM: Number(m.pricing?.completion ?? 0) * 1e6,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  modelsCache = { at: Date.now(), models };
  return models;
}

export type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string; name?: string; tool_call_id?: string };

type ChatResponse = {
  id: string;
  model: string;
  choices: { message: { role: string; content: string | null; tool_calls?: unknown[] }; finish_reason: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

/**
 * One chat completion on the platform key, metered to a tenant. Throws when AI is disabled.
 * The cost comes from OpenRouter's usage accounting; billed = cost × (1 + markup%).
 */
export async function chatCompletion(opts: {
  tenantId: string | null;
  userId?: string | null;
  feature: string;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
}) {
  const settings = await getAiSettings();
  if (!settings.enabled && opts.feature !== "test") throw new Error("Το AI είναι απενεργοποιημένο (Ρυθμίσεις → AI).");
  const key = await apiKey();
  const model = opts.model ?? settings.defaultModel;
  const markup = Number(settings.markupPercent);
  const started = Date.now();
  try {
    const r = await orFetch<ChatResponse>("/chat/completions", key, {
      method: "POST",
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        tools: opts.tools,
        usage: { include: true },
        user: opts.tenantId ?? undefined, // per-tenant abuse tracking on OpenRouter's side
      }),
    });
    const cost = Number(r.usage?.cost ?? 0);
    await prisma.aiUsage.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.userId ?? null,
        feature: opts.feature,
        model: r.model ?? model,
        generationId: r.id,
        promptTokens: r.usage?.prompt_tokens ?? 0,
        completionTokens: r.usage?.completion_tokens ?? 0,
        costUsd: round8(cost),
        markupPercent: markup,
        billedUsd: round8(cost * (1 + markup / 100)),
        latencyMs: Date.now() - started,
      },
    });
    return r;
  } catch (err) {
    await prisma.aiUsage.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.userId ?? null,
        feature: opts.feature,
        model,
        markupPercent: markup,
        latencyMs: Date.now() - started,
        ok: false,
        error: (err as Error).message.slice(0, 500),
      },
    });
    throw err;
  }
}

export type TenantUsageRow = {
  tenantId: string | null;
  tenantName: string;
  requests: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  billedUsd: number;
};

/** Usage per tenant in [from, to). Platform calls (tests) appear as "Πλατφόρμα". */
export async function usageByTenant(from: Date, to: Date): Promise<TenantUsageRow[]> {
  const groups = await prisma.aiUsage.groupBy({
    by: ["tenantId", "ok"],
    where: { createdAt: { gte: from, lt: to } },
    _count: { _all: true },
    _sum: { promptTokens: true, completionTokens: true, costUsd: true, billedUsd: true },
  });
  const ids = [...new Set(groups.map((g) => g.tenantId).filter((x): x is string => !!x))];
  const names = new Map((await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
  const rows = new Map<string, TenantUsageRow>();
  for (const g of groups) {
    const k = g.tenantId ?? "";
    const row =
      rows.get(k) ??
      ({
        tenantId: g.tenantId,
        tenantName: g.tenantId ? (names.get(g.tenantId) ?? "—") : "Πλατφόρμα (δοκιμές)",
        requests: 0,
        failed: 0,
        promptTokens: 0,
        completionTokens: 0,
        costUsd: 0,
        billedUsd: 0,
      } satisfies TenantUsageRow);
    row.requests += g._count._all;
    if (!g.ok) row.failed += g._count._all;
    row.promptTokens += g._sum.promptTokens ?? 0;
    row.completionTokens += g._sum.completionTokens ?? 0;
    row.costUsd += Number(g._sum.costUsd ?? 0);
    row.billedUsd += Number(g._sum.billedUsd ?? 0);
    rows.set(k, row);
  }
  return [...rows.values()].sort((a, b) => b.costUsd - a.costUsd);
}
