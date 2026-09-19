#!/usr/bin/env python3
"""RA04 T1: practice derivation on fresh and upgraded disposable databases.

Requires the local Docker Compose PostgreSQL service. The fixture creates two
databases and one login with synthetic data, exercises the seven established
derivation cases through a non-owner NOBYPASSRLS connection, records a redacted
receipt, and removes every resource it created.
"""

import argparse
import datetime
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import urllib.parse
import uuid


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants/task-4-practice-derivation.json"


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


class Probe:
    def __init__(self, args):
        self.args = args
        self.output = args.output
        suffix = uuid.uuid4().hex
        self.databases = {
            "fresh": f"synthetic_ra04_fresh_{suffix}",
            "upgrade": f"synthetic_ra04_upgrade_{suffix}",
        }
        self.login = f"synthetic_ra04_writer_{suffix}"
        self.password = secrets.token_urlsafe(36)
        self.created_databases = []
        self.created_login = False
        self.stage = "initialization"
        self.report = {
            "result": "Failed",
            "verification_tier": 1,
            "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": "Seven practice-derivation cases on fresh and upgraded schema through a non-owner NOBYPASSRLS login",
            "command": "python3 scripts/test-practice-derivation.py --output <receipt>",
            "modes": {},
            "cleanup": {},
            "unverified": [
                "Electric delivery is outside this database-boundary fixture.",
                "Production deployment roles and physical clients are outside this synthetic local integration run.",
            ],
        }

    def admin_sql(self, database, statement, required=True):
        completed = subprocess.run(
            [
                "docker", "compose", "exec", "-T", "db", "psql",
                "-U", self.args.postgres_user, "-X", "-A", "-t", "-q",
                "-v", "ON_ERROR_STOP=1", "-d", database,
            ],
            cwd=ROOT,
            input=statement,
            text=True,
            capture_output=True,
            timeout=90,
        )
        if required and completed.returncode:
            diagnostic = "\n".join(completed.stderr.strip().splitlines()[-6:])
            raise RuntimeError("admin_database_statement_failed:" + diagnostic)
        return completed

    def writer_sql(self, database, identity_id, statement, required=True):
        command = [
            "docker", "compose", "exec", "-T", "-e",
            "PGPASSWORD=" + self.password, "db", "psql", "-h", "127.0.0.1",
            "-U", self.login, "-X", "-A", "-t", "-q", "-v",
            "ON_ERROR_STOP=1", "-d", database,
        ]
        sql = (
            "SET search_path=aso,public; "
            + "SET aso.kratos_identity_id=" + literal(identity_id) + ";\n"
            + statement
        )
        completed = subprocess.run(
            command,
            cwd=ROOT,
            input=sql,
            text=True,
            capture_output=True,
            timeout=60,
        )
        if required and completed.returncode:
            diagnostic = "\n".join(completed.stderr.strip().splitlines()[-6:])
            raise RuntimeError("restricted_database_statement_failed:" + diagnostic)
        return completed

    def setup_login(self):
        self.stage = "create_restricted_login"
        self.admin_sql(
            "postgres",
            "CREATE ROLE " + identifier(self.login)
            + " LOGIN PASSWORD " + literal(self.password)
            + " NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;",
        )
        self.created_login = True

    def ids(self):
        return {name: str(uuid.uuid4()) for name in [
            "practice_a", "practice_b", "practice_c", "user", "identity",
            "patient", "case", "payer", "policy_type", "policy",
            "criterion_primary", "criterion_derived", "criterion_false",
            "document", "evidence_primary", "citation_primary",
            "evidence_derived", "evidence_false", "document_unattached",
            "citation_derived",
        ]}

    def parent_seed(self, values):
        return f"""
            SET search_path=aso,public;
            INSERT INTO practices(id,name,key) VALUES
              ('{values['practice_a']}','Synthetic RA04 A','ra04-a-{values['practice_a'][:8]}'),
              ('{values['practice_b']}','Synthetic RA04 B','ra04-b-{values['practice_b'][:8]}'),
              ('{values['practice_c']}','Synthetic RA04 C','ra04-c-{values['practice_c'][:8]}');
            INSERT INTO users(id,kratos_identity_id,practice_id,email,full_name)
              VALUES ('{values['user']}','{values['identity']}','{values['practice_a']}',
                      'synthetic-ra04@example.invalid','Synthetic RA04 Writer');
            INSERT INTO user_roles(user_id,role_id,practice_id)
              SELECT '{values['user']}',id,practice_id FROM roles
              CROSS JOIN (VALUES ('{values['practice_a']}'::uuid),('{values['practice_b']}'::uuid)) p(practice_id)
              WHERE key='surgeon';
            INSERT INTO patients(id,practice_id,family_name,given_name,birth_date)
              VALUES ('{values['patient']}','{values['practice_a']}','Synthetic','Fixture','2000-01-01');
            INSERT INTO payers(id,name,key) VALUES
              ('{values['payer']}','Synthetic RA04 Payer','ra04-payer-{values['payer'][:8]}');
            INSERT INTO policy_types(id,name,key) VALUES
              ('{values['policy_type']}','Synthetic RA04 Policy','ra04-policy-{values['policy_type'][:8]}');
            INSERT INTO policies(id,policy_type_id,payer_id,name,policy_number,version,effective_from)
              VALUES ('{values['policy']}','{values['policy_type']}','{values['payer']}',
                      'Synthetic RA04 Policy','RA04','1','2026-01-01');
            INSERT INTO policy_criteria(id,policy_id,section,ordinal,label,requirement) VALUES
              ('{values['criterion_primary']}','{values['policy']}','1',1,'Synthetic primary','Synthetic requirement'),
              ('{values['criterion_derived']}','{values['policy']}','1',2,'Synthetic derived','Synthetic requirement'),
              ('{values['criterion_false']}','{values['policy']}','1',3,'Synthetic false','Synthetic requirement');
            INSERT INTO cases(id,practice_id,patient_id,surgeon_id,payer_id,case_number)
              VALUES ('{values['case']}','{values['practice_a']}','{values['patient']}',
                      '{values['user']}','{values['payer']}','RA04-{values['case'][:8]}');
        """

    def legacy_child_seed(self, values):
        return f"""
            SET search_path=aso,public;
            INSERT INTO documents(id,document_type_id,patient_id,case_id,name,effective_date,data)
              SELECT '{values['document']}',id,'{values['patient']}','{values['case']}',
                     'Synthetic source','2026-01-01',
                     '{{"modality":"MRI","body_region":"spine","impression":"synthetic"}}'::jsonb
                FROM document_types WHERE key='mri-report';
            INSERT INTO case_evidence(id,case_id,criterion_id,state)
              VALUES ('{values['evidence_primary']}','{values['case']}',
                      '{values['criterion_primary']}','met');
            INSERT INTO evidence_citations(id,case_evidence_id,document_id,page_number)
              VALUES ('{values['citation_primary']}','{values['evidence_primary']}',
                      '{values['document']}',1);
        """

    def grant_writer(self, database):
        self.admin_sql(database, f"""
            GRANT USAGE ON SCHEMA aso TO {identifier(self.login)};
            GRANT SELECT ON ALL TABLES IN SCHEMA aso TO {identifier(self.login)};
            GRANT INSERT, UPDATE, DELETE ON aso.cases, aso.patients, aso.case_evidence,
              aso.evidence_citations, aso.documents TO {identifier(self.login)};
        """)
        posture = self.admin_sql("postgres", f"""
            SELECT rolcanlogin AND NOT (rolsuper OR rolbypassrls OR rolcreatedb
              OR rolcreaterole OR rolreplication)
              FROM pg_roles WHERE rolname={literal(self.login)};
        """).stdout.strip()
        if posture != "t":
            raise AssertionError("restricted_login_posture")

    def scalar(self, database, values, sql):
        return self.writer_sql(database, values["identity"], sql).stdout.strip()

    def check(self, checks, label, condition, observed=None):
        checks[label] = {
            "result": "Passed" if condition else "Failed",
            "observed": observed,
        }
        if not condition:
            raise AssertionError(label)

    def exercise_mode(self, mode):
        database = self.databases[mode]
        values = self.ids()
        checks = {}
        self.stage = mode + "_create_database"
        self.admin_sql("postgres", "CREATE DATABASE " + identifier(database) + ";")
        self.created_databases.append(database)
        self.stage = mode + "_load_schema"
        self.admin_sql(database, (ROOT / "docs/design/schema/schema.sql").read_text())
        self.stage = mode + "_seed_parents"
        self.admin_sql(database, self.parent_seed(values))
        if mode == "upgrade":
            self.stage = mode + "_seed_legacy_children"
            self.admin_sql(database, self.legacy_child_seed(values))
        self.stage = mode + "_apply_derivation_migration"
        self.admin_sql(database, (ROOT / "docker/bootstrap/15-denormalize-practice-id.sql").read_text())
        if mode == "fresh":
            self.stage = mode + "_seed_derived_children"
            self.admin_sql(database, self.legacy_child_seed(values))
        self.stage = mode + "_grant_restricted_writer"
        self.grant_writer(database)
        self.stage = mode + "_exercise_derivation_cases"

        backfill = self.scalar(database, values, f"""
            SELECT count(*) FROM case_evidence ce
            JOIN evidence_citations ec ON ec.case_evidence_id=ce.id
            JOIN documents d ON d.id=ec.document_id
            WHERE ce.id='{values['evidence_primary']}'
              AND ce.practice_id='{values['practice_a']}'
              AND ec.practice_id='{values['practice_a']}'
              AND d.practice_id='{values['practice_a']}';
        """)
        self.check(checks, "migration_or_fresh_seed_has_derived_baseline", backfill == "1", backfill)

        self.writer_sql(database, values["identity"], f"""
            INSERT INTO case_evidence(id,case_id,criterion_id,state)
              VALUES ('{values['evidence_derived']}','{values['case']}',
                      '{values['criterion_derived']}','gap');
        """)
        observed = self.scalar(database, values, f"SELECT practice_id FROM case_evidence WHERE id='{values['evidence_derived']}';")
        self.check(checks, "T1_insert_without_practice_is_derived", observed == values["practice_a"], "practice_a")

        self.writer_sql(database, values["identity"], f"""
            INSERT INTO case_evidence(id,case_id,criterion_id,state,practice_id)
              VALUES ('{values['evidence_false']}','{values['case']}',
                      '{values['criterion_false']}','void','{values['practice_b']}');
        """)
        observed = self.scalar(database, values, f"SELECT practice_id FROM case_evidence WHERE id='{values['evidence_false']}';")
        self.check(checks, "T2_insert_false_practice_is_overwritten", observed == values["practice_a"], "practice_a")

        self.writer_sql(database, values["identity"], f"UPDATE case_evidence SET practice_id='{values['practice_b']}' WHERE id='{values['evidence_false']}';")
        observed = self.scalar(database, values, f"SELECT practice_id FROM case_evidence WHERE id='{values['evidence_false']}';")
        self.check(checks, "T3_direct_practice_update_is_forced_back", observed == values["practice_a"], "practice_a")

        self.writer_sql(database, values["identity"], f"""
            INSERT INTO documents(id,document_type_id,patient_id,case_id,name,effective_date,data,practice_id)
              SELECT '{values['document_unattached']}',id,'{values['patient']}',NULL,
                     'Synthetic unattached','2026-01-02',
                     '{{"modality":"MRI","body_region":"spine","impression":"synthetic"}}'::jsonb,
                     '{values['practice_b']}'
                FROM document_types WHERE key='mri-report';
        """)
        observed = self.scalar(database, values, f"SELECT practice_id FROM documents WHERE id='{values['document_unattached']}';")
        self.check(checks, "T5_unattached_document_derives_from_patient", observed == values["practice_a"], "practice_a")

        self.writer_sql(database, values["identity"], f"""
            INSERT INTO evidence_citations(id,case_evidence_id,document_id,page_number,practice_id)
              VALUES ('{values['citation_derived']}','{values['evidence_derived']}',
                      '{values['document']}',2,'{values['practice_b']}');
        """)
        observed = self.scalar(database, values, f"SELECT practice_id FROM evidence_citations WHERE id='{values['citation_derived']}';")
        self.check(checks, "T6_citation_inherits_evidence_practice", observed == values["practice_a"], "practice_a")

        transitions = []
        for destination in [values["practice_b"], values["practice_a"]]:
            self.writer_sql(database, values["identity"], f"UPDATE cases SET practice_id='{destination}' WHERE id='{values['case']}';")
            count = self.scalar(database, values, f"""
                SELECT count(*) FROM case_evidence ce
                JOIN evidence_citations ec ON ec.case_evidence_id=ce.id
                WHERE ce.case_id='{values['case']}' AND ce.practice_id='{destination}'
                  AND ec.practice_id='{destination}';
            """)
            transitions.append(count == "2")
        self.check(checks, "T4_case_move_cascades_children_both_directions", all(transitions), transitions)

        transitions = []
        for destination in [values["practice_b"], values["practice_a"]]:
            self.writer_sql(database, values["identity"], f"UPDATE patients SET practice_id='{destination}' WHERE id='{values['patient']}';")
            count = self.scalar(database, values, f"SELECT count(*) FROM documents WHERE patient_id='{values['patient']}' AND practice_id='{destination}';")
            transitions.append(count == "2")
        self.check(checks, "T7_patient_move_cascades_documents_both_directions", all(transitions), transitions)

        denied = self.writer_sql(
            database,
            values["identity"],
            f"UPDATE cases SET practice_id='{values['practice_c']}' WHERE id='{values['case']}';",
            required=False,
        )
        self.check(checks, "cases_rls_refuses_unowned_practice", denied.returncode != 0, denied.returncode)
        trigger_count = self.admin_sql(database, """
            SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='aso' AND c.relname='evidence_states' AND NOT t.tgisinternal;
        """).stdout.strip()
        state_keys = self.admin_sql(database, "SELECT string_agg(key,',' ORDER BY key) FROM aso.evidence_states;").stdout.strip()
        self.check(checks, "evidence_states_remains_approved_reference_without_trigger", trigger_count == "0" and state_keys == "gap,met,void", {"trigger_count": trigger_count, "keys": state_keys})

        self.report["modes"][mode] = {
            "result": "Passed",
            "install": "schema then derivation migration" if mode == "fresh" else "schema and legacy rows then derivation migration",
            "restricted_login": "non-owner NOSUPERUSER NOBYPASSRLS",
            "checks": checks,
        }

    def cleanup(self):
        for database in reversed(self.created_databases):
            result = self.admin_sql(
                "postgres",
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname="
                + literal(database) + " AND pid <> pg_backend_pid(); DROP DATABASE "
                + identifier(database) + ";",
                required=False,
            )
            self.report["cleanup"][database] = "Passed" if result.returncode == 0 else "Failed"
        if self.created_login:
            result = self.admin_sql("postgres", "DROP ROLE " + identifier(self.login) + ";", required=False)
            self.report["cleanup"]["login"] = "Passed" if result.returncode == 0 else "Failed"

    def run(self):
        error = None
        try:
            self.setup_login()
            for mode in ["fresh", "upgrade"]:
                self.exercise_mode(mode)
            self.report["result"] = "Passed"
        except Exception as caught:
            error = caught
            self.report["failure"] = type(caught).__name__ + ":" + str(caught)
            self.report["failure_stage"] = self.stage
        finally:
            self.cleanup()
            if any(value != "Passed" for value in self.report["cleanup"].values()):
                self.report["result"] = "Failed"
            self.output.parent.mkdir(parents=True, exist_ok=True)
            self.output.write_text(json.dumps(self.report, indent=2) + "\n")
        print(json.dumps({
            "result": self.report["result"],
            "modes": {key: value.get("result") for key, value in self.report["modes"].items()},
            "cleanup": self.report["cleanup"],
        }, indent=2))
        if error is not None or self.report["result"] != "Passed":
            return 1
        return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return Probe(parser.parse_args()).run()


if __name__ == "__main__":
    sys.exit(main())
