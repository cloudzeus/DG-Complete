-- DG Complete — database roles (docs/10 §4α, ADR-019/020). Run once as superuser on the Postgres server.
-- The app role does NOT own the tables (otherwise RLS would be bypassed) and has no BYPASSRLS.
--   psql -v migrator_pw="'…'" -v app_pw="'…'" -f scripts/db-roles.sql

CREATE ROLE dgcomplete_migrator LOGIN PASSWORD :migrator_pw;
CREATE ROLE dgcomplete_app LOGIN PASSWORD :app_pw NOBYPASSRLS;
CREATE DATABASE "DG_COMPLETE" OWNER dgcomplete_migrator;

\connect "DG_COMPLETE"
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO dgcomplete_app;

-- Tables / sequences created by migrations (as dgcomplete_migrator) are usable by the app.
ALTER DEFAULT PRIVILEGES FOR ROLE dgcomplete_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dgcomplete_app;
ALTER DEFAULT PRIVILEGES FOR ROLE dgcomplete_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dgcomplete_app;
ALTER DEFAULT PRIVILEGES FOR ROLE dgcomplete_migrator IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO dgcomplete_app;
-- For a database migrated before these defaults existed:
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dgcomplete_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dgcomplete_app;

-- pg-boss keeps its queues in its own schema, owned by the app role (ADR-022).
CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION dgcomplete_app;
