-- CreateEnum
CREATE TYPE "PnlSource" AS ENUM ('GL', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "PnlSection" AS ENUM ('REVENUE', 'COGS', 'OTHER_INCOME', 'OPEX', 'DEPRECIATION', 'FINANCIAL', 'EXTRAORDINARY', 'TAX');

-- CreateTable
CREATE TABLE "pnl_config" (
    "tenantId" TEXT NOT NULL,
    "source" "PnlSource" NOT NULL DEFAULT 'GL',
    "template" TEXT NOT NULL,
    "builtAt" TIMESTAMP(3),
    "buildRows" INTEGER,
    "buildError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pnl_config_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "pnl_line" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" "PnlSection" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pnl_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pnl_rule" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "negate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pnl_rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pnl_line_tenantId_code_key" ON "pnl_line"("tenantId", "code");

-- CreateIndex
CREATE INDEX "pnl_rule_lineId_idx" ON "pnl_rule"("lineId");

-- AddForeignKey
ALTER TABLE "pnl_config" ADD CONSTRAINT "pnl_config_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pnl_line" ADD CONSTRAINT "pnl_line_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pnl_rule" ADD CONSTRAINT "pnl_rule_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "pnl_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;
