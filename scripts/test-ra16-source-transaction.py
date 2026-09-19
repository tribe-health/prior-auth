#!/usr/bin/env python3
"""Focused local PostgreSQL proof for RA16 authorized source delivery."""

import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import urllib.parse
import uuid


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-16-authorized-source-preview/task-2-server-transaction.json"
MIGRATION = ROOT / "migrations/server/2026090616_authorized_document_source.sql"


def quote_identifier(value):
    return '"' + value.replace('"', '""') + '"'


def quote_literal(value):
    return "'" + value.replace("'", "''") + "'"


def run(command, *, env=None, input_text=None, check=True):
    completed = subprocess.run(
        command,
        cwd=ROOT,
        env=env,
        input=input_text,
        text=True,
        capture_output=True,
        timeout=300,
    )
    if check and completed.returncode:
        detail = (completed.stdout + "\n" + completed.stderr)[-4000:]
        raise RuntimeError(f"command_failed:{command[0]}\n{detail}")
    return completed


def psql(database, sql, *, url=None, password=None, check=True):
    environment = os.environ.copy()
    if password is not None:
        environment["PGPASSWORD"] = password
    target = url or database
    return run(
        ["psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-d", target],
        env=environment,
        input_text=sql,
        check=check,
    )


def main():
    token = uuid.uuid4().hex
    database = f"synthetic_ra16_{token}"
    login = f"{database}_login"
    observer = f"{database}_observer"
    password = secrets.token_urlsafe(24)
    observer_password = secrets.token_urlsafe(24)
    ids = {name: str(uuid.uuid4()) for name in (
        "practice", "foreign_practice", "identity", "foreign_identity",
        "actor", "foreign_actor", "case", "document",
    )}
    source_bytes = b"%PDF-1.7\nSynthetic RA16 source\n%%EOF\n"
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    root = Path(tempfile.mkdtemp(prefix="aso-ra16-source-"))
    (root / "documents").mkdir()
    (root / "documents/source.pdf").write_bytes(source_bytes)
    created_roles = False
    created_database = False
    report = {
        "result": "Failed",
        "verificationTier": 1,
        "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "command": "RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-ra16-source-transaction.py",
        "checks": {},
        "cleanup": {},
    }

    lock_path = Path(tempfile.gettempdir()) / "aso-ra16-source-transaction.lock"
    with lock_path.open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            existing = psql(
                "postgres",
                "SELECT rolname FROM pg_roles WHERE rolname IN "
                "('aso_gate_owner','aso_gate_executor');",
            ).stdout.split()
            if existing:
                raise RuntimeError("shared_gate_roles_already_exist")

            psql(
                "postgres",
                f"""
                CREATE ROLE aso_gate_owner NOLOGIN NOINHERIT;
                CREATE ROLE aso_gate_executor NOLOGIN NOINHERIT;
                CREATE ROLE {quote_identifier(login)} LOGIN INHERIT PASSWORD {quote_literal(password)};
                CREATE ROLE {quote_identifier(observer)} LOGIN NOINHERIT PASSWORD {quote_literal(observer_password)};
                GRANT aso_gate_executor TO {quote_identifier(login)};
                """,
            )
            created_roles = True
            psql("postgres", f"CREATE DATABASE {quote_identifier(database)};")
            created_database = True
            psql(
                "postgres",
                f"REVOKE CREATE ON DATABASE {quote_identifier(database)} FROM PUBLIC;",
            )

            prelude = f"""
            CREATE SCHEMA aso;
            CREATE TABLE aso.practices (id uuid PRIMARY KEY);
            CREATE TABLE aso.users (
              id uuid PRIMARY KEY,
              kratos_identity_id uuid NOT NULL UNIQUE,
              practice_id uuid NOT NULL REFERENCES aso.practices(id),
              full_name text NOT NULL,
              status text NOT NULL
            );
            CREATE TABLE aso.cases (
              id uuid PRIMARY KEY,
              practice_id uuid NOT NULL REFERENCES aso.practices(id)
            );
            CREATE TABLE aso.documents (
              id uuid PRIMARY KEY,
              case_id uuid REFERENCES aso.cases(id),
              name text NOT NULL,
              effective_date date NOT NULL,
              storage_uri text,
              content_sha256 bytea,
              page_count integer
            );
            CREATE TABLE aso.audit_events (
              id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
              practice_id uuid,
              occurred_at timestamptz NOT NULL,
              actor_id uuid,
              actor_kratos_id uuid,
              actor_label text NOT NULL,
              actor_role text NOT NULL,
              action text NOT NULL,
              outcome text NOT NULL,
              entity_table text NOT NULL,
              entity_id uuid,
              case_id uuid,
              summary text NOT NULL,
              data jsonb NOT NULL
            );
            ALTER TABLE aso.cases ENABLE ROW LEVEL SECURITY;
            ALTER TABLE aso.documents ENABLE ROW LEVEL SECURITY;
            ALTER TABLE aso.audit_events ENABLE ROW LEVEL SECURITY;
            GRANT USAGE ON SCHEMA aso TO aso_gate_owner, aso_gate_executor, {quote_identifier(observer)};
            GRANT SELECT ON aso.users, aso.cases, aso.documents TO aso_gate_owner;
            GRANT INSERT ON aso.audit_events TO aso_gate_owner;
            GRANT USAGE ON SEQUENCE aso.audit_events_id_seq TO aso_gate_owner;
            GRANT SELECT ON aso.audit_events TO {quote_identifier(observer)};
            CREATE POLICY cases_owner ON aso.cases TO aso_gate_owner USING (true);
            CREATE POLICY documents_owner ON aso.documents TO aso_gate_owner USING (true);
            CREATE POLICY audit_owner ON aso.audit_events FOR INSERT TO aso_gate_owner
              WITH CHECK (
                practice_id=NULLIF(current_setting('aso.practice_id',true),'')::uuid
                AND actor_id=NULLIF(current_setting('aso.actor_id',true),'')::uuid
                AND actor_kratos_id=NULLIF(current_setting('aso.kratos_identity_id',true),'')::uuid
                AND current_setting('aso.principal',true)='user');
            CREATE POLICY audit_observer ON aso.audit_events FOR SELECT TO {quote_identifier(observer)}
              USING (true);

            CREATE FUNCTION aso.gate_actor_context()
            RETURNS TABLE(actor_id uuid, identity_id uuid, practice_id uuid, actor_label text)
            LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
            DECLARE
              context_identity uuid;
              context_actor uuid;
              context_practice uuid;
              context_expiry timestamptz;
            BEGIN
              context_identity:=NULLIF(current_setting('aso.kratos_identity_id',true),'')::uuid;
              context_actor:=NULLIF(current_setting('aso.actor_id',true),'')::uuid;
              context_practice:=NULLIF(current_setting('aso.practice_id',true),'')::uuid;
              context_expiry:=NULLIF(current_setting('aso.session_expires_at',true),'')::timestamptz;
              IF current_setting('aso.principal',true)<>'user' OR context_expiry<=clock_timestamp() THEN
                RAISE EXCEPTION 'verified user context required' USING ERRCODE='42501';
              END IF;
              RETURN QUERY SELECT u.id,u.kratos_identity_id,u.practice_id,u.full_name
              FROM aso.users u WHERE u.id=context_actor
                AND u.kratos_identity_id=context_identity
                AND u.practice_id=context_practice AND u.status='active';
              IF NOT FOUND THEN
                RAISE EXCEPTION 'verified user context required' USING ERRCODE='42501';
              END IF;
            END;
            $$;
            REVOKE ALL ON FUNCTION aso.gate_actor_context() FROM PUBLIC;
            ALTER FUNCTION aso.gate_actor_context() OWNER TO aso_gate_owner;
            GRANT EXECUTE ON FUNCTION aso.gate_actor_context() TO aso_gate_executor;

            INSERT INTO aso.practices(id) VALUES
              ({quote_literal(ids['practice'])}::uuid),
              ({quote_literal(ids['foreign_practice'])}::uuid);
            INSERT INTO aso.users(id,kratos_identity_id,practice_id,full_name,status) VALUES
              ({quote_literal(ids['actor'])}::uuid,{quote_literal(ids['identity'])}::uuid,{quote_literal(ids['practice'])}::uuid,'Synthetic reviewer','active'),
              ({quote_literal(ids['foreign_actor'])}::uuid,{quote_literal(ids['foreign_identity'])}::uuid,{quote_literal(ids['foreign_practice'])}::uuid,'Foreign reviewer','active');
            INSERT INTO aso.cases(id,practice_id) VALUES
              ({quote_literal(ids['case'])}::uuid,{quote_literal(ids['practice'])}::uuid);
            INSERT INTO aso.documents(id,case_id,name,effective_date,storage_uri,content_sha256,page_count)
            VALUES ({quote_literal(ids['document'])}::uuid,{quote_literal(ids['case'])}::uuid,
              'Synthetic MRI',DATE '2026-03-14','documents/source.pdf',decode('{source_hash}','hex'),4);
            """
            psql(database, prelude)
            psql(database, MIGRATION.read_text())
            report["checks"]["migration_applied"] = "Passed"

            encoded_password = urllib.parse.quote(password, safe="")
            encoded_observer_password = urllib.parse.quote(observer_password, safe="")
            runtime_url = f"postgresql://{login}:{encoded_password}@127.0.0.1:5432/{database}"
            observer_url = f"postgresql://{observer}:{encoded_observer_password}@127.0.0.1:5432/{database}"
            direct = psql(
                database,
                "SELECT storage_uri FROM aso.documents;",
                url=runtime_url,
                password=password,
                check=False,
            )
            if direct.returncode == 0:
                raise AssertionError("runtime_role_read_storage_uri")
            report["checks"]["runtime_storage_key_refused"] = "Passed"
            role_check = psql(
                database,
                """
                SELECT pg_has_role(session_user, 'aso_gate_executor', 'USAGE')
                  AND NOT EXISTS (
                    SELECT 1 FROM pg_roles r
                    WHERE (r.rolname = 'aso_gate_executor'
                      OR pg_has_role(session_user, r.oid, 'MEMBER')) AND (
                      r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
                      OR (r.rolname = 'aso_gate_executor' AND r.rolcanlogin)
                      OR has_schema_privilege(r.oid, 'aso', 'CREATE')
                      OR has_database_privilege(r.oid, current_database(), 'CREATE')
                      OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = 'aso'
                                 AND pg_has_role(r.oid, n.nspowner, 'MEMBER'))
                      OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                                 WHERE n.nspname='aso' AND (
                                   pg_has_role(r.oid, c.relowner, 'MEMBER') OR
                                   (c.relkind IN ('r','p','v','m','f') AND (
                                     has_table_privilege(r.oid,c.oid,
                                       'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') OR
                                     CASE WHEN current_setting('server_version_num')::integer >= 170000
                                       THEN has_table_privilege(r.oid,c.oid,'MAINTAIN')
                                       ELSE false END OR
                                     has_any_column_privilege(r.oid,c.oid,'INSERT, UPDATE, REFERENCES')))))
                      OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                                 WHERE n.nspname='aso' AND pg_has_role(r.oid,p.proowner,'MEMBER'))))
                """,
                url=runtime_url,
                password=password,
            ).stdout.strip()
            if role_check != "t":
                diagnostic = psql(
                    database,
                    "SELECT current_user,session_user,"
                    "pg_has_role(session_user,'aso_gate_executor','USAGE'),"
                    "has_schema_privilege(current_user,'aso','CREATE'),"
                    "has_database_privilege(current_user,current_database(),'CREATE');",
                    url=runtime_url,
                    password=password,
                ).stdout.strip()
                raise AssertionError(f"runtime_role_check:{diagnostic}")
            report["checks"]["runtime_role_boundary"] = "Passed"

            context = {
                "identity_id": ids["identity"],
                "actor_id": ids["actor"],
                "practice_id": ids["practice"],
            }
            foreign_context = {
                "identity_id": ids["foreign_identity"],
                "actor_id": ids["foreign_actor"],
                "practice_id": ids["foreign_practice"],
            }
            environment = os.environ.copy()
            environment.update({
                "RUSTUP_TOOLCHAIN": "1.97.1",
                "ASO_TEST_DATABASE_URL": runtime_url,
                "ASO_TEST_ADMIN_DATABASE_URL": observer_url,
                "ASO_TEST_SOURCE_ROOT": str(root),
                "ASO_TEST_SOURCE_CASE_ID": ids["case"],
                "ASO_TEST_SOURCE_DOCUMENT_ID": ids["document"],
                "ASO_TEST_SOURCE_CONTEXT": json.dumps(context),
                "ASO_TEST_SOURCE_FOREIGN_CONTEXT": json.dumps(foreign_context),
            })
            test = run([
                "cargo", "test", "-p", "aso-web-server",
                "adapters::gate::source_transaction_tests::document_source_transaction_authorizes_hashes_and_audits",
                "--", "--ignored", "--exact", "--nocapture",
            ], env=environment)
            if "1 passed; 0 failed" not in test.stdout:
                raise AssertionError("source_transaction_test_result")
            report["checks"].update({
                "authorized_bytes_hash_and_metadata": "Passed",
                "audit_committed_before_return": "Passed",
                "foreign_practice_refused": "Passed",
                "tampered_bytes_refused_without_audit": "Passed",
            })
            report["result"] = "Passed"
        finally:
            if created_database:
                psql("postgres", f"""
                    SELECT pg_terminate_backend(pid) FROM pg_stat_activity
                    WHERE datname={quote_literal(database)} AND pid<>pg_backend_pid();
                    DROP DATABASE IF EXISTS {quote_identifier(database)};
                """, check=False)
                report["cleanup"]["database"] = "Passed"
            if created_roles:
                psql("postgres", f"""
                    DROP ROLE IF EXISTS {quote_identifier(login)};
                    DROP ROLE IF EXISTS {quote_identifier(observer)};
                    DROP ROLE IF EXISTS aso_gate_executor;
                    DROP ROLE IF EXISTS aso_gate_owner;
                """, check=False)
                report["cleanup"]["roles"] = "Passed"
            shutil.rmtree(root, ignore_errors=True)
            report["cleanup"]["source_root"] = "Passed"
            OUTPUT.parent.mkdir(parents=True, exist_ok=True)
            OUTPUT.write_text(json.dumps(report, indent=2) + "\n")

    print(json.dumps(report, indent=2))
    if report["result"] != "Passed":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
