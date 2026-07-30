-- ═══════════════════════════════════════════════════════════════════════════════
-- Tenant isolation regression suite.
--
-- Run as the APPLICATION role (DATABASE_URL), never as the owner:
--     psql "$DATABASE_URL" -f scripts/verify-tenant-isolation.sql
--
-- Fixtures must already exist (scripts/seed-isolation-fixtures.sql, run as owner).
-- Any failure raises, so this returns non-zero in CI.
--
-- These are the four guarantees where a bug becomes a breach, so they are tested
-- against the database itself rather than mocked. Case 7 is here because an
-- earlier revision of the policies genuinely failed it: a `app.bypass_rls` GUC
-- let the application role grant itself a cross-tenant read.
-- ═══════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

DO $$
DECLARE
    n        integer;
    ok       boolean;
    failures text[] := '{}';
BEGIN
    -- 1. No tenant context must expose nothing. Fail closed, never open.
    SELECT count(*) INTO n FROM "company";
    IF n <> 0 THEN
        failures := failures || format('case 1: unscoped read returned %s rows, expected 0', n);
    END IF;

    -- 2/3. Each tenant sees exactly its own rows.
    PERFORM set_config('app.organization_id', 'org-aaa', true);
    SELECT count(*) INTO n FROM "company";
    IF n <> 2 THEN
        failures := failures || format('case 2: org-aaa saw %s companies, expected 2', n);
    END IF;

    PERFORM set_config('app.organization_id', 'org-bbb', true);
    SELECT count(*) INTO n FROM "company";
    IF n <> 1 THEN
        failures := failures || format('case 3: org-bbb saw %s companies, expected 1', n);
    END IF;

    -- 4. Child tables have no tenant column and must still be isolated via parent.
    PERFORM set_config('app.organization_id', 'org-aaa', true);
    SELECT count(*) INTO n FROM "pipeline_stage";
    IF n <> 1 THEN
        failures := failures || format('case 4: child table leaked, saw %s stages, expected 1', n);
    END IF;

    -- 5. Writing into another tenant must be rejected by WITH CHECK.
    PERFORM set_config('app.organization_id', 'org-bbb', true);
    BEGIN
        INSERT INTO "company" (id, organization_id, name, created_at, updated_at)
        VALUES ('isolation-probe', 'org-aaa', 'Injected', now(), now());
        failures := failures || 'case 5: cross-tenant INSERT succeeded and must not';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        NULL; -- expected
    END;

    -- 6. Updating another tenant's row must match nothing.
    PERFORM set_config('app.organization_id', 'org-bbb', true);
    UPDATE "company" SET name = 'Hijacked' WHERE id = 'co-a1';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
        failures := failures || format('case 6: cross-tenant UPDATE touched %s rows', n);
    END IF;

    -- 7. The application must not be able to forge its way out of its policies.
    PERFORM set_config('app.organization_id', 'org-bbb', true);
    PERFORM set_config('app.bypass_rls', 'on', true);
    SELECT count(*) INTO n FROM "company";
    IF n <> 1 THEN
        failures := failures || format(
            'case 7: PRIVILEGE ESCALATION — forged bypass exposed %s rows, expected 1', n);
    END IF;
    PERFORM set_config('app.bypass_rls', 'off', true);

    -- 8. The audit trail must be immutable to the application.
    PERFORM set_config('app.organization_id', 'org-aaa', true);
    BEGIN
        UPDATE "audit_log" SET action = 'tampered' WHERE id = 'au-1';
        failures := failures || 'case 8: audit_log accepted an UPDATE and must not';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL; -- expected, from either the REVOKE or the trigger
    END;

    -- 9. The application must not be able to turn the policies off.
    BEGIN
        EXECUTE 'ALTER TABLE "company" DISABLE ROW LEVEL SECURITY';
        failures := failures || 'case 9: application disabled RLS and must not be able to';
    EXCEPTION WHEN insufficient_privilege OR wrong_object_type THEN
        NULL; -- expected
    END;

    -- 10. The role itself must genuinely be subject to RLS.
    SELECT app.rls_enforced_for_current_user() INTO ok;
    IF NOT ok THEN
        failures := failures ||
            'case 10: current role is superuser/BYPASSRLS/owner, so policies are decorative';
    END IF;

    IF array_length(failures, 1) > 0 THEN
        RAISE EXCEPTION E'Tenant isolation FAILED:\n  - %', array_to_string(failures, E'\n  - ');
    END IF;

    RAISE NOTICE 'Tenant isolation: all 10 cases passed';
END $$;
