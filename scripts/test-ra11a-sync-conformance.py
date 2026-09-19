#!/usr/bin/env python3
"""RA11a: real Gate/FRF/PGlite materializer conformance coordinator."""

from __future__ import annotations

import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import uuid

from ra06c_campaign_config import (
    DEFAULT_SECRETS,
    campaign_environment,
    initialize,
    load_secrets,
)


ROOT = Path(__file__).resolve().parents[1]
COMPOSITION_PROBE = ROOT / "scripts/test-authorized-shape-composition.py"
CONFORMANCE = ROOT / "conformance/ra11a-sync"
DEFAULT_OUTPUT = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/evidence/"
    "ra-11a-sync-conformance/task-5-real-facade.json"
)
DEFAULT_DATA_DIR = ROOT / ".runtime/ra11a-data/conformance"
DATA_ROOT = (ROOT / ".runtime/ra11a-data").resolve()
BASH_TOOL = os.environ.get("RA06_TOOL_BASH", "bash")
EXPECTED_COUNTS = {
    "cases": 360,
    "case_evidence": 4_320,
    "documents": 2_880,
    "evidence_citations": 8_640,
    "evidence_states": 3,
}
MANAGED_SERVICES = {
    "db",
    "electric",
    "flint-gate",
    "flint-gate-init",
    "iggy-server",
    "kratos",
    "kratos-migrate",
    "realtime-fabric",
    "redis",
}


def sql_identifier(value: str) -> str:
    if re.fullmatch(r"[a-z_][a-z0-9_]*", value) is None:
        raise ValueError("campaign role is not a safe PostgreSQL identifier")
    return '"' + value.replace('"', '""') + '"'


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def has_failed_check(values: object) -> bool:
    if not isinstance(values, dict) or not values:
        return True
    return any(
        not isinstance(value, dict) or value.get("result") != "Passed"
        for value in values.values()
    )


def validated_data_dir(path: Path) -> Path:
    candidate = path if path.is_absolute() else ROOT / path
    resolved = candidate.resolve()
    if resolved == DATA_ROOT or DATA_ROOT not in resolved.parents:
        raise ValueError(
            "--data-dir must resolve to a non-root descendant of " + str(DATA_ROOT)
        )
    return resolved


def load_composition_probe():
    spec = importlib.util.spec_from_file_location(
        "ra11a_authorized_shape_composition", COMPOSITION_PROBE
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the RA05 composition probe")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


composition = load_composition_probe()


class SyncConformanceProbe(composition.Probe):
    def __init__(self, args):
        super().__init__(args)
        self.args.data_dir = validated_data_dir(self.args.data_dir)
        initialize(args.campaign_secrets)
        secrets = load_secrets(args.campaign_secrets)
        self.gate_authority_role = secrets["gate_authority_role"]
        self.gate_authority_password = secrets["gate_authority_password"]
        self.secret_values = tuple(
            sorted(set(secrets.values()), key=len, reverse=True)
        )
        self.stack_env = os.environ.copy()
        self.stack_env.update(
            campaign_environment(args.campaign_secrets, "http://electric:3000")
        )
        self.practice_id: str | None = None
        self.fixture_tag = "ra11a_" + uuid.uuid4().hex
        self.fixture_cleanup_required = False
        self.stack_cleanup_required = False
        self.gate_role_cleanup_required = False
        self.gate_role_created = False
        self.pre_run_gate_role_state: dict[str, object] | None = None
        self.pre_run_existing_services: set[str] = set()
        self.pre_run_running_services: set[str] = set()
        self.pre_run_container_state: dict[str, dict[str, str]] = {}
        self.materializer_result: dict[str, object] | None = None
        self.report.update(
            {
                "command": "python3 scripts/test-ra11a-sync-conformance.py",
                "dataset": {
                    "counts": EXPECTED_COUNTS,
                    "total_rows": sum(EXPECTED_COUNTS.values()),
                },
                "isolated_data_dir": str(self.args.data_dir.relative_to(ROOT)),
                "result": "Failed",
                "scope": (
                    "Synthetic Postgres transaction through real Kratos session, "
                    "Gate, FRF, Electric, PGlite Sync and durable PGlite NodeFS"
                ),
                "verification_tier": 1,
            }
        )

    def compose(self, *arguments: str, timeout: int = 180):
        process = subprocess.run(
            [BASH_TOOL, str(ROOT / "scripts/ra05-stack.sh"), *arguments],
            cwd=ROOT,
            env=self.stack_env,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        if process.returncode != 0:
            raise RuntimeError(
                "docker compose failed: " + self.redact(process.stderr.strip())
            )
        return process

    def redact(self, value: str) -> str:
        redacted = value
        for secret in self.secret_values:
            redacted = redacted.replace(secret, "[REDACTED]")
        return redacted

    def compose_services(self, *, all_containers: bool) -> set[str]:
        arguments = ["ps"]
        if all_containers:
            arguments.append("--all")
        arguments.extend(["--services"])
        if not all_containers:
            arguments.extend(["--status", "running"])
        output = self.compose(*arguments).stdout
        return {line.strip() for line in output.splitlines() if line.strip()}

    def compose_container_state(self) -> dict[str, dict[str, str]]:
        output = self.compose(
            "ps", "--all", "--no-trunc", "--format", "json"
        ).stdout
        entries: list[dict[str, object]] = []
        for line in output.splitlines():
            if line.strip():
                value = json.loads(line)
                entries.extend(value if isinstance(value, list) else [value])
        state: dict[str, dict[str, str]] = {}
        for entry in entries:
            service = entry.get("Service")
            if not isinstance(service, str) or service not in MANAGED_SERVICES:
                continue
            labels = {}
            if isinstance(entry.get("Labels"), str):
                labels = dict(
                    label.split("=", 1)
                    for label in entry["Labels"].split(",")
                    if "=" in label
                )
            state[service] = {
                "configHash": labels.get("com.docker.compose.config-hash", ""),
                "containerId": str(entry.get("ID", "")),
                "image": str(entry.get("Image", "")),
                "imageDigest": labels.get("com.docker.compose.image", ""),
                "mounts": ",".join(
                    sorted(filter(None, str(entry.get("Mounts", "")).split(",")))
                ),
                "networks": ",".join(
                    sorted(filter(None, str(entry.get("Networks", "")).split(",")))
                ),
                "state": str(entry.get("State", "")),
            }
        return state

    def sql(self, statement: str) -> str:
        process = subprocess.run(
            [
                BASH_TOOL,
                str(ROOT / "scripts/ra05-stack.sh"),
                "exec",
                "-T",
                "db",
                "psql",
                "-X",
                "-v",
                "ON_ERROR_STOP=1",
                "-U",
                "flint",
                "-d",
                "flint",
                "-Atq",
            ],
            cwd=ROOT,
            env=self.stack_env,
            input=statement,
            text=True,
            capture_output=True,
            timeout=120,
            check=False,
        )
        if process.returncode != 0:
            raise RuntimeError("psql failed: " + self.redact(process.stderr.strip()))
        return process.stdout.strip()

    def gate_role_state(self) -> dict[str, object] | None:
        role = sql_literal(self.gate_authority_role)
        output = self.sql(
            f"""
            SELECT COALESCE((
              SELECT json_build_object(
                'bypassRls', r.rolbypassrls,
                'canLogin', r.rolcanlogin,
                'createDb', r.rolcreatedb,
                'createRole', r.rolcreaterole,
                'inherit', r.rolinherit,
                'memberships', (
                  SELECT COALESCE(json_agg(parent.rolname ORDER BY parent.rolname), '[]'::json)
                  FROM pg_auth_members membership
                  JOIN pg_roles parent ON parent.oid = membership.roleid
                  WHERE membership.member = r.oid
                ),
                'replication', r.rolreplication,
                'superuser', r.rolsuper
              )
              FROM pg_roles r
              WHERE r.rolname = {role}
            )::text, 'null');
            """
        )
        return json.loads(output.splitlines()[-1])

    def prepare_gate_role(self) -> None:
        gate_role = sql_identifier(self.gate_authority_role)
        gate_password = sql_literal(self.gate_authority_password)
        self.pre_run_gate_role_state = self.gate_role_state()
        self.gate_role_cleanup_required = True
        if self.pre_run_gate_role_state is None:
            try:
                self.sql(
                    f"CREATE ROLE {gate_role} LOGIN PASSWORD "
                    f"{gate_password} NOSUPERUSER NOCREATEDB NOCREATEROLE "
                    "NOREPLICATION NOBYPASSRLS;"
                )
            except Exception:
                self.report["role_creation_failure_state"] = self.gate_role_state()
                raise
            self.gate_role_created = True
            self.sql(
                f"GRANT aso_authority_event_reader TO {gate_role};"
            )
        else:
            expected_attributes = {
                "bypassRls": False,
                "canLogin": True,
                "createDb": False,
                "createRole": False,
                "inherit": True,
                "replication": False,
                "superuser": False,
            }
            attributes_match = all(
                self.pre_run_gate_role_state.get(name) == value
                for name, value in expected_attributes.items()
            )
            memberships = self.pre_run_gate_role_state.get("memberships", [])
            if not attributes_match or "aso_authority_event_reader" not in memberships:
                raise RuntimeError(
                    "pre-existing campaign role does not match the restricted reader contract"
                )

    def prepare_stack(self) -> None:
        self.pre_run_container_state = self.compose_container_state()
        self.pre_run_existing_services = set(self.pre_run_container_state)
        self.pre_run_running_services = {
            service
            for service, state in self.pre_run_container_state.items()
            if state["state"] == "running"
        }
        self.stack_cleanup_required = True
        self.compose("stop", "realtime-fabric", "flint-gate")
        self.compose(
            "up",
            "-d",
            "db",
            "electric",
            "kratos",
            "iggy-server",
            "redis",
            "flint-gate-init",
        )
        self.prepare_gate_role()
        self.compose("up", "-d", "flint-gate")
        self.compose("up", "-d", "--no-deps", "realtime-fabric")
        for _ in range(80):
            try:
                status, _, payload = self.json_http(
                    composition.GATE + "/.well-known/jwks.json"
                )
                if status == 200 and payload.get("keys"):
                    break
            except (urllib.error.URLError, json.JSONDecodeError):
                pass
            time.sleep(0.25)
        else:
            raise RuntimeError("Gate did not become ready")
        self.check("gate_ready", True)
        for _ in range(80):
            process = subprocess.run(
                [
                    BASH_TOOL,
                    str(ROOT / "scripts/ra05-stack.sh"),
                    "exec",
                    "-T",
                    "realtime-fabric",
                    "curl",
                    "-fsS",
                    "http://127.0.0.1:8080/readyz",
                ],
                cwd=ROOT,
                env=self.stack_env,
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            if process.returncode == 0:
                break
            time.sleep(0.25)
        else:
            raise RuntimeError("FRF did not become ready")
        self.check("realtime_fabric_ready", True)

    def seed_fixture(self, identity_id: str) -> None:
        self.practice_id = self.practices[identity_id]
        practice = self.practice_id
        tag = self.fixture_tag
        self.fixture_cleanup_required = True
        self.sql(
            f"""
            BEGIN;
            SET LOCAL search_path=aso,public;
            INSERT INTO practices(id, name, key)
            VALUES ('{practice}', 'Synthetic RA11a Practice', '{tag}');
            INSERT INTO users(
              id, kratos_identity_id, practice_id, email, full_name
            ) VALUES (
              md5('{tag}:user')::uuid, '{identity_id}', '{practice}',
              '{tag}@example.invalid', 'Synthetic RA11a Surgeon'
            );
            INSERT INTO user_roles(user_id, role_id, practice_id)
            SELECT md5('{tag}:user')::uuid, id, '{practice}'
              FROM roles WHERE key='surgeon';
            INSERT INTO payers(id, name, key)
            VALUES (md5('{tag}:payer')::uuid, 'Synthetic RA11a Payer', '{tag}');
            INSERT INTO policy_types(id, name, key)
            VALUES (
              md5('{tag}:policy-type')::uuid,
              'Synthetic RA11a Policy Type {tag}', '{tag}'
            );
            INSERT INTO policies(
              id, policy_type_id, payer_id, name, policy_number, version,
              effective_from
            ) VALUES (
              md5('{tag}:policy')::uuid, md5('{tag}:policy-type')::uuid,
              md5('{tag}:payer')::uuid, 'Synthetic RA11a Policy',
              '{tag}', '1', '2000-01-01'
            );
            INSERT INTO policy_criteria(
              id, policy_id, section, ordinal, label, requirement
            )
            SELECT md5('{tag}:criterion:' || ordinal)::uuid,
                   md5('{tag}:policy')::uuid, 'ra11a', ordinal,
                   'Synthetic criterion ' || ordinal,
                   'Synthetic requirement ' || ordinal
            FROM generate_series(1, 12) ordinal;
            INSERT INTO document_types(id, name, key)
            VALUES (
              md5('{tag}:document-type')::uuid,
              'Synthetic RA11a Document Type {tag}', '{tag}'
            );
            INSERT INTO patients(
              id, practice_id, family_name, given_name, birth_date
            )
            SELECT md5('{tag}:patient:' || n)::uuid, '{practice}',
                   'Synthetic', 'Patient ' || n, '2000-01-01'
            FROM generate_series(1, 360) n;
            INSERT INTO cases(
              id, practice_id, patient_id, surgeon_id, payer_id,
              case_number, status
            )
            SELECT md5('{tag}:case:' || n)::uuid, '{practice}',
                   md5('{tag}:patient:' || n)::uuid,
                   md5('{tag}:user')::uuid, md5('{tag}:payer')::uuid,
                   '{tag}-' || n, 'evidence'
            FROM generate_series(1, 360) n;
            INSERT INTO documents(
              id, document_type_id, patient_id, case_id, name,
              effective_date, page_count
            )
            SELECT md5('{tag}:document:' || c || ':' || d)::uuid,
                   md5('{tag}:document-type')::uuid,
                   md5('{tag}:patient:' || c)::uuid,
                   md5('{tag}:case:' || c)::uuid,
                   'Synthetic document ' || c || '-' || d,
                   '2000-01-01', 2
            FROM generate_series(1, 360) c
            CROSS JOIN generate_series(1, 8) d;
            INSERT INTO case_evidence(
              id, case_id, policy_criterion_id, state
            )
            SELECT md5('{tag}:evidence:' || c || ':' || criterion)::uuid,
                   md5('{tag}:case:' || c)::uuid,
                   md5('{tag}:criterion:' || criterion)::uuid,
                   (ARRAY['met','gap','void'])[((criterion - 1) % 3) + 1]
            FROM generate_series(1, 360) c
            CROSS JOIN generate_series(1, 12) criterion;
            INSERT INTO evidence_citations(
              id, case_evidence_id, document_id, page_number, relevance
            )
            SELECT md5(
                     '{tag}:citation:' || c || ':' || criterion || ':' || citation
                   )::uuid,
                   md5('{tag}:evidence:' || c || ':' || criterion)::uuid,
                   md5(
                     '{tag}:document:' || c || ':' ||
                     (((criterion + citation - 2) % 8) + 1)
                   )::uuid,
                   citation, 'supports'
            FROM generate_series(1, 360) c
            CROSS JOIN generate_series(1, 12) criterion
            CROSS JOIN generate_series(1, 2) citation;
            COMMIT;
            """
        )
        counts = self.sql(
            f"SELECT "
            f"(SELECT count(*) FROM aso.cases WHERE practice_id='{practice}') || ',' || "
            f"(SELECT count(*) FROM aso.case_evidence WHERE practice_id='{practice}') || ',' || "
            f"(SELECT count(*) FROM aso.documents WHERE practice_id='{practice}') || ',' || "
            f"(SELECT count(*) FROM aso.evidence_citations WHERE practice_id='{practice}');"
        )
        self.check(
            "representative_dataset_committed",
            counts.splitlines()[-1] == "360,4320,2880,8640",
            observed=counts.splitlines()[-1],
        )

    def run_materializer(self, session_token: str) -> None:
        self.secret_values = tuple(
            sorted(
                set((*self.secret_values, session_token, "Bearer " + session_token)),
                key=len,
                reverse=True,
            )
        )
        if self.args.data_dir.exists():
            shutil.rmtree(self.args.data_dir)
        self.args.data_dir.parent.mkdir(parents=True, exist_ok=True)
        child = subprocess.run(
            [
                "node",
                "--expose-gc",
                "--experimental-strip-types",
                str(CONFORMANCE / "run.ts"),
            ],
            cwd=CONFORMANCE,
            input=json.dumps(
                {
                    "dataDir": str(self.args.data_dir.resolve()),
                    "expectedCounts": EXPECTED_COUNTS,
                    "gateUrl": composition.GATE + "/v1/shape",
                    "sessionToken": session_token,
                    "timeoutMs": self.args.timeout_seconds * 1_000,
                }
            ),
            text=True,
            capture_output=True,
            timeout=self.args.timeout_seconds + 30,
            check=False,
        )
        redacted_stdout = self.redact(child.stdout)
        if not redacted_stdout.strip():
            raise RuntimeError(
                "materializer emitted no JSON: "
                + self.redact(child.stderr.strip())[:500]
            )
        self.materializer_result = json.loads(redacted_stdout)
        self.report["materializer"] = self.materializer_result
        self.report["materializer_exit_code"] = child.returncode
        self.report["materializer_stderr"] = self.redact(child.stderr.strip())[:500]
        expected_exit = 0 if self.materializer_result.get("result") == "Passed" else 2
        self.check(
            "materializer_exit_matches_result",
            child.returncode == expected_exit,
            exit_code=child.returncode,
            materializer_result=self.materializer_result.get("result"),
        )

    def exercise(self) -> None:
        self.prepare_stack()
        identity_id = self.create_identity_session("ra11a")
        self.seed_fixture(identity_id)
        self.start_grant_callback()
        self.run_materializer(self.sessions[identity_id]["token"])

    def cleanup_fixture(self) -> dict[str, int]:
        if not self.fixture_cleanup_required or self.practice_id is None:
            return {}
        practice = self.practice_id
        tag = self.fixture_tag
        remaining = self.sql(
            f"""
            BEGIN;
            SET LOCAL search_path=aso,public;
            -- Synthetic fixture teardown may cascade through authority-owned
            -- rows. The command path above is the behavior under test; this
            -- transaction removes only the isolated practice created here.
            SET LOCAL session_replication_role = replica;
            DELETE FROM evidence_citations WHERE practice_id='{practice}';
            DELETE FROM case_evidence WHERE practice_id='{practice}';
            DELETE FROM documents WHERE practice_id='{practice}';
            DELETE FROM cases WHERE practice_id='{practice}';
            DELETE FROM patients WHERE practice_id='{practice}';
            DELETE FROM policy_criteria WHERE policy_id=md5('{tag}:policy')::uuid;
            DELETE FROM policies WHERE id=md5('{tag}:policy')::uuid;
            DELETE FROM policy_types WHERE id=md5('{tag}:policy-type')::uuid;
            DELETE FROM document_types WHERE id=md5('{tag}:document-type')::uuid;
            DELETE FROM users WHERE practice_id='{practice}';
            DELETE FROM payers WHERE id=md5('{tag}:payer')::uuid;
            DELETE FROM practices WHERE id='{practice}';
            COMMIT;
            SELECT json_build_object(
              'cases', (SELECT count(*) FROM aso.cases WHERE practice_id='{practice}'),
              'case_evidence', (SELECT count(*) FROM aso.case_evidence WHERE practice_id='{practice}'),
              'documents', (SELECT count(*) FROM aso.documents WHERE practice_id='{practice}'),
              'evidence_citations', (SELECT count(*) FROM aso.evidence_citations WHERE practice_id='{practice}'),
              'patients', (SELECT count(*) FROM aso.patients WHERE practice_id='{practice}'),
              'users', (SELECT count(*) FROM aso.users WHERE practice_id='{practice}'),
              'practices', (SELECT count(*) FROM aso.practices WHERE id='{practice}'),
              'policy_criteria', (SELECT count(*) FROM aso.policy_criteria WHERE policy_id=md5('{tag}:policy')::uuid),
              'policies', (SELECT count(*) FROM aso.policies WHERE id=md5('{tag}:policy')::uuid),
              'policy_types', (SELECT count(*) FROM aso.policy_types WHERE id=md5('{tag}:policy-type')::uuid),
              'document_types', (SELECT count(*) FROM aso.document_types WHERE id=md5('{tag}:document-type')::uuid),
              'payers', (SELECT count(*) FROM aso.payers WHERE id=md5('{tag}:payer')::uuid)
            )::text;
            """
        )
        counts = json.loads(remaining.splitlines()[-1])
        if not counts or any(value != 0 for value in counts.values()):
            raise RuntimeError("synthetic relational cleanup left rows: " + json.dumps(counts))
        self.fixture_cleanup_required = False
        return counts

    def cleanup_gate_role(self) -> bool:
        if not self.gate_role_cleanup_required:
            return True
        if self.gate_role_created:
            self.sql(
                f"DROP ROLE IF EXISTS {sql_identifier(self.gate_authority_role)};"
            )
        post_role_state = self.gate_role_state()
        restored = post_role_state == self.pre_run_gate_role_state
        self.report["role_state"] = {
            "post": post_role_state,
            "pre": self.pre_run_gate_role_state,
            "restored": restored,
        }
        return restored

    @staticmethod
    def service_cleanup_succeeded(
        state_restored: bool, command_failed: bool
    ) -> bool:
        return state_restored and not command_failed

    def cleanup(self) -> None:
        try:
            remaining_counts = self.cleanup_fixture()
            self.report["cleanup"]["synthetic_relational_rows"] = "Passed"
            self.report["remaining_relational_rows"] = remaining_counts
        except Exception as error:
            self.report["cleanup"]["synthetic_relational_rows"] = "Failed"
            self.report["cleanup"]["synthetic_relational_rows_error"] = str(error)
        try:
            if self.args.data_dir.exists():
                shutil.rmtree(self.args.data_dir)
            store_removed = not self.args.data_dir.exists()
            self.report["cleanup"]["isolated_pglite_store"] = (
                "Passed" if store_removed else "Failed"
            )
        except Exception as error:
            self.report["cleanup"]["isolated_pglite_store"] = "Failed"
            self.report["cleanup"]["isolated_pglite_store_error"] = self.redact(
                str(error)
            )
        service_cleanup_passed = not self.stack_cleanup_required
        service_cleanup_command_failed = False
        role_cleanup_passed = not self.gate_role_cleanup_required
        if self.stack_cleanup_required:
            try:
                self.compose("stop", "realtime-fabric", "flint-gate")
            except Exception as error:
                service_cleanup_command_failed = True
                self.report["cleanup"]["campaign_services_error"] = self.redact(
                    str(error)
                )
        if self.gate_role_cleanup_required:
            try:
                role_cleanup_passed = self.cleanup_gate_role()
            except Exception as error:
                self.report["cleanup"]["gate_role_error"] = self.redact(str(error))
                self.report["role_state"] = {
                    "pre": self.pre_run_gate_role_state,
                    "restored": False,
                }
        if self.stack_cleanup_required:
            service_state: dict[str, object] = {
                "managed": sorted(MANAGED_SERVICES),
                "preExisting": sorted(
                    self.pre_run_existing_services.intersection(MANAGED_SERVICES)
                ),
                "preRunning": sorted(
                    self.pre_run_running_services.intersection(MANAGED_SERVICES)
                ),
                "preContainers": self.pre_run_container_state,
            }
            try:
                running = self.compose_services(all_containers=False)
                stopped = sorted(
                    running.intersection(MANAGED_SERVICES)
                    - self.pre_run_running_services
                )
                if stopped:
                    self.compose("stop", *stopped)
                existing = self.compose_services(all_containers=True)
                removed = sorted(
                    existing.intersection(MANAGED_SERVICES)
                    - self.pre_run_existing_services
                )
                if removed:
                    self.compose("rm", "-f", "-s", *removed)
                running = self.compose_services(all_containers=False)
                restarted = sorted(
                    self.pre_run_running_services.intersection(MANAGED_SERVICES)
                    - running
                )
                if restarted:
                    self.compose("start", *restarted)
                post_existing = self.compose_services(all_containers=True)
                post_running = self.compose_services(all_containers=False)
                post_container_state = self.compose_container_state()
                state_restored = (
                    post_existing.intersection(MANAGED_SERVICES)
                    == self.pre_run_existing_services.intersection(MANAGED_SERVICES)
                    and post_running.intersection(MANAGED_SERVICES)
                    == self.pre_run_running_services.intersection(MANAGED_SERVICES)
                    and post_container_state == self.pre_run_container_state
                )
                service_cleanup_passed = self.service_cleanup_succeeded(
                    state_restored, service_cleanup_command_failed
                )
                service_state.update(
                    {
                        "postContainers": post_container_state,
                        "postExisting": sorted(
                            post_existing.intersection(MANAGED_SERVICES)
                        ),
                        "postRunning": sorted(
                            post_running.intersection(MANAGED_SERVICES)
                        ),
                        "removed": removed,
                        "restarted": restarted,
                        "restored": state_restored,
                        "stopped": stopped,
                    }
                )
            except Exception as error:
                service_cleanup_passed = False
                service_state["error"] = self.redact(str(error))
                service_state["restored"] = False
            self.report["service_state"] = service_state
        self.report["cleanup"]["campaign_services"] = (
            "Passed" if service_cleanup_passed and role_cleanup_passed else "Failed"
        )
        try:
            if self.callback is not None:
                self.callback.shutdown()
                self.callback.server_close()
            if self.callback_thread is not None:
                self.callback_thread.join(timeout=5)
            callback_stopped = (
                self.callback_thread is None or not self.callback_thread.is_alive()
            )
            self.report["cleanup"]["grant_callback"] = (
                "Passed" if callback_stopped else "Failed"
            )
        except Exception as error:
            self.report["cleanup"]["grant_callback"] = "Failed"
            self.report["cleanup"]["grant_callback_error"] = self.redact(str(error))
        deleted = 0
        identity_errors: list[str] = []
        for identity_id in reversed(self.identities):
            try:
                status, _, _ = self.http(
                    composition.KRATOS_ADMIN + "/admin/identities/" + identity_id,
                    "DELETE",
                )
                if status == 204:
                    deleted += 1
                else:
                    identity_errors.append(f"{identity_id}: HTTP {status}")
            except Exception as error:
                identity_errors.append(f"{identity_id}: {self.redact(str(error))}")
        self.report["cleanup"]["synthetic_identities"] = (
            "Passed" if deleted == len(self.identities) else "Failed"
        )
        self.report["cleanup"]["deleted_identity_count"] = deleted
        if identity_errors:
            self.report["cleanup"]["synthetic_identity_errors"] = identity_errors

    def run(self) -> int:
        failure: Exception | None = None
        try:
            self.exercise()
            materializer_status = (
                self.materializer_result or {"result": "Failed"}
            ).get("result")
            self.report["result"] = materializer_status
        except Exception as error:
            failure = error
            self.report["failure"] = (
                type(error).__name__ + ": " + self.redact(str(error))
            )
        finally:
            self.cleanup()
            failed_checks = has_failed_check(self.report["checks"])
            if any(value == "Failed" for value in self.report["cleanup"].values()):
                self.report["result"] = "Failed"
            if failed_checks:
                self.report["result"] = "Failed"
            self.report["observed_at"] = datetime.datetime.now(
                datetime.timezone.utc
            ).isoformat()
            self.args.output.parent.mkdir(parents=True, exist_ok=True)
            self.args.output.write_text(json.dumps(self.report, indent=2) + "\n")
        print(
            json.dumps(
                {
                    "cleanup": self.report["cleanup"],
                    "output": str(self.args.output),
                    "result": self.report["result"],
                },
                indent=2,
            )
        )
        if failure is not None or self.report["result"] == "Failed":
            return 1
        if self.report["result"] == "Blocked":
            return 2
        return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument("--callback-port", type=int, default=8788)
    root.add_argument("--campaign-secrets", type=Path, default=DEFAULT_SECRETS)
    root.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    root.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    root.add_argument("--timeout-seconds", type=int, default=120)
    return root


def main() -> int:
    return SyncConformanceProbe(parser().parse_args()).run()


if __name__ == "__main__":
    raise SystemExit(main())
