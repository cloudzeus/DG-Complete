-- CreateEnum
CREATE TYPE "SubscriptionPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "subscriptionAmount" DECIMAL(12,2),
ADD COLUMN     "subscriptionEndsAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionPeriod" "SubscriptionPeriod";

-- CreateTable
CREATE TABLE "email_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "apiKeyEnc" TEXT,
    "keyHint" TEXT,
    "domain" TEXT,
    "region" TEXT NOT NULL DEFAULT 'EU',
    "fromName" TEXT NOT NULL DEFAULT 'DGsmart BI',
    "fromEmail" TEXT,
    "replyTo" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderDays" INTEGER[] DEFAULT ARRAY[14, 3]::INTEGER[],
    "overdueDays" INTEGER[] DEFAULT ARRAY[1, 7]::INTEGER[],
    "bcc" TEXT,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_template" (
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_template_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "email_log" (
    "id" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "messageId" TEXT,
    "error" TEXT,
    "tenantId" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_log_dedupeKey_key" ON "email_log"("dedupeKey");

-- CreateIndex
CREATE INDEX "email_log_createdAt_idx" ON "email_log"("createdAt");

-- CreateIndex
CREATE INDEX "email_log_tenantId_createdAt_idx" ON "email_log"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
