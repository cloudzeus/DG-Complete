-- AlterTable
ALTER TABLE "cube_deployment" ADD COLUMN     "modelExclude" TEXT[] DEFAULT ARRAY['analytics_*']::TEXT[];
