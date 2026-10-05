-- At most one RUNNING sync per connection + kind (acts as a distributed lock).
CREATE UNIQUE INDEX "sync_run_one_running" ON "sync_run" ("connectionId", "kind") WHERE "status" = 'RUNNING';
