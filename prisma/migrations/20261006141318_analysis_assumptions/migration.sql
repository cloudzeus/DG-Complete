-- AlterTable
ALTER TABLE "planning_settings" ADD COLUMN     "costPerDocument" DECIMAL(10,2),
ADD COLUMN     "financingRatePct" DECIMAL(5,2),
ADD COLUMN     "lostSharePct" DECIMAL(5,2);
