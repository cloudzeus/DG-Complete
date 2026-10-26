-- CreateTable
CREATE TABLE "storage_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "driver" TEXT NOT NULL DEFAULT 'local',
    "storageZone" TEXT,
    "region" TEXT,
    "accessKeyEnc" TEXT,
    "accessKeyHint" TEXT,
    "pullZoneHost" TEXT,
    "tokenKeyEnc" TEXT,
    "tokenKeyHint" TEXT,
    "signedUrlTtlSec" INTEGER NOT NULL DEFAULT 900,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_settings_pkey" PRIMARY KEY ("id")
);
