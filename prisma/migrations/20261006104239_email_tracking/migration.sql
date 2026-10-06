-- AlterTable
ALTER TABLE "email_log" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "failReason" TEXT,
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "lastOpenedAt" TIMESTAMP(3),
ADD COLUMN     "openCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "email_settings" ADD COLUMN     "trackOpens" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "webhookKeyEnc" TEXT,
ADD COLUMN     "webhookKeyHint" TEXT;

-- CreateTable
CREATE TABLE "email_event" (
    "id" TEXT NOT NULL,
    "logId" TEXT,
    "event" TEXT NOT NULL,
    "severity" TEXT,
    "recipient" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "client" TEXT,
    "country" TEXT,
    "city" TEXT,
    "url" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_suppression" (
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "template" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_suppression_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE INDEX "email_event_logId_idx" ON "email_event"("logId");

-- CreateIndex
CREATE INDEX "email_event_event_at_idx" ON "email_event"("event", "at");

-- CreateIndex
CREATE INDEX "email_event_recipient_idx" ON "email_event"("recipient");

-- CreateIndex
CREATE INDEX "email_log_messageId_idx" ON "email_log"("messageId");

-- AddForeignKey
ALTER TABLE "email_event" ADD CONSTRAINT "email_event_logId_fkey" FOREIGN KEY ("logId") REFERENCES "email_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_suppression" ADD CONSTRAINT "email_suppression_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
