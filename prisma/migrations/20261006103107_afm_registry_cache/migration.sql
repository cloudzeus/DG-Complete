-- CreateTable
CREATE TABLE "afm_registry" (
    "afm" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "legal" TEXT,
    "active" BOOLEAN,
    "registered" TEXT,
    "mainKad" TEXT,
    "mainKadDescr" TEXT,
    "kads" JSONB,
    "found" BOOLEAN NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "afm_registry_pkey" PRIMARY KEY ("afm")
);
