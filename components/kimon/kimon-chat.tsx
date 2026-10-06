"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUp, Loader2 } from "lucide-react";
import { KimonArtifacts } from "@/components/kimon/kimon-artifacts";
import { KimonText } from "@/components/kimon/kimon-text";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { KimonArtifact, KimonContext, KimonEvent, KimonMessageView } from "@/lib/kimon/types";
import { cn } from "@/lib/utils";

// The conversation with Κίμων — used by the full page and by the side panel on every dashboard.

const SUGGESTIONS = [
  "Πώς πάνε οι πωλήσεις φέτος σε σχέση με πέρσι;",
  "Ποιοι τακτικοί πελάτες σταμάτησαν να αγοράζουν και πόσο τζίρο χάνουμε;",
  "Τι πρέπει να παραγγείλω αυτή την εβδομάδα;",
  "Ποια προϊόντα μου αφήνουν το μεγαλύτερο κέρδος;",
  "Ποιοι πελάτες αργούν να πληρώσουν;",
  "Πώς θα κινηθεί το ταμείο τις επόμενες 4 εβδομάδες;",
];

/** The dashboard page and period the user is looking at, read at send time. */
function currentContext(): KimonContext {
  const segments = window.location.pathname.split("/").filter(Boolean); // dashboards / tenant / page
  const sp = new URLSearchParams(window.location.search);
  return {
    page: segments[2] ?? "",
    period: sp.get("period") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  };
}

export function KimonAvatar({ className }: { className?: string }) {
  return <Image src="/kimon.svg" alt="Κίμων" width={32} height={32} className={cn("size-8 shrink-0 rounded-full bg-white object-cover ring-1 ring-border", className)} />;
}

export function KimonChat({
  tenantId,
  chatId: initialChatId,
  initialMessages = [],
  compact = false,
  onChat,
}: {
  tenantId: string;
  chatId?: string | null;
  initialMessages?: KimonMessageView[];
  compact?: boolean;
  /** A new conversation was created (id + title) — the page updates its list / URL. */
  onChat?: (chat: { id: string; title: string }) => void;
}) {
  const [chatId, setChatId] = useState(initialChatId ?? null);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [live, setLive] = useState<KimonArtifact[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, live, status]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setStatus("Σκέφτομαι…");
    setLive([]);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: q, artifacts: [], createdAt: new Date().toISOString() }]);
    const fail = (error: string) =>
      setMessages((m) => [
        ...m,
        { id: `err-${Date.now()}`, role: "assistant", content: "Δεν μπόρεσα να απαντήσω αυτή τη φορά.", artifacts: [], error, createdAt: new Date().toISOString() },
      ]);
    try {
      const res = await fetch("/api/kimon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, chatId: chatId ?? undefined, question: q, context: currentContext() }),
      });
      if (!res.ok || !res.body) {
        fail((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answered = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as KimonEvent;
          if (e.type === "chat") {
            if (!chatId) onChat?.({ id: e.chatId, title: e.title });
            setChatId(e.chatId);
          } else if (e.type === "status") setStatus(e.text);
          else if (e.type === "artifact") setLive((a) => [...a, e.artifact]);
          else if (e.type === "answer") {
            answered = true;
            setLive([]);
            setMessages((m) => [...m, e.message]);
          } else if (e.type === "error" && !answered) setStatus("");
        }
      }
      if (!answered) fail("Η σύνδεση διακόπηκε πριν ολοκληρωθεί η απάντηση.");
    } catch (err) {
      fail((err as Error).message);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto", compact ? "px-4 py-4" : "px-1 py-2")}>
        {messages.length === 0 && !busy && (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3">
              <KimonAvatar className="size-10" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">Γεια σας, είμαι ο Κίμων.</p>
                <p className="text-muted-foreground">
                  Ρωτήστε με για πωλήσεις, κερδοφορία, πελάτες, εισπράξεις, ταμείο, αποθήκη ή προμηθευτές. Απαντώ με τα δεδομένα της εταιρείας
                  σας, με πίνακες, γραφήματα και προτάσεις.
                </p>
              </div>
            </div>
            <div className={cn("grid gap-2", !compact && "sm:grid-cols-2")}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="min-h-11 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-dg-red-200 hover:bg-dg-red-50/50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">{m.content}</div>
            </div>
          ) : (
            <div key={m.id} className="flex items-start gap-3">
              <KimonAvatar />
              <div className="min-w-0 flex-1 space-y-3">
                <KimonText text={m.content} />
                {m.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{m.error}</p>}
                <KimonArtifacts artifacts={m.artifacts} tenantId={tenantId} />
              </div>
            </div>
          ),
        )}

        {busy && (
          <div className="flex items-start gap-3">
            <KimonAvatar />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>{status || "Σκέφτομαι…"}</span>
              </div>
              <KimonArtifacts artifacts={live} tenantId={tenantId} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className={cn("border-t bg-background/80", compact ? "p-3" : "pt-3")}
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ρωτήστε τον Κίμωνα…"
            rows={2}
            maxLength={4000}
            className="max-h-40 min-h-12 resize-none pr-12"
            disabled={busy}
          />
          <Button type="submit" size="icon" className="absolute right-2 bottom-2 size-9" disabled={busy || !input.trim()} aria-label="Αποστολή">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </Button>
        </div>
        <p className="mt-1.5 text-2xs text-muted-foreground">Ο Κίμων απαντά από τα δεδομένα σας· ελέγχετε πάντα τα σημαντικά πριν αποφασίσετε.</p>
      </form>
    </div>
  );
}
