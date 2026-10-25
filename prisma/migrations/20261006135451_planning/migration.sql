-- CreateTable
CREATE TABLE "budget_month" (
    "tenantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revenue" DECIMAL(14,2),
    "margin" DECIMAL(14,2),
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_month_pkey" PRIMARY KEY ("tenantId","year","month")
);

-- CreateTable
CREATE TABLE "planning_settings" (
    "tenantId" TEXT NOT NULL,
    "fixedCostsMonthly" DECIMAL(14,2),
    "minCash" DECIMAL(14,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_settings_pkey" PRIMARY KEY ("tenantId")
);

-- AddForeignKey
ALTER TABLE "budget_month" ADD CONSTRAINT "budget_month_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_settings" ADD CONSTRAINT "planning_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
