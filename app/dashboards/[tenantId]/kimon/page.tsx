import type { Metadata } from "next";
import { KimonWorkspace } from "@/components/kimon/kimon-workspace";
import { requireDashboardTenant } from "@/lib/dashboards";
import { listKimonChats, loadKimonChat } from "./actions";

export const metadata: Metadata = { title: "Κίμων" };

export default async function KimonPage({ params, searchParams }: PageProps<"/dashboards/[tenantId]/kimon">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "kimon");
  const sp = await searchParams;
  const chatId = typeof sp.chat === "string" ? sp.chat : null;
  const [chats, messages] = await Promise.all([listKimonChats(tenantId), chatId ? loadKimonChat(tenantId, chatId) : null]);
  return <KimonWorkspace tenantId={tenantId} chats={chats} chatId={messages ? chatId : null} messages={messages ?? []} />;
}
