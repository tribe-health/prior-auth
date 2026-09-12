-- RA06c follow-up. Migration 2026090612 revoked EXECUTE on every function in
-- schema `aso` from PUBLIC so `aso_authority_event_reader` could not reach a
-- SECURITY DEFINER write path. That revocation was correct for the event
-- reader and too broad for everyone else: the two session-context helpers are
-- NOT SECURITY DEFINER and had never been granted to a role, so they depended
-- entirely on the PUBLIC default. Losing it broke every authenticated request
-- with:
--
--     ERROR: permission denied for function current_app_user_id
--
-- surfaced as a bare HTTP 503 `session_unavailable`, because the membership
-- adapter maps every database error to SessionError::Unavailable.
--
-- `current_app_user_id()` is called directly by the membership resolve query
-- (crates/aso-web-server/src/adapters/session.rs). `current_app_practice_ids()`
-- backs six row-level security policies; RLS predicates evaluate as the
-- querying role, so the session reader must be able to execute it or every
-- RLS-protected read fails the same way.
--
-- Granted by role, never back to PUBLIC — 0612's boundary for
-- `aso_authority_event_reader` is preserved, and its assertion below still
-- holds. The SECURITY DEFINER gate functions are deliberately NOT granted
-- here: 0601 already grants `read_gate`, `may_affirm_gate`,
-- `lookup_gate_command` and `apply_gate_command` to `aso_gate_executor` by
-- name, and `gate_actor_context()` / `require_gate_case()` are invoked from
-- inside other SECURITY DEFINER functions, so they execute as their owner and
-- need no caller grant.

GRANT EXECUTE ON FUNCTION
  aso.current_app_user_id(),
  aso.current_app_practice_ids()
  TO aso_session_reader;

-- The gate executor performs RLS-protected reads on the clinical tables under
-- its own role, so it needs the same context helpers.
GRANT EXECUTE ON FUNCTION
  aso.current_app_user_id(),
  aso.current_app_practice_ids()
  TO aso_gate_executor;

-- Re-assert 0612's invariant: the authority event reader still may not execute
-- anything in `aso`. This fails loudly if a future grant widens it.
DO $$
DECLARE
  reader oid;
BEGIN
  SELECT oid INTO STRICT reader
    FROM pg_catalog.pg_roles
   WHERE rolname = 'aso_authority_event_reader';

  IF EXISTS (
    SELECT FROM pg_catalog.pg_proc routine
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'aso'
      AND pg_catalog.has_function_privilege(reader, routine.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION
      'aso_authority_event_reader may not execute functions in schema aso';
  END IF;
END;
$$;
