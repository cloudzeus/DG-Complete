-- CreateEnum
CREATE TYPE "SyncJobType" AS ENUM ('CUSTOMERS', 'TABLE');

-- AlterEnum
ALTER TYPE "SyncKind" ADD VALUE 'TABLE';

-- AlterTable
ALTER TABLE "sync_run" ADD COLUMN     "jobId" TEXT;

-- CreateTable
CREATE TABLE "role_permission" (
    "role" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role","permission")
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

-- CreateIndex
CREATE INDEX "sync_job_enabled_nextRunAt_idx" ON "sync_job"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "sync_job_connectionId_name_key" ON "sync_job"("connectionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "s1_record_jobId_key_key" ON "s1_record"("jobId", "key");

-- AddForeignKey
ALTER TABLE "sync_job" ADD CONSTRAINT "sync_job_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "softone_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "s1_record" ADD CONSTRAINT "s1_record_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "sync_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "sync_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One RUNNING run per job (distributed lock for scheduled + manual runs).
CREATE UNIQUE INDEX "sync_run_one_running_job" ON "sync_run" ("jobId") WHERE "status" = 'RUNNING' AND "jobId" IS NOT NULL;
