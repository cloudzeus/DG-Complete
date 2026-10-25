import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { kimonCatalog } from "@/lib/kimon/catalog";
import { kimonSystemPrompt } from "@/lib/kimon/prompt";
import { KIMON_TOOLS, runTool, type ToolRun } from "@/lib/kimon/tools";
import type { KimonArtifact, KimonContext, KimonEvent, KimonMessageView } from "@/lib/kimon/types";
import { chatCompletion, type ChatMessage } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { tenantAccess } from "@/lib/tenant-services";

// One turn of a conversation with Κίμων: store the question, let the model query the data through
// the tools (several rounds), store the answer with its tables / charts / links. Progress is
// reported through `emit` so the UI can show what he is doing.

const MAX_ROUNDS = 8;
const HISTORY = 12;

export class KimonError extends Error {}

const athensNow = () =>
  new Intl.DateTimeFormat("el-GR", {
    timeZone: "Europe/Athens",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date()) +
  ` (ISO ${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date())})`;

export function toView(m: { id: string; role: string; content: string; artifacts: unknown; error: string | null; createdAt: Date }): KimonMessageView {
  return {
    id: m.id,
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
    artifacts: (Array.isArray(m.artifacts) ? m.artifacts : []) as KimonArtifact[],
    error: m.error,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Earlier turns as plain text; what was shown (tables, charts) is summarised, not replayed. */
function historyMessages(rows: { role: string; content: string; artifacts: unknown }[]): ChatMessage[] {
  return rows.map((m) => {
    if (m.role === "user") return { role: "user", content: m.content };
    const shown = ((Array.isArray(m.artifacts) ? m.artifacts : []) as KimonArtifact[])
      .map((a) => (a.type === "link" ? `σύνδεσμος «${a.label}»` : `${a.type === "table" ? "πίνακας" : "γράφημα"} «${a.title}»`))
      .join(", ");
    return { role: "assistant", content: `${m.content}${shown ? `\n\n[Εμφανίστηκαν: ${shown}]` : ""}` };
  });
}

export async function runKimon(opts: {
  tenant: { id: string; name: string };
  userId: string;
  chatId?: string;
  question: string;
  context?: KimonContext;
  emit: (e: KimonEvent) => void;
}) {
  const { tenant, userId, emit } = opts;

  const chat = opts.chatId
    ? await prisma.kimonChat.findFirst({ where: { id: opts.chatId, userId, tenantId: tenant.id } })
    : await prisma.kimonChat.create({
        data: { tenantId: tenant.id, userId, title: opts.question.replace(/\s+/g, " ").trim().slice(0, 80) },
      });
  if (!chat) throw new KimonError("Η συνομιλία δεν βρέθηκε.");
  emit({ type: "chat", chatId: chat.id, title: chat.title });

  const earlier = await prisma.kimonMessage.findMany({
    where: { chatId: chat.id, error: null },
    orderBy: { createdAt: "desc" },
    take: HISTORY,
    select: { role: true, content: true, artifacts: true },
  });
  await prisma.kimonMessage.create({
    data: { chatId: chat.id, role: "user", content: opts.question, context: (opts.context ?? undefined) as Prisma.InputJsonValue | undefined },
  });

  const artifacts: KimonArtifact[] = [];
  let answer = "";
  let error: string | null = null;
  try {
    emit({ type: "status", text: "Διαβάζω τι δεδομένα υπάρχουν…" });
    const catalog = await kimonCatalog(tenant.id);
    const run: ToolRun = {
      tenantId: tenant.id,
      pages: (await tenantAccess(tenant.id)).pages,
      catalog,
      context: opts.context,
      results: new Map(),
      artifacts,
      status: (text) => emit({ type: "status", text }),
      artifact: (artifact) => emit({ type: "artifact", artifact }),
    };
    const messages: ChatMessage[] = [
      { role: "system", content: kimonSystemPrompt({ tenantName: tenant.name, catalog: catalog.text, context: opts.context, today: athensNow() }) },
      ...historyMessages(earlier.reverse()),
      { role: "user", content: opts.question },
    ];

    for (let round = 0; round < MAX_ROUNDS && !answer; round++) {
      emit({ type: "status", text: round === 0 ? "Σκέφτομαι…" : "Αναλύω τα αποτελέσματα…" });
      const last = round === MAX_ROUNDS - 1;
      if (last) messages.push({ role: "user", content: "Δώσε τώρα την τελική απάντηση με όσα στοιχεία έχεις." });
      const r = await chatCompletion({
        tenantId: tenant.id,
        userId,
        feature: "kimon",
        messages,
        tools: last ? undefined : KIMON_TOOLS,
        temperature: 0.2,
        maxTokens: 2500,
      });
      const msg = r.choices[0]?.message;
      if (!msg) throw new KimonError("Κενή απάντηση από το μοντέλο.");
      if (msg.tool_calls?.length) {
        messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
        for (const call of msg.tool_calls) {
          const result = await runTool(call.function.name, call.function.arguments, run);
          messages.push({ role: "tool", tool_call_id: call.id, content: result });
        }
        continue;
      }
      answer = (msg.content ?? "").trim();
    }
    if (!answer) throw new KimonError("Δεν κατάφερα να ολοκληρώσω την απάντηση.");
  } catch (err) {
    error = (err as Error).message.slice(0, 500);
  }

  const saved = await prisma.kimonMessage.create({
    data: {
      chatId: chat.id,
      role: "assistant",
      content: answer || "Δεν μπόρεσα να απαντήσω αυτή τη φορά.",
      artifacts: artifacts as unknown as Prisma.InputJsonValue,
      error,
    },
  });
  await prisma.kimonChat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
  if (error) emit({ type: "error", error });
  emit({ type: "answer", message: toView(saved) });
}
