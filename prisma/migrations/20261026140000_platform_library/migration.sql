-- Platform library (docs/27): systems and flows built by the super admin and shared with tenants.
ALTER TABLE "tenant" ADD COLUMN "isLibrary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "target_system" ADD COLUMN "sourceTargetId" TEXT;
ALTER TABLE "workflow" ADD COLUMN "sourceWorkflowId" TEXT;
ALTER TABLE "workflow_version" ADD COLUMN "sourceVersionId" TEXT;
CREATE INDEX "target_system_sourceTargetId_idx" ON "target_system" ("sourceTargetId");
CREATE INDEX "workflow_sourceWorkflowId_idx" ON "workflow" ("sourceWorkflowId");
