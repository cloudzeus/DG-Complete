-- Dev only (docker-compose.dev.yml): roles and the DG_COMPLETE database.
-- Production roles / grants: scripts/db-roles.sql (P02).
CREATE ROLE dgcomplete_migrator LOGIN CREATEDB PASSWORD 'dev'; -- CREATEDB: shadow database of prisma migrate dev
CREATE ROLE dgcomplete_app LOGIN PASSWORD 'dev';
CREATE DATABASE "DG_COMPLETE" OWNER dgcomplete_migrator;
\connect "DG_COMPLETE"
GRANT USAGE, CREATE ON SCHEMA public TO dgcomplete_app;
ALTER DEFAULT PRIVILEGES FOR ROLE dgcomplete_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dgcomplete_app;
ALTER DEFAULT PRIVILEGES FOR ROLE dgcomplete_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dgcomplete_app;
-- pg-boss creates and owns its own schema (ADR-022).
GRANT CREATE ON DATABASE "DG_COMPLETE" TO dgcomplete_app;
