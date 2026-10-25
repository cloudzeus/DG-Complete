"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { chatCompletion, checkKey, getAiSettings, listModels, sealApiKey, type KeyInfo } from "@/lib/openrouter";

export type AiFormState = {
  ok?: boolean;
  message?: string;
  errors?: Partial<Record<"apiKey" | "defaultModel" | "markupPercent", string>>;
  key?: KeyInfo;
};

const schema = z.object({
  apiKey: z.string().trim().max(200).optional(),
  defaultModel: z.string().trim().min(3, "Υποχρεωτικό").max(120).regex(/^[\w.\-/:]+$/, "Μη έγκυρο μοντέλο"),
  markupPercent: z.coerce.number({ message: "Αριθμός" }).min(0, "≥ 0").max(1000, "≤ 1000"),
  enabled: z.boolean(),
});

export async function saveAiSettings(_prev: AiFormState, fd: FormData): Promise<AiFormState> {
  const user = await requirePermission("platform.settings.manage");
  const parsed = schema.safeParse({
    apiKey: fd.get("apiKey") || undefined,
    defaultModel: fd.get("defaultModel"),
    markupPercent: fd.get("markupPercent"),
    enabled: fd.get("enabled") === "on",
  });
  if (!parsed.success) {
    const errors: AiFormState["errors"] = {};
    for (const i of parsed.error.issues) errors[i.path[0] as keyof NonNullable<AiFormState["errors"]>] ??= i.message;
    return { errors };
  }
  const v = parsed.data;
  const current = await getAiSettings();

  // A new key is accepted only if OpenRouter recognises it.
  let key: KeyInfo | undefined;
  if (v.apiKey) {
    try {
      key = await checkKey(v.apiKey);
    } catch (err) {
      return { errors: { apiKey: (err as Error).message.slice(0, 200) } };
    }
  }
  if (v.enabled && !v.apiKey && !current.apiKeyEnc) return { errors: { apiKey: "Χρειάζεται κλειδί για να ενεργοποιηθεί το AI." } };

  try {
    const models = await listModels();
    if (!models.some((m) => m.id === v.defaultModel)) return { errors: { defaultModel: "Το μοντέλο δεν υπάρχει στο OpenRouter." } };
  } catch {
    // Catalog unreachable — accept the model as typed.
  }

  await prisma.aiSettings.update({
    where: { id: "default" },
    data: {
      defaultModel: v.defaultModel,
      markupPercent: v.markupPercent,
      enabled: v.enabled,
      ...(v.apiKey
        ? { apiKeyEnc: sealApiKey(v.apiKey), keyHint: v.apiKey.slice(-4), lastTestedAt: new Date(), lastTestOk: true, lastTestError: null }
        : {}),
    },
  });
  await audit({
    actorId: user.id,
    action: "ai.settings.update",
    entity: "AiSettings",
    entityId: "default",
    meta: { model: v.defaultModel, markupPercent: v.markupPercent, enabled: v.enabled, keyChanged: !!v.apiKey },
  });
  revalidatePath("/admin/settings/ai");
  return { ok: true, message: "Οι ρυθμίσεις AI αποθηκεύτηκαν.", key };
}

export type AiTestResult =
  | { ok: true; key: KeyInfo; reply: string; model: string; costUsd: number; latencyMs: number }
  | { ok: false; message: string };

/** Checks the stored key and runs one tiny completion (metered as a platform test). */
export async function testAi(): Promise<AiTestResult> {
  const user = await requirePermission("platform.settings.manage");
  const started = Date.now();
  try {
    const key = await checkKey();
    const r = await chatCompletion({
      tenantId: null,
      userId: user.id,
      feature: "test",
      maxTokens: 20,
      messages: [{ role: "user", content: "Απάντησε μόνο με τη λέξη: Έτοιμο" }],
    });
    await prisma.aiSettings.update({ where: { id: "default" }, data: { lastTestedAt: new Date(), lastTestOk: true, lastTestError: null } });
    revalidatePath("/admin/settings/ai");
    return {
      ok: true,
      key,
      reply: r.choices[0]?.message.content?.trim() ?? "",
      model: r.model,
      costUsd: Number(r.usage?.cost ?? 0),
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    const message = (err as Error).message.slice(0, 300);
    await prisma.aiSettings.update({ where: { id: "default" }, data: { lastTestedAt: new Date(), lastTestOk: false, lastTestError: message } });
    revalidatePath("/admin/settings/ai");
    return { ok: false, message };
  }
}

export async function removeAiKey(): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("platform.settings.manage");
  await prisma.aiSettings.update({ where: { id: "default" }, data: { apiKeyEnc: null, keyHint: null, enabled: false } });
  await audit({ actorId: user.id, action: "ai.key.remove", entity: "AiSettings", entityId: "default" });
  revalidatePath("/admin/settings/ai");
  return { ok: true, message: "Το κλειδί αφαιρέθηκε και το AI απενεργοποιήθηκε." };
}

const tokenSettingsSchema = z.object({
  enforceTokens: z.boolean(),
  alertEmail: z.union([z.literal(""), z.email("Μη έγκυρο email")]),
  alertBelowUsd: z.number().min(0).max(100_000),
  packages: z
    .array(z.object({ tokens: z.number().int().min(1000).max(2_000_000_000), priceEur: z.number().min(0).max(1_000_000) }))
    .max(10, "Έως 10 πακέτα"),
});

/** AI tokens: charging on/off, the token packs offered to tenants, the low-credit alert. */
export async function saveTokenSettings(input: z.input<typeof tokenSettingsSchema>): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("platform.settings.manage");
  const parsed = tokenSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const v = parsed.data;
  await prisma.aiSettings.update({
    where: { id: "default" },
    data: {
      enforceTokens: v.enforceTokens,
      alertEmail: v.alertEmail || null,
      alertBelowUsd: v.alertBelowUsd.toFixed(2),
      tokenPackages: [...v.packages].sort((a, b) => a.tokens - b.tokens),
    },
  });
  await audit({ actorId: user.id, action: "ai.tokens.settings", entity: "AiSettings", entityId: "default", meta: v });
  revalidatePath("/admin/settings/ai");
  return { ok: true, message: "Αποθηκεύτηκε." };
}
