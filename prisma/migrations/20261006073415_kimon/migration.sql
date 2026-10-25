-- CreateTable
CREATE TABLE "kimon_chat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kimon_chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kimon_message" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "artifacts" JSONB,
    "context" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kimon_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kimon_chat_userId_tenantId_updatedAt_idx" ON "kimon_chat"("userId", "tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "kimon_message_chatId_createdAt_idx" ON "kimon_message"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "kimon_chat" ADD CONSTRAINT "kimon_chat_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kimon_chat" ADD CONSTRAINT "kimon_chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kimon_message" ADD CONSTRAINT "kimon_message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "kimon_chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
