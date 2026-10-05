-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('NONE', 'READY', 'DISABLED', 'ERROR');

-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "warehouseError" TEXT,
ADD COLUMN     "warehouseProvisionedAt" TIMESTAMP(3),
ADD COLUMN     "warehouseStatus" "WarehouseStatus" NOT NULL DEFAULT 'NONE';
