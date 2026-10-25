-- CreateEnum
CREATE TYPE "SyncDestination" AS ENUM ('APP', 'WAREHOUSE');

-- AlterTable
ALTER TABLE "sync_job" ADD COLUMN     "columns" JSONB,
ADD COLUMN     "dateField" TEXT,
ADD COLUMN     "destination" "SyncDestination" NOT NULL DEFAULT 'APP',
ADD COLUMN     "historyFrom" TIMESTAMP(3),
ADD COLUMN     "targetTable" TEXT,
ADD COLUMN     "windowDays" INTEGER;
