-- CreateEnum
CREATE TYPE "SyncKind" AS ENUM ('DGSOFT_CUSTOMERS');

-- CreateEnum
CREATE TYPE "SyncMode" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'BANK_TRANSFER', 'CASH', 'VIVA');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "S1PostStatus" AS ENUM ('NOT_POSTED', 'POSTED', 'FAILED');

-- AlterTable
ALTER TABLE "softone_connection" ADD COLUMN     "invoiceSeries" INTEGER,
ADD COLUMN     "paymentCode" INTEGER,
ADD COLUMN     "pricesIncludeVat" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "serviceMtrl" INTEGER,
ADD COLUMN     "vatRate" DECIMAL(5,2);

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

    CONSTRAINT "sync_run_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "s1_customer_afm_idx" ON "s1_customer"("afm");

-- CreateIndex
CREATE INDEX "s1_customer_name_idx" ON "s1_customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "s1_customer_connectionId_trdr_key" ON "s1_customer"("connectionId", "trdr");

-- CreateIndex
CREATE INDEX "sync_run_connectionId_kind_startedAt_idx" ON "sync_run"("connectionId", "kind", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_providerRef_key" ON "payment"("providerRef");

-- CreateIndex
CREATE INDEX "payment_tenantId_paidAt_idx" ON "payment"("tenantId", "paidAt");

-- CreateIndex
CREATE INDEX "payment_s1Status_idx" ON "payment"("s1Status");

-- AddForeignKey
ALTER TABLE "s1_customer" ADD CONSTRAINT "s1_customer_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "softone_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "softone_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
