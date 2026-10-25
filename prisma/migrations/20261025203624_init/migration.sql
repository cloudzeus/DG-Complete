-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('TENANT_ADMIN', 'TENANT_USER');

-- CreateEnum
CREATE TYPE "ConnectionTestStatus" AS ENUM ('UNTESTED', 'OK', 'FAILED');

-- CreateEnum
CREATE TYPE "SoftOneScope" AS ENUM ('DGSOFT', 'TENANT');

-- CreateEnum
CREATE TYPE "SyncKind" AS ENUM ('DGSOFT_CUSTOMERS', 'TABLE');

-- CreateEnum
CREATE TYPE "SyncDestination" AS ENUM ('APP', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "SyncJobType" AS ENUM ('CUSTOMERS', 'TABLE');

-- CreateEnum
CREATE TYPE "SyncMode" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'BANK_TRANSFER', 'CASH', 'VIVA');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "S1PostStatus" AS ENUM ('NOT_POSTED', 'POSTING', 'POSTED', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "afm" TEXT,
    "s1Trdr" INTEGER,
    "s1Code" TEXT,
    "email" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'PENDING',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subscriptionPeriod" "SubscriptionPeriod",
    "subscriptionAmount" DECIMAL(12,2),
    "subscriptionEndsAt" TIMESTAMP(3),
    "planId" TEXT,
    "aiTokenBalance" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL DEFAULT 'TENANT_USER',
    "weeklyReport" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role","permission")
);

-- CreateTable
CREATE TABLE "softone_connection" (
    "id" TEXT NOT NULL,
    "scope" "SoftOneScope" NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "credentialsEnc" TEXT NOT NULL,
    "sessionEnc" TEXT,
    "sessionDate" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" "ConnectionTestStatus" NOT NULL DEFAULT 'UNTESTED',
    "lastTestError" TEXT,
    "capabilities" JSONB,
    "detectedAt" TIMESTAMP(3),
    "invoiceSeries" INTEGER,
    "serviceMtrl" INTEGER,
    "paymentCode" INTEGER,
    "vatRate" DECIMAL(5,2),
    "pricesIncludeVat" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "softone_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "s1_customer" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "trdr" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "afm" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "s1UpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "s1_customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_job" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SyncJobType" NOT NULL DEFAULT 'TABLE',
    "table" TEXT NOT NULL,
    "fields" TEXT NOT NULL,
    "keyField" TEXT NOT NULL,
    "updField" TEXT,
    "filter" TEXT,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "destination" "SyncDestination" NOT NULL DEFAULT 'APP',
    "targetTable" TEXT,
    "columns" JSONB,
    "dateField" TEXT,
    "windowDays" INTEGER,
    "historyFrom" TIMESTAMP(3),
    "options" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" "SyncStatus",
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "s1_record" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "s1UpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "s1_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_run" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kind" "SyncKind" NOT NULL,
    "mode" "SyncMode" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL,
    "triggeredById" TEXT,
    "watermarkFrom" TIMESTAMP(3),
    "watermarkTo" TIMESTAMP(3),
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsUpserted" INTEGER NOT NULL DEFAULT 0,
    "tenantsUpdated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "jobId" TEXT,

    CONSTRAINT "sync_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "apiKeyEnc" TEXT,
    "keyHint" TEXT,
    "defaultModel" TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-5.5',
    "markupPercent" DECIMAL(6,2) NOT NULL DEFAULT 30,
    "tokenPackages" JSONB NOT NULL DEFAULT '[]',
    "enforceTokens" BOOLEAN NOT NULL DEFAULT false,
    "alertEmail" TEXT DEFAULT 'gkozyris@dgsmart.gr',
    "alertBelowUsd" DECIMAL(10,2) NOT NULL DEFAULT 20,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "generationId" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(14,8) NOT NULL DEFAULT 0,
    "markupPercent" DECIMAL(6,2) NOT NULL,
    "billedUsd" DECIMAL(14,8) NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "services" TEXT[],
    "period" "SubscriptionPeriod" NOT NULL DEFAULT 'YEARLY',
    "price" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "aiTokensMonthly" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "afm_lookup_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "url" TEXT NOT NULL DEFAULT 'https://vat.wwa.gr/afm2info',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "batchSize" INTEGER NOT NULL DEFAULT 1000,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "afm_lookup_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "afm_registry" (
    "afm" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "legal" TEXT,
    "active" BOOLEAN,
    "registered" TEXT,
    "mainKad" TEXT,
    "mainKadDescr" TEXT,
    "kads" JSONB,
    "found" BOOLEAN NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "afm_registry_pkey" PRIMARY KEY ("afm")
);

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
    "webhookKeyEnc" TEXT,
    "webhookKeyHint" TEXT,
    "trackOpens" BOOLEAN NOT NULL DEFAULT true,
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
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "failedAt" TIMESTAMP(3),
    "failReason" TEXT,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "description" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PAID',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerRef" TEXT,
    "s1Status" "S1PostStatus" NOT NULL DEFAULT 'NOT_POSTED',
    "s1Findoc" INTEGER,
    "s1Fincode" TEXT,
    "s1Error" TEXT,
    "s1PostedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "tenantId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_token_ledger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "feature" TEXT,
    "note" TEXT,
    "key" TEXT,
    "aiUsageId" TEXT,
    "requestId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_token_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_token_request" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "priceEur" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_token_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_s1Trdr_key" ON "tenant"("s1Trdr");

-- CreateIndex
CREATE INDEX "membership_tenantId_idx" ON "membership"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_userId_tenantId_key" ON "membership"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "softone_connection_scope_idx" ON "softone_connection"("scope");

-- CreateIndex
CREATE INDEX "softone_connection_tenantId_idx" ON "softone_connection"("tenantId");

-- CreateIndex
CREATE INDEX "s1_customer_afm_idx" ON "s1_customer"("afm");

-- CreateIndex
CREATE INDEX "s1_customer_name_idx" ON "s1_customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "s1_customer_connectionId_trdr_key" ON "s1_customer"("connectionId", "trdr");

-- CreateIndex
CREATE INDEX "sync_job_enabled_nextRunAt_idx" ON "sync_job"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "sync_job_connectionId_name_key" ON "sync_job"("connectionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "s1_record_jobId_key_key" ON "s1_record"("jobId", "key");

-- CreateIndex
CREATE INDEX "sync_run_connectionId_kind_startedAt_idx" ON "sync_run"("connectionId", "kind", "startedAt");

-- CreateIndex
CREATE INDEX "ai_usage_tenantId_createdAt_idx" ON "ai_usage"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_createdAt_idx" ON "ai_usage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_hash_key" ON "api_key"("hash");

-- CreateIndex
CREATE INDEX "api_key_tenantId_idx" ON "api_key"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "email_log_dedupeKey_key" ON "email_log"("dedupeKey");

-- CreateIndex
CREATE INDEX "email_log_createdAt_idx" ON "email_log"("createdAt");

-- CreateIndex
CREATE INDEX "email_log_tenantId_createdAt_idx" ON "email_log"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "email_log_messageId_idx" ON "email_log"("messageId");

-- CreateIndex
CREATE INDEX "email_event_logId_idx" ON "email_event"("logId");

-- CreateIndex
CREATE INDEX "email_event_event_at_idx" ON "email_event"("event", "at");

-- CreateIndex
CREATE INDEX "email_event_recipient_idx" ON "email_event"("recipient");

-- CreateIndex
CREATE UNIQUE INDEX "payment_providerRef_key" ON "payment"("providerRef");

-- CreateIndex
CREATE INDEX "payment_tenantId_paidAt_idx" ON "payment"("tenantId", "paidAt");

-- CreateIndex
CREATE INDEX "payment_s1Status_idx" ON "payment"("s1Status");

-- CreateIndex
CREATE INDEX "audit_log_tenantId_createdAt_idx" ON "audit_log"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_entity_entityId_idx" ON "audit_log"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_token_ledger_key_key" ON "ai_token_ledger"("key");

-- CreateIndex
CREATE INDEX "ai_token_ledger_tenantId_createdAt_idx" ON "ai_token_ledger"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_token_request_status_createdAt_idx" ON "ai_token_request"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ai_token_request_tenantId_createdAt_idx" ON "ai_token_request"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "softone_connection" ADD CONSTRAINT "softone_connection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "s1_customer" ADD CONSTRAINT "s1_customer_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "softone_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_job" ADD CONSTRAINT "sync_job_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "softone_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "s1_record" ADD CONSTRAINT "s1_record_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "sync_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "softone_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "sync_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_event" ADD CONSTRAINT "email_event_logId_fkey" FOREIGN KEY ("logId") REFERENCES "email_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_suppression" ADD CONSTRAINT "email_suppression_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_token_ledger" ADD CONSTRAINT "ai_token_ledger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_token_request" ADD CONSTRAINT "ai_token_request_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: one RUNNING sync run per connection+kind and per job (not expressible in Prisma).
CREATE UNIQUE INDEX "sync_run_one_running" ON "sync_run" ("connectionId", "kind") WHERE "status" = 'RUNNING';
CREATE UNIQUE INDEX "sync_run_one_running_job" ON "sync_run" ("jobId") WHERE "status" = 'RUNNING' AND "jobId" IS NOT NULL;
