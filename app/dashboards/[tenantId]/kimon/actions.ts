"use server";

import { toView } from "@/lib/kimon/agent";
import type { KimonMessageView } from "@/lib/kimon/types";
import { prisma } from "@/lib/prisma";
import { can, requireUser } from "@/lib/rbac";

// Conversations with Κίμων are private: each user sees only their own, per tenant.

export type KimonChatSummary = { id: string; title: string; updatedAt: string };

async function owner(tenantId: string) {
  const user = await requireUser();
  if (!can(user, "tenant.dashboards.view", tenantId)) throw new Error("forbidden");
  return user;
}

export async function listKimonChats(tenantId: string): Promise<KimonChatSummary[]> {
  const user = await owner(tenantId);
  const chats = await prisma.kimonChat.findMany({
    where: { tenantId, userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });
  return chats.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() }));
}

export async function loadKimonChat(tenantId: string, chatId: string): Promise<KimonMessageView[] | null> {
  const user = await owner(tenantId);
  const chat = await prisma.kimonChat.findFirst({
    where: { id: chatId, tenantId, userId: user.id },
    select: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return chat ? chat.messages.map(toView) : null;
}

export async function deleteKimonChat(tenantId: string, chatId: string) {
  const user = await owner(tenantId);
  await prisma.kimonChat.deleteMany({ where: { id: chatId, tenantId, userId: user.id } });
}
