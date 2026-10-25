-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('USERNAME_PASSWORD', 'USERNAME_PASSWORD_TOTP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RecordingSource" AS ENUM ('EXTENSION', 'IMPORT');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('RECORDING', 'FINISHED', 'VERIFIED', 'COMPILED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "WorkflowVersionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExecutionMode" AS ENUM ('SYNC', 'ASYNC');

-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('API', 'UI', 'CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRY_SCHEDULED', 'NEEDS_ATTENTION', 'HELD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RunTrigger" AS ENUM ('API', 'UI_TEST', 'UI_MANUAL', 'JOB', 'RETRY', 'HEALTH');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('SCREENSHOT_FULL', 'SCREENSHOT_VIEWPORT', 'SCREENSHOT_ELEMENT', 'DOM_SNAPSHOT', 'CONSOLE_LOG', 'NETWORK_HAR', 'PLAYWRIGHT_TRACE', 'DOWNLOAD', 'RECORDING_THUMB', 'STEP_THUMB');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'GAVE_UP');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TenantRole" ADD VALUE 'TENANT_DESIGNER';
ALTER TYPE "TenantRole" ADD VALUE 'TENANT_OPERATOR';

-- AlterTable
ALTER TABLE "api_key" ADD COLUMN     "collectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "ipAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "rateLimitRpm" INTEGER NOT NULL DEFAULT 600,
ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
ADD COLUMN     "periodFrom" TIMESTAMP(3),
ADD COLUMN     "periodTo" TIMESTAMP(3),
ADD COLUMN     "runs" INTEGER,
ADD COLUMN     "s1CheckedAt" TIMESTAMP(3),
ADD COLUMN     "s1OpenAmount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "plan" ADD COLUMN     "aiMarkupPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "artifactRetentionDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "freeTestRunsDaily" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "logRetentionDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "maxConcurrentRuns" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "maxFailedRunsDaily" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "maxWorkflows" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "overageEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "overagePricePerRun" DECIMAL(10,4),
ADD COLUMN     "runsMonthly" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "runBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settings" JSONB;

-- CreateTable
CREATE TABLE "target_system" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "allowedOrigins" TEXT[],
    "description" TEXT,
    "loginWorkflowId" TEXT,
    "sessionTtlSec" INTEGER NOT NULL DEFAULT 1800,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 2,
    "minDelayMs" INTEGER NOT NULL DEFAULT 0,
    "errorDetectors" JSONB NOT NULL DEFAULT '[]',
    "browserOptions" JSONB NOT NULL DEFAULT '{}',
    "automationConsentAt" TIMESTAMP(3),
    "automationConsentBy" TEXT,
    "healthWorkflowId" TEXT,
    "healthCredentialRef" TEXT,
    "healthSchedule" TEXT,
    "ownerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_system_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetSystemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "externalRef" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorizationRef" TEXT,
    "authorizationExpiresAt" TIMESTAMP(3),
    "maxSessions" INTEGER NOT NULL DEFAULT 1,
    "payloadEnc" TEXT NOT NULL,
    "usernameHint" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_session" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetSystemId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "storageStateEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "browser_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetSystemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "RecordingSource" NOT NULL DEFAULT 'EXTENSION',
    "status" "RecordingStatus" NOT NULL DEFAULT 'RECORDING',
    "events" JSONB NOT NULL DEFAULT '[]',
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "startUrl" TEXT,
    "browserInfo" JSONB,
    "createdById" TEXT NOT NULL,
    "workflowId" TEXT,
    "completion" JSONB,
    "replays" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetSystemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "isLoginFlow" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "intent" TEXT,
    "resourceSlug" TEXT,
    "latestVersionNo" INTEGER NOT NULL DEFAULT 0,
    "publishedVersionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_version" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "status" "WorkflowVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "checksum" TEXT,
    "dslVersion" INTEGER NOT NULL DEFAULT 1,
    "changelog" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "lastTestRunId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "method_collection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "method_collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "method" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "workflowVersionId" TEXT NOT NULL,
    "credentialId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "defaultMode" "ExecutionMode" NOT NULL DEFAULT 'ASYNC',
    "syncTimeoutSec" INTEGER NOT NULL DEFAULT 60,
    "runTimeoutSec" INTEGER NOT NULL DEFAULT 300,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "retryBackoffSec" INTEGER NOT NULL DEFAULT 30,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "screenshotPolicy" TEXT NOT NULL DEFAULT 'ON_ERROR',
    "traceOnError" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "pausedAt" TIMESTAMP(3),
    "pausedReason" TEXT,
    "pausePolicy" TEXT NOT NULL DEFAULT 'QUEUE',
    "heldMaxHours" INTEGER NOT NULL DEFAULT 24,
    "httpMethod" TEXT NOT NULL DEFAULT 'POST',
    "resource" TEXT,
    "action" TEXT,
    "keyParams" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "optionValidation" TEXT NOT NULL DEFAULT 'warn',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "method_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "source" "JobSource" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "name" TEXT,
    "idempotencyKey" TEXT,
    "callbackUrl" TEXT,
    "totalItems" INTEGER NOT NULL,
    "queuedCount" INTEGER NOT NULL DEFAULT 0,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledCount" INTEGER NOT NULL DEFAULT 0,
    "sourceFilePath" TEXT,
    "columnMapping" JSONB,
    "mappingId" TEXT,
    "mappingVersion" INTEGER,
    "options" JSONB,
    "createdByUserId" TEXT,
    "apiKeyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "methodId" TEXT,
    "workflowVersionId" TEXT NOT NULL,
    "jobId" TEXT,
    "itemIndex" INTEGER,
    "externalRef" TEXT,
    "trigger" "RunTrigger" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "inputEnc" TEXT NOT NULL,
    "inputPreview" JSONB NOT NULL,
    "output" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "errorStepId" TEXT,
    "targetMessage" TEXT,
    "mayHaveCommitted" BOOLEAN NOT NULL DEFAULT false,
    "billedUnits" INTEGER NOT NULL DEFAULT 0,
    "workerId" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "browserMs" INTEGER,
    "callbackUrl" TEXT,
    "apiKeyId" TEXT,
    "createdByUserId" TEXT,
    "retryOfRunId" TEXT,

    CONSTRAINT "run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_step" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "locatorUsed" JSONB,
    "valuePreview" TEXT,
    "pageUrl" TEXT,
    "message" TEXT,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "run_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_artifact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "runStepId" TEXT,
    "kind" "ArtifactKind" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "meta" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_log" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" "LogLevel" NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,

    CONSTRAINT "run_log_pkey" PRIMARY KEY ("id","ts")
);

-- CreateTable
CREATE TABLE "webhook_endpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "events" TEXT[],
    "secretEnc" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "endpointId" TEXT,
    "adHocUrl" TEXT,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_credit_pack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "runs" INTEGER NOT NULL,
    "priceEur" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "run_credit_pack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_credit_ledger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "runId" TEXT,
    "requestId" TEXT,
    "paymentId" TEXT,
    "note" TEXT,
    "key" TEXT,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_credit_request" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packId" TEXT,
    "runs" INTEGER NOT NULL,
    "priceEur" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_credit_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_daily" (
    "tenantId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "billedUnits" INTEGER NOT NULL DEFAULT 0,
    "browserSecs" INTEGER NOT NULL DEFAULT 0,
    "artifactBytes" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "usage_daily_pkey" PRIMARY KEY ("tenantId","day")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_doc" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetSystemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sections" JSONB NOT NULL,
    "pdfPath" TEXT,
    "shareToken" TEXT,
    "shareExpiresAt" TIMESTAMP(3),
    "generatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_doc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_task" (
    "name" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "lastMs" INTEGER,
    "lockedUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_task_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "workflow_layout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "positions" JSONB NOT NULL DEFAULT '{}',
    "collapsed" JSONB NOT NULL DEFAULT '{}',
    "viewport" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_layout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_mapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "schemaHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "value_map" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entries" JSONB NOT NULL,
    "fallback" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "value_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_object" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "purpose" TEXT,
    "externalRef" TEXT,
    "source" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "scannedAt" TIMESTAMP(3),
    "apiKeyId" TEXT,
    "uploadedById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_object_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_file" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,

    CONSTRAINT "run_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetSystemId" TEXT NOT NULL,
    "workflowId" TEXT,
    "stepId" TEXT,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "rule" TEXT NOT NULL,
    "errorCode" TEXT,
    "firstRunId" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "ackById" TEXT,
    "ackAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_baseline" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "domSignature" TEXT NOT NULL,
    "imageHash" TEXT,
    "thumbPath" TEXT,
    "runId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "step_baseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_catalog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "parentKey" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "option_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destination" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "secretEnc" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destination_delivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "newRows" INTEGER NOT NULL DEFAULT 0,
    "changedRows" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "destination_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extract_snapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "rowHash" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extract_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "concurrency_lease" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concurrency_lease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "target_system_tenantId_slug_key" ON "target_system"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "credential_tenantId_targetSystemId_idx" ON "credential"("tenantId", "targetSystemId");

-- CreateIndex
CREATE UNIQUE INDEX "credential_tenantId_targetSystemId_externalRef_key" ON "credential"("tenantId", "targetSystemId", "externalRef");

-- CreateIndex
CREATE INDEX "browser_session_tenantId_targetSystemId_credentialId_idx" ON "browser_session"("tenantId", "targetSystemId", "credentialId");

-- CreateIndex
CREATE INDEX "recording_tenantId_createdAt_idx" ON "recording"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "workflow_tenantId_targetSystemId_idx" ON "workflow"("tenantId", "targetSystemId");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_tenantId_slug_key" ON "workflow"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "workflow_version_tenantId_status_idx" ON "workflow_version"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_version_workflowId_versionNo_key" ON "workflow_version"("workflowId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "method_collection_tenantId_slug_key" ON "method_collection"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "method_tenantId_idx" ON "method"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "method_collectionId_slug_key" ON "method"("collectionId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "method_collectionId_resource_httpMethod_action_key" ON "method"("collectionId", "resource", "httpMethod", "action");

-- CreateIndex
CREATE INDEX "job_tenantId_createdAt_idx" ON "job"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "job_tenantId_idempotencyKey_key" ON "job"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "run_tenantId_status_queuedAt_idx" ON "run"("tenantId", "status", "queuedAt" DESC);

-- CreateIndex
CREATE INDEX "run_tenantId_methodId_queuedAt_idx" ON "run"("tenantId", "methodId", "queuedAt" DESC);

-- CreateIndex
CREATE INDEX "run_jobId_status_idx" ON "run"("jobId", "status");

-- CreateIndex
CREATE INDEX "run_tenantId_externalRef_idx" ON "run"("tenantId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "run_tenantId_idempotencyKey_key" ON "run"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "run_step_runId_seq_idx" ON "run_step"("runId", "seq");

-- CreateIndex
CREATE INDEX "run_artifact_runId_idx" ON "run_artifact"("runId");

-- CreateIndex
CREATE INDEX "run_artifact_tenantId_expiresAt_idx" ON "run_artifact"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "run_log_runId_ts_idx" ON "run_log"("runId", "ts");

-- CreateIndex
CREATE INDEX "webhook_endpoint_tenantId_idx" ON "webhook_endpoint"("tenantId");

-- CreateIndex
CREATE INDEX "webhook_delivery_tenantId_createdAt_idx" ON "webhook_delivery"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "webhook_delivery_status_nextAttemptAt_idx" ON "webhook_delivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "run_credit_ledger_key_key" ON "run_credit_ledger"("key");

-- CreateIndex
CREATE INDEX "run_credit_ledger_tenantId_createdAt_idx" ON "run_credit_ledger"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "run_credit_request_status_createdAt_idx" ON "run_credit_request"("status", "createdAt");

-- CreateIndex
CREATE INDEX "run_credit_request_tenantId_createdAt_idx" ON "run_credit_request"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_tenantId_userId_readAt_idx" ON "notification"("tenantId", "userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "system_doc_shareToken_key" ON "system_doc"("shareToken");

-- CreateIndex
CREATE INDEX "system_doc_tenantId_idx" ON "system_doc"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "system_doc_targetSystemId_version_key" ON "system_doc"("targetSystemId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_layout_versionId_key" ON "workflow_layout"("versionId");

-- CreateIndex
CREATE INDEX "workflow_layout_tenantId_idx" ON "workflow_layout"("tenantId");

-- CreateIndex
CREATE INDEX "import_mapping_tenantId_fingerprint_idx" ON "import_mapping"("tenantId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "import_mapping_methodId_name_key" ON "import_mapping"("methodId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "value_map_tenantId_name_key" ON "value_map"("tenantId", "name");

-- CreateIndex
CREATE INDEX "file_object_tenantId_createdAt_idx" ON "file_object"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "file_object_expiresAt_idx" ON "file_object"("expiresAt");

-- CreateIndex
CREATE INDEX "run_file_runId_idx" ON "run_file"("runId");

-- CreateIndex
CREATE INDEX "run_file_fileId_idx" ON "run_file"("fileId");

-- CreateIndex
CREATE INDEX "incident_tenantId_status_idx" ON "incident"("tenantId", "status");

-- CreateIndex
CREATE INDEX "incident_targetSystemId_status_idx" ON "incident"("targetSystemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "step_baseline_versionId_stepId_key" ON "step_baseline"("versionId", "stepId");

-- CreateIndex
CREATE INDEX "option_catalog_tenantId_idx" ON "option_catalog"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "option_catalog_versionId_stepId_parentKey_key" ON "option_catalog"("versionId", "stepId", "parentKey");

-- CreateIndex
CREATE INDEX "destination_tenantId_methodId_idx" ON "destination"("tenantId", "methodId");

-- CreateIndex
CREATE INDEX "destination_delivery_destinationId_createdAt_idx" ON "destination_delivery"("destinationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "extract_snapshot_destinationId_scopeKey_rowKey_key" ON "extract_snapshot"("destinationId", "scopeKey", "rowKey");

-- CreateIndex
CREATE INDEX "rate_limit_bucket_expiresAt_idx" ON "rate_limit_bucket"("expiresAt");

-- CreateIndex
CREATE INDEX "concurrency_lease_scope_key_expiresAt_idx" ON "concurrency_lease"("scope", "key", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "concurrency_lease_scope_key_runId_key" ON "concurrency_lease"("scope", "key", "runId");

-- AddForeignKey
ALTER TABLE "target_system" ADD CONSTRAINT "target_system_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential" ADD CONSTRAINT "credential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential" ADD CONSTRAINT "credential_targetSystemId_fkey" FOREIGN KEY ("targetSystemId") REFERENCES "target_system"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_session" ADD CONSTRAINT "browser_session_targetSystemId_fkey" FOREIGN KEY ("targetSystemId") REFERENCES "target_system"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_session" ADD CONSTRAINT "browser_session_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording" ADD CONSTRAINT "recording_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording" ADD CONSTRAINT "recording_targetSystemId_fkey" FOREIGN KEY ("targetSystemId") REFERENCES "target_system"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_targetSystemId_fkey" FOREIGN KEY ("targetSystemId") REFERENCES "target_system"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_version" ADD CONSTRAINT "workflow_version_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "method_collection" ADD CONSTRAINT "method_collection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "method" ADD CONSTRAINT "method_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "method_collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "method" ADD CONSTRAINT "method_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "method"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run" ADD CONSTRAINT "run_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run" ADD CONSTRAINT "run_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "method"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run" ADD CONSTRAINT "run_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run" ADD CONSTRAINT "run_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_step" ADD CONSTRAINT "run_step_runId_fkey" FOREIGN KEY ("runId") REFERENCES "run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_artifact" ADD CONSTRAINT "run_artifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_artifact" ADD CONSTRAINT "run_artifact_runStepId_fkey" FOREIGN KEY ("runStepId") REFERENCES "run_step"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_credit_ledger" ADD CONSTRAINT "run_credit_ledger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_credit_request" ADD CONSTRAINT "run_credit_request_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_layout" ADD CONSTRAINT "workflow_layout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_layout" ADD CONSTRAINT "workflow_layout_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "workflow_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_mapping" ADD CONSTRAINT "import_mapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "value_map" ADD CONSTRAINT "value_map_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_file" ADD CONSTRAINT "run_file_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_object"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_catalog" ADD CONSTRAINT "option_catalog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destination" ADD CONSTRAINT "destination_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destination_delivery" ADD CONSTRAINT "destination_delivery_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
