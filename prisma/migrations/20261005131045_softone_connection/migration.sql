-- CreateEnum
CREATE TYPE "SoftOneScope" AS ENUM ('DGSOFT', 'TENANT');

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "softone_connection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "softone_connection_scope_idx" ON "softone_connection"("scope");

-- CreateIndex
CREATE INDEX "softone_connection_tenantId_idx" ON "softone_connection"("tenantId");

-- AddForeignKey
ALTER TABLE "softone_connection" ADD CONSTRAINT "softone_connection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
