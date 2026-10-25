"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Maximize2, MessageSquarePlus } from "lucide-react";
import { listKimonChats, loadKimonChat, type KimonChatSummary } from "@/app/dashboards/[tenantId]/kimon/actions";
import { KimonAvatar, KimonChat } from "@/components/kimon/kimon-chat";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { KimonMessageView } from "@/lib/kimon/types";

// Κίμων on every dashboard: a floating button that opens him in a side panel. He knows which page
// and period the user is looking at; the conversation survives moving between dashboards.

export function KimonLauncher({ tenantId }: { tenantId: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<{ id: string | null; messages: KimonMessageView[]; key: number }>({ id: null, messages: [], key: 0 });
  const [history, setHistory] = useState<KimonChatSummary[] | null>(null);
  const [pending, start] = useTransition();

  if (pathname.endsWith("/kimon")) return null;

  const openChat = (id: string | null) =>
    id === null
      ? setChat((c) => ({ id: null, messages: [], key: c.key + 1 }))
      : start(async () => {
          const messages = await loadKimonChat(tenantId, id);
          if (messages) setChat((c) => ({ id, messages, key: c.key + 1 }));
        });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (chat.id) openChat(chat.id);
        }}
        className="fixed right-4 bottom-4 z-30 flex items-center gap-2 rounded-full border bg-background/95 py-1.5 pr-4 pl-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-xl sm:right-6 sm:bottom-6"
        aria-label="Ρωτήστε τον Κίμωνα"
      >
        <KimonAvatar className="size-9" />
        <span className="text-sm font-medium">Ρωτήστε τον Κίμωνα</span>
      </button>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          // The panel unmounts when closed: reopening shows the conversation as stored.
          if (o && chat.id) openChat(chat.id);
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="flex-row items-center gap-3 border-b px-4 py-3 pr-12">
            <KimonAvatar className="size-9" />
            <div className="min-w-0 flex-1">
              <SheetTitle>Κίμων</SheetTitle>
              <SheetDescription className="text-xs">Ο ψηφιακός σας σύμβουλος</SheetDescription>
            </div>
            <DropdownMenu onOpenChange={(o) => o && start(async () => setHistory(await listKimonChats(tenantId)))}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Προηγούμενες συνομιλίες">
                  <History className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
                <DropdownMenuLabel>Προηγούμενες συνομιλίες</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {history === null || pending ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Φόρτωση…</div>
                ) : history.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Καμία ακόμα.</div>
                ) : (
                  history.slice(0, 20).map((h) => (
                    <DropdownMenuItem key={h.id} onSelect={() => openChat(h.id)}>
                      <span className="truncate">{h.title}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Νέα συνομιλία" onClick={() => openChat(null)}>
              <MessageSquarePlus className="size-4" />
            </Button>
            <Button asChild variant="ghost" size="icon" className="size-9" aria-label="Άνοιγμα σε πλήρη σελίδα">
              <Link href={`/dashboards/${tenantId}/kimon${chat.id ? `?chat=${chat.id}` : ""}`} onClick={() => setOpen(false)}>
                <Maximize2 className="size-4" />
              </Link>
            </Button>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <KimonChat
              key={chat.key}
              compact
              tenantId={tenantId}
              chatId={chat.id}
              initialMessages={chat.messages}
              onChat={(c) => setChat((x) => ({ ...x, id: c.id }))}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
