-- CreateTable
CREATE TABLE "cube_deployment" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "apiUrl" TEXT NOT NULL,
    "devUrl" TEXT,
    "controlPlaneUrl" TEXT NOT NULL,
    "warehouseConnectionId" TEXT,
    "devConnectionId" TEXT,
    "secretsEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cube_deployment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cube_deployment" ADD CONSTRAINT "cube_deployment_warehouseConnectionId_fkey" FOREIGN KEY ("warehouseConnectionId") REFERENCES "data_connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cube_deployment" ADD CONSTRAINT "cube_deployment_devConnectionId_fkey" FOREIGN KEY ("devConnectionId") REFERENCES "data_connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
