-- CreateTable
CREATE TABLE "saved_report" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_report_tenantId_userId_idx" ON "saved_report"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "saved_report" ADD CONSTRAINT "saved_report_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
