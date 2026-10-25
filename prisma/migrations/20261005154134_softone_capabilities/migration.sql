-- AlterTable
ALTER TABLE "softone_connection" ADD COLUMN     "capabilities" JSONB,
ADD COLUMN     "detectedAt" TIMESTAMP(3);
