-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "biBuildError" TEXT,
ADD COLUMN     "biBuiltAt" TIMESTAMP(3),
ADD COLUMN     "biSettings" JSONB;
