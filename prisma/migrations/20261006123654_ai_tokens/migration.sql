-- AlterTable
ALTER TABLE "ai_settings" ADD COLUMN     "tokenPackages" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "plan" ADD COLUMN     "aiTokensMonthly" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "aiTokenBalance" INTEGER NOT NULL DEFAULT 0;

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
CREATE UNIQUE INDEX "ai_token_ledger_key_key" ON "ai_token_ledger"("key");

-- CreateIndex
CREATE INDEX "ai_token_ledger_tenantId_createdAt_idx" ON "ai_token_ledger"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_token_request_status_createdAt_idx" ON "ai_token_request"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ai_token_request_tenantId_createdAt_idx" ON "ai_token_request"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_token_ledger" ADD CONSTRAINT "ai_token_ledger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_token_request" ADD CONSTRAINT "ai_token_request_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
