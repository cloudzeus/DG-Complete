-- CreateTable
CREATE TABLE "item_substitute" (
    "tenantId" TEXT NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "altMtrl" INTEGER NOT NULL,
    "match" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_substitute_pkey" PRIMARY KEY ("tenantId","mtrl","altMtrl")
);

-- AddForeignKey
ALTER TABLE "item_substitute" ADD CONSTRAINT "item_substitute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
