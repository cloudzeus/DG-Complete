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
CREATE TABLE "industry_segmentation" (
    "tenantId" TEXT NOT NULL,
    "segments" JSONB NOT NULL,
    "mapping" JSONB NOT NULL,
    "profiles" JSONB,
    "model" TEXT,
    "builtAt" TIMESTAMP(3),
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industry_segmentation_pkey" PRIMARY KEY ("tenantId")
);

-- AddForeignKey
ALTER TABLE "industry_segmentation" ADD CONSTRAINT "industry_segmentation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
