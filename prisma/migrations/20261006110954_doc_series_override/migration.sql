-- CreateTable
CREATE TABLE "doc_series_override" (
    "tenantId" TEXT NOT NULL,
    "series" INTEGER NOT NULL,
    "sign" INTEGER NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doc_series_override_pkey" PRIMARY KEY ("tenantId","series")
);

-- AddForeignKey
ALTER TABLE "doc_series_override" ADD CONSTRAINT "doc_series_override_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
