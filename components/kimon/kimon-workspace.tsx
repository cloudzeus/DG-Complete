"use client";

import { useState, useTransition } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteKimonChat, loadKimonChat, type KimonChatSummary } from "@/app/dashboards/[tenantId]/kimon/actions";
import { KimonChat } from "@/components/kimon/kimon-chat";
import { Button } from "@/components/ui/button";
import type { KimonMessageView } from "@/lib/kimon/types";
import { cn } from "@/lib/utils";

// Full-page Κίμων: the user's conversations on the left, the open one on the right. The open
// conversation is kept in ?chat= (history API, so a running answer is never interrupted).

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("el-GR", { day: "numeric", month: "short" });
};

export function KimonWorkspace({
  tenantId,
  chats: initialChats,
  chatId: initialChatId,
  messages: initialMessages,
}: {
  tenantId: string;
  chats: KimonChatSummary[];
  chatId: string | null;
  messages: KimonMessageView[];
}) {
  const [chats, setChats] = useState(initialChats);
  const [open, setOpen] = useState<{ id: string | null; messages: KimonMessageView[]; key: number }>({
    id: initialChatId,
    messages: initialMessages,
    key: 0,
  });
  const [pending, start] = useTransition();

  const setUrl = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("chat", id);
    else url.searchParams.delete("chat");
    window.history.replaceState(null, "", url);
  };

  function openChat(id: string | null) {
    if (id === null) {
      setOpen((o) => ({ id: null, messages: [], key: o.key + 1 }));
      setUrl(null);
      return;
    }
    start(async () => {
      const messages = await loadKimonChat(tenantId, id);
      if (!messages) {
        toast.error("Η συνομιλία δεν βρέθηκε.");
        return;
      }
      setOpen((o) => ({ id, messages, key: o.key + 1 }));
      setUrl(id);
    });
  }

  function remove(id: string) {
    start(async () => {
      await deleteKimonChat(tenantId, id);
      setChats((c) => c.filter((x) => x.id !== id));
      if (open.id === id) openChat(null);
    });
  }

  return (
    <div data-kimon-page className="grid h-[calc(100svh-5.5rem)] min-h-[32rem] grid-cols-1 gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col rounded-xl border bg-card lg:flex">
        <div className="border-b p-3">
          <Button type="button" variant="outline" className="w-full justify-start" onClick={() => openChat(null)}>
            <MessageSquarePlus className="size-4" />
            Νέα συνομιλία
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {chats.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">Δεν υπάρχουν ακόμα συνομιλίες.</p>}
          {chats.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-muted",
                open.id === c.id && "bg-dg-red-50/70 text-dg-red-700 dark:bg-white/5",
              )}
            >
              <button type="button" disabled={pending} onClick={() => openChat(c.id)} className="min-w-0 flex-1 px-2 py-2 text-left">
                <div className="truncate text-sm">{c.title}</div>
                <div className="text-2xs text-muted-foreground">{when(c.updatedAt)}</div>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="Διαγραφή συνομιλίας"
                disabled={pending}
                onClick={() => remove(c.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col rounded-xl border bg-card px-4 pb-4 sm:px-6">
        <div className="flex items-center justify-between gap-2 border-b py-3">
          <h1 className="truncate text-base font-semibold">{chats.find((c) => c.id === open.id)?.title ?? "Νέα συνομιλία"}</h1>
          <Button type="button" variant="ghost" size="sm" className="lg:hidden" onClick={() => openChat(null)}>
            <MessageSquarePlus className="size-4" />
            Νέα
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <KimonChat
            key={open.key}
            tenantId={tenantId}
            chatId={open.id}
            initialMessages={open.messages}
            onChat={(c) => {
              setChats((list) => [{ id: c.id, title: c.title, updatedAt: new Date().toISOString() }, ...list]);
              setOpen((o) => ({ ...o, id: c.id }));
              setUrl(c.id);
            }}
          />
        </div>
      </section>
    </div>
  );
}
