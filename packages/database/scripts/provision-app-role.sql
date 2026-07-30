-- ═══════════════════════════════════════════════════════════════════════════════
-- Provision the application database role.
--
-- Run ONCE per environment, as the database owner, AFTER migrations have been
-- applied. Then point DATABASE_URL at this role and DIRECT_DATABASE_URL at the
-- owner.
--
--   psql "$DIRECT_DATABASE_URL" \
--     -v app_password="$(openssl rand -base64 32)" \
--     -f scripts/provision-app-role.sql
--
-- Why this exists
--   Row-level security does not constrain superusers, roles with BYPASSRLS, or
--   the owner of the table. If the application connects as any of those, the
--   policies in 20260730000100_row_level_security are decorative. This role has
--   none of those attributes, so tenant isolation is enforced by PostgreSQL
--   itself and cannot be circumvented by application code — including by a SQL
--   injection that reaches raw query execution.
-- ═══════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_app') THEN
        CREATE ROLE vsp_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOINHERIT NOREPLICATION NOBYPASSRLS;
        RAISE NOTICE 'Created role vsp_app';
    ELSE
        RAISE NOTICE 'Role vsp_app already exists — updating attributes and grants';
        ALTER ROLE vsp_app NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;
END $$;

ALTER ROLE vsp_app PASSWORD :'app_password';

-- Read and write data. Deliberately no DDL: the application must never be able
-- to alter a policy, drop a table, or disable row-level security.
-- The database name is not a constant in GRANT, so it is interpolated safely
-- from current_database() rather than hardcoded per environment.
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO vsp_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public, app TO vsp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vsp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vsp_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO vsp_app;

-- Tables created by future migrations inherit the same grants automatically,
-- so a new model can never accidentally ship unreadable or ungoverned.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vsp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO vsp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
    GRANT EXECUTE ON FUNCTIONS TO vsp_app;

-- The audit trail is append-only for the application; the trigger enforces it at
-- the row level, and revoking here makes the intent explicit and defence-in-depth.
REVOKE UPDATE, DELETE ON "audit_log" FROM vsp_app;

-- Verify the outcome rather than assume it.
DO $$
DECLARE enforced boolean;
BEGIN
    SELECT NOT (rolsuper OR rolbypassrls) INTO enforced
    FROM pg_roles WHERE rolname = 'vsp_app';

    IF NOT enforced THEN
        RAISE EXCEPTION 'vsp_app can bypass row-level security — refusing to continue';
    END IF;

    IF pg_has_role('vsp_app', (
        SELECT relowner FROM pg_class
        WHERE relname = 'organization' AND relnamespace = 'public'::regnamespace
    ), 'MEMBER') THEN
        RAISE EXCEPTION 'vsp_app owns the tables, so RLS would not apply — refusing to continue';
    END IF;

    RAISE NOTICE 'vsp_app provisioned and confirmed subject to row-level security';
END $$;
