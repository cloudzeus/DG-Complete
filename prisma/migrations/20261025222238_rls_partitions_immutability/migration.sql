-- DG Complete — hand-written SQL that Prisma cannot express (docs/03 §3–§6, P02).

-- 1. run_log partitioned by month (docs/03 §4). Fresh database: recreate the empty table.
DROP TABLE "run_log";
CREATE TABLE "run_log" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" "LogLevel" NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    CONSTRAINT "run_log_pkey" PRIMARY KEY ("id", "ts")
) PARTITION BY RANGE ("ts");
CREATE INDEX "run_log_runId_ts_idx" ON "run_log"("runId", "ts");

-- Creates the partition of the month that contains `d` (idempotent). Called by the scheduler on the
-- 25th for the next month (lib/jobs/registry.ts) and here for the current and next month.
CREATE OR REPLACE FUNCTION app_ensure_run_log_partition(d date) RETURNS text AS $$
DECLARE
  start_d date := date_trunc('month', d)::date;
  end_d   date := (date_trunc('month', d) + interval '1 month')::date;
  name    text := format('run_log_%s', to_char(start_d, 'YYYY_MM'));
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF "run_log" FOR VALUES FROM (%L) TO (%L)', name, start_d, end_d);
  RETURN name;
END $$ LANGUAGE plpgsql;

SELECT app_ensure_run_log_partition(current_date);
SELECT app_ensure_run_log_partition((current_date + interval '1 month')::date);

-- 2. Indexes (docs/03 §3)
CREATE INDEX "run_active_idx" ON "run" ("tenantId", "queuedAt")
  WHERE "status" IN ('QUEUED', 'RUNNING', 'RETRY_SCHEDULED', 'NEEDS_ATTENTION');
CREATE INDEX "workflow_tags_gin" ON "workflow" USING GIN ("tags");

-- 3. Row level security on the sensitive tables (docs/03 §5). FORCE: also for the table owner.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['credential', 'browser_session', 'recording', 'run', 'run_step', 'run_artifact', 'run_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.platform', true) = 'on')$p$, t);
  END LOOP;
END $$;

-- 4. Published workflow versions are immutable (docs/03 §6)
CREATE OR REPLACE FUNCTION workflow_version_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'PUBLISHED' AND (NEW.definition IS DISTINCT FROM OLD.definition
     OR NEW."inputSchema" IS DISTINCT FROM OLD."inputSchema"
     OR NEW."outputSchema" IS DISTINCT FROM OLD."outputSchema") THEN
    RAISE EXCEPTION 'published workflow version is immutable';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER workflow_version_immutable BEFORE UPDATE ON "workflow_version"
  FOR EACH ROW EXECUTE FUNCTION workflow_version_immutable();
