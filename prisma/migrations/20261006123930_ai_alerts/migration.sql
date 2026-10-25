-- AlterTable
ALTER TABLE "ai_settings" ADD COLUMN     "alertBelowUsd" DECIMAL(10,2) NOT NULL DEFAULT 20,
ADD COLUMN     "alertEmail" TEXT DEFAULT 'gkozyris@dgsmart.gr';
