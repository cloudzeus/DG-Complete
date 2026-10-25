-- CreateTable
CREATE TABLE "geo_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "tokenEnc" TEXT,
    "keyHint" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "batchSize" INTEGER NOT NULL DEFAULT 300,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geo_settings_pkey" PRIMARY KEY ("id")
);
