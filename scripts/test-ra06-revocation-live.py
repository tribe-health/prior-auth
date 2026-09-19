#!/usr/bin/env python3
"""RA06c task 2.1: bound four revocation paths across two Gate replicas."""

from __future__ import annotations

import argparse
import http.client
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from ra06c_campaign_config import campaign_environment, load_secrets, resolved_compose


ROOT = Path(__file__).resolve().parents[1]
BASH_TOOL = os.environ.get("RA06_TOOL_BASH", "bash")
BASELINE = ROOT / "scripts/test-authorized-shape-transition.py"
DEFAULT_OUTPUT = ROOT / (
    ".kbd-orchestrator/phases/runtime-architecture/children/"
    "ra06-revocation-contract-repair/evidence/ra06c04/task-3-live-revocation.json"
)
BOUND_MS = 5_000
CLOCK_ALLOWANCE_MS = 1_000
ACTIVE_TRIGGER_OBSERVATION_LEAD_MS = 100
ACTION_TRIGGER_OBSERVATION_LEAD_MS = 1_000
GATE_URLS = ("http://127.0.0.1:4456", "http://127.0.0.1:4458")
FRF_STREAM_FIELD = re.compile(
    r'(?P<name>[a-z_]+)=(?:"(?P<quoted>[^"]*)"|(?P<bare>[^\s]+))'
)
ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;]*m")
FRF_TERMINAL_EVENTS = {"cancelled", "completed", "dropped"}


def response_active_at_trigger(
    trigger_monotonic: float, end_observed_monotonic: object
) -> bool:
    return end_observed_monotonic is None or float(end_observed_monotonic) >= trigger_monotonic


def conservative_expiry_trigger(
    expiry_epoch: float,
    reference_epoch: float,
    reference_monotonic: float,
    lead_ms: int = ACTIVE_TRIGGER_OBSERVATION_LEAD_MS,
) -> tuple[float, int]:
    """Map verified expiry to an earlier host-monotonic measurement boundary."""
    lead_seconds = lead_ms / 1_000
    return (
        reference_monotonic + (expiry_epoch - reference_epoch) - lead_seconds,
        round((expiry_epoch - lead_seconds) * 1_000_000_000),
    )


def load_baseline():
    spec = importlib.util.spec_from_file_location("ra06_transition_baseline", BASELINE)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the RA05 transition probe")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


baseline = load_baseline()
composition = baseline.composition


class SlowElectricProxy:
    """Forward real Electric bytes, then hold the protected suffix open."""

    def __init__(self, port: int, hold_seconds: float):
        self.hold_seconds = hold_seconds
        self._lock = threading.Lock()
        self._armed_marker: bytes | None = None
        self._armed_label: str | None = None
        self.first_prefix = threading.Event()
        self.observations: dict[str, dict[str, object]] = {}
        owner = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def do_GET(self):
                owner.forward(self)

            def log_message(self, *_args):
                pass

        self.server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def start(self) -> None:
        self.thread.start()

    def arm(self, label: str, marker: str) -> None:
        with self._lock:
            if self._armed_marker is not None:
                raise RuntimeError("slow Electric proxy already has an armed response")
            self._armed_label = label
            self._armed_marker = marker.encode()
            self.first_prefix.clear()

    def forward(self, handler: BaseHTTPRequestHandler) -> None:
        request = urllib.request.Request(
            "http://127.0.0.1:3000" + handler.path, method="GET"
        )
        for name, value in handler.headers.items():
            if name.lower() not in {"connection", "host", "transfer-encoding"}:
                request.add_header(name, value)
        try:
            response = urllib.request.urlopen(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            status = response.status
            headers = {name.lower(): value for name, value in response.headers.items()}
            body = response.read()

        with self._lock:
            label = self._armed_label
            marker = self._armed_marker
            if marker is not None:
                self._armed_label = None
                self._armed_marker = None

        handler.send_response(status)
        for name in (
            "content-type",
            "electric-handle",
            "electric-offset",
            "electric-up-to-date",
        ):
            if name in headers:
                handler.send_header(name, headers[name])
        handler.send_header("Content-Length", str(len(body)))
        handler.end_headers()

        if marker is None or label is None:
            handler.wfile.write(body)
            return
        marker_index = body.find(marker)
        if marker_index <= 0:
            self.observations[label] = {
                "upstream_status": status,
                "upstream_body_bytes": len(body),
                "marker_found": False,
            }
            self.first_prefix.set()
            handler.wfile.write(body)
            return
        prefix = body[:marker_index]
        suffix = body[marker_index:]
        self.observations[label] = {
            "upstream_status": status,
            "upstream_body_bytes": len(body),
            "prefix_bytes": len(prefix),
            "held_suffix_bytes": len(suffix),
            "marker_found": True,
        }
        try:
            handler.wfile.write(prefix)
            handler.wfile.flush()
            self.first_prefix.set()
            time.sleep(self.hold_seconds)
            handler.wfile.write(suffix)
            handler.wfile.flush()
            self.observations[label]["suffix_write"] = "accepted"
        except (BrokenPipeError, ConnectionResetError):
            self.observations[label]["suffix_write"] = "downstream_closed"

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)


class RevocationProbe(baseline.TransitionProbe):
    def __init__(self, args):
        super().__init__(args)
        self.fixture.update(
            {
                "case_c": str(uuid.uuid4()),
                "case_d": str(uuid.uuid4()),
                "patient_c": str(uuid.uuid4()),
                "patient_d": str(uuid.uuid4()),
                "user_c": str(uuid.uuid4()),
                "user_d": str(uuid.uuid4()),
            }
        )
        campaign_secrets = load_secrets(args.campaign_secrets)
        self.runtime_role = campaign_secrets["runtime_role"]
        self.runtime_password = campaign_secrets["runtime_password"]
        self.authority_role = campaign_secrets["authority_role"]
        self.authority_password = campaign_secrets["authority_password"]
        self.gate_authority_role = campaign_secrets["gate_authority_role"]
        self.gate_authority_password = campaign_secrets["gate_authority_password"]
        self.stack_env = os.environ.copy()
        self.stack_env.update(
            campaign_environment(
                args.campaign_secrets,
                f"http://host.docker.internal:{args.electric_proxy_port}",
            )
        )
        self.proxy: SlowElectricProxy | None = None
        self.stack_started = False
        self.report.update(
            {
                "scope": (
                    "Application logout, direct Kratos revocation, membership change, "
                    "and expiry through ASO, two Gate replicas, Redis, FRF, and Electric"
                ),
                "command": "python3 scripts/test-ra06-revocation-live.py",
                "candidate_digest": os.environ.get("RA06_CANDIDATE_DIGEST"),
                "server_bound_ms": BOUND_MS,
                "gate_replicas": list(GATE_URLS),
                "timings": {},
                "contract_observations": [],
                "proxy_observations": {},
                "frf_stream_observations": {},
            }
        )

    def compose(self, *arguments: str, timeout: int = 120) -> subprocess.CompletedProcess:
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
                "docker compose failed: "
                + " ".join(arguments)
                + ": "
                + (process.stderr or process.stdout).strip()
            )
        return process

    def frf_stream_events(self) -> list[dict[str, object]]:
        """Read correlation-safe lifecycle events emitted by the protected FRF body."""
        output = self.compose("logs", "--no-color", "realtime-fabric", timeout=30).stdout
        events: list[dict[str, object]] = []
        for line in output.splitlines():
            line = ANSI_ESCAPE.sub("", line)
            if "protected shape stream lifecycle" not in line:
                continue
            fields = {
                match.group("name"): match.group("quoted") or match.group("bare")
                for match in FRF_STREAM_FIELD.finditer(line)
            }
            required = {
                "event",
                "request_id",
                "grant_expiry_epoch_seconds",
                "observed_epoch_ns",
                "elapsed_monotonic_ns",
                "frames",
            }
            if not required.issubset(fields):
                continue
            events.append(
                {
                    "event": fields["event"],
                    "request_id": fields["request_id"],
                    "grant_expiry_epoch_seconds": int(
                        fields["grant_expiry_epoch_seconds"]
                    ),
                    "observed_epoch_ns": int(fields["observed_epoch_ns"]),
                    "elapsed_monotonic_ns": int(fields["elapsed_monotonic_ns"]),
                    "frames": int(fields["frames"]),
                }
            )
        return events

    def wait_for_frf_stream(
        self,
        opened_after_epoch_ns: int,
        request_id: str | None = None,
        require_terminal: bool = False,
        deadline_monotonic: float | None = None,
    ) -> list[dict[str, object]]:
        deadline = deadline_monotonic or time.monotonic() + (BOUND_MS / 1000)
        while time.monotonic() < deadline:
            events = self.frf_stream_events()
            if request_id is None:
                candidates = [
                    event
                    for event in events
                    if event["event"] == "opened"
                    and int(event["observed_epoch_ns"]) >= opened_after_epoch_ns
                ]
                if candidates:
                    request_id = str(candidates[-1]["request_id"])
            selected = [
                event for event in events if event["request_id"] == request_id
            ]
            has_frame = any(event["event"] == "frame" for event in selected)
            has_terminal = any(
                event["event"] in FRF_TERMINAL_EVENTS for event in selected
            )
            if has_frame and (has_terminal or not require_terminal):
                return selected
            time.sleep(0.05)
        terminal = " and terminal" if require_terminal else ""
        raise RuntimeError(f"FRF stream did not emit a frame{terminal} before timeout")

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
            timeout=30,
            check=False,
        )
        if process.returncode != 0:
            raise RuntimeError("psql failed: " + process.stderr.strip())
        return process.stdout.strip()

    def prepare_stack(self) -> None:
        current_effective = resolved_compose(
            self.args.campaign_secrets,
            f"http://host.docker.internal:{self.args.electric_proxy_port}",
        )
        self.check(
            "frozen_effective_compose_matches_launch_environment",
            current_effective == self.args.effective_compose.read_bytes(),
        )
        self.compose("stop", "realtime-fabric", "flint-gate", "flint-gate-peer")
        self.compose(
            "up",
            "-d",
            "db",
            "electric",
            "kratos",
            "iggy-server",
            "redis",
            "flint-gate-init",
            timeout=180,
        )
        self.stack_started = True
        self.sql(
            f"CREATE ROLE {self.gate_authority_role} LOGIN PASSWORD "
            f"'{self.gate_authority_password}' NOSUPERUSER NOCREATEDB NOCREATEROLE "
            "NOREPLICATION NOBYPASSRLS; "
            f"GRANT aso_authority_event_reader TO {self.gate_authority_role};"
        )

    def start_runtime_stack(self) -> None:
        self.compose("up", "-d", "flint-gate", "flint-gate-peer", timeout=180)
        for index, url in enumerate(GATE_URLS, start=1):
            for _ in range(80):
                try:
                    status, _, payload = self.json_http(url + "/.well-known/jwks.json")
                    if status == 200 and payload.get("keys"):
                        break
                except (
                    urllib.error.URLError,
                    http.client.RemoteDisconnected,
                    ConnectionResetError,
                    json.JSONDecodeError,
                ):
                    pass
                time.sleep(0.25)
            else:
                raise RuntimeError(f"Gate replica {index} did not become ready")
            self.check(f"gate_replica_{index}_serves_jwks", True, status=200)
        self.compose("up", "-d", "--no-deps", "realtime-fabric", timeout=180)
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
                text=True,
                capture_output=True,
                timeout=10,
                check=False,
            )
            if process.returncode == 0 and process.stdout.strip():
                self.check("realtime_fabric_ready", True)
                return
            time.sleep(0.25)
        raise RuntimeError("realtime-fabric did not become ready")

    def seed_fixture(self, identities: list[str]) -> None:
        f = self.fixture
        rows = []
        for suffix, identity_id in zip("abcd", identities, strict=True):
            rows.append(
                {
                    "suffix": suffix,
                    "identity": identity_id,
                    "practice": self.practices[identity_id],
                    "user": f[f"user_{suffix}"],
                    "patient": f[f"patient_{suffix}"],
                    "case": f[f"case_{suffix}"],
                }
            )
        practices = ",".join(
            f"('{row['practice']}','Synthetic RA06c Practice {row['suffix'].upper()}',"
            f"'ra06c-{row['practice']}')" for row in rows
        )
        users = ",".join(
            f"('{row['user']}','{row['identity']}','{row['practice']}',"
            f"'ra06c-{row['identity']}@example.invalid','Synthetic RA06c User')"
            for row in rows
        )
        patients = ",".join(
            f"('{row['patient']}','{row['practice']}','Synthetic',"
            f"'Fixture {row['suffix'].upper()}','2000-01-01')" for row in rows
        )
        cases = ",".join(
            f"('{row['case']}','{row['practice']}','{row['patient']}','{row['user']}',"
            f"'{f['payer']}','ra06c-{row['case']}','awaiting_gate')" for row in rows
        )
        role_inserts = " ".join(
            "INSERT INTO aso.user_roles(user_id,role_id,practice_id) "
            f"SELECT '{row['user']}',id,'{row['practice']}' FROM aso.roles WHERE key='surgeon';"
            for row in rows
        )
        case_ids = ",".join(repr(row["case"]) for row in rows)
        output = self.sql(
            f"""
            BEGIN;
            INSERT INTO aso.practices(id,name,key) VALUES {practices};
            INSERT INTO aso.users(id,kratos_identity_id,practice_id,email,full_name)
              VALUES {users};
            {role_inserts}
            INSERT INTO aso.payers(id,name,key)
              VALUES ('{f['payer']}','Synthetic RA06c Payer','ra06c-{f['payer']}');
            INSERT INTO aso.patients(id,practice_id,family_name,given_name,birth_date)
              VALUES {patients};
            INSERT INTO aso.cases(
              id,practice_id,patient_id,surgeon_id,payer_id,case_number,status
            ) VALUES {cases};
            COMMIT;
            SELECT count(*) FROM aso.cases WHERE id IN ({case_ids});
            """
        )
        self.fixture_seeded = True
        self.check("four_synthetic_cases_committed", int(output.splitlines()[-1]) == 4)

    def gate_request(
        self,
        identity_id: str,
        params: dict[str, str],
        gate_index: int = 0,
        timeout: float = 20,
    ):
        query = urllib.parse.urlencode(params)
        return self.http(
            GATE_URLS[gate_index] + "/v1/shape?" + query,
            headers={"Authorization": "Bearer " + self.sessions[identity_id]["token"]},
            timeout=timeout,
        )

    def streaming_gate_request(
        self,
        identity_id: str,
        gate_index: int,
        observed: dict[str, object],
    ) -> None:
        parsed = urllib.parse.urlsplit(GATE_URLS[gate_index])
        connection = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=12)
        body = bytearray()
        chunk_times = []
        try:
            connection.request(
                "GET",
                "/v1/shape?shape=cases",
                headers={
                    "Authorization": "Bearer " + self.sessions[identity_id]["token"],
                    "Host": parsed.netloc,
                },
            )
            response = connection.getresponse()
            observed["status"] = response.status
            observed["headers"] = {
                key.lower(): value for key, value in response.getheaders()
            }
            first = response.read(1)
            if first:
                body.extend(first)
                chunk_times.append(time.monotonic())
            while True:
                chunk = response.read(512)
                if not chunk:
                    break
                body.extend(chunk)
                chunk_times.append(time.monotonic())
        except (http.client.IncompleteRead, http.client.RemoteDisconnected, socket.timeout) as error:
            observed["stream_end"] = type(error).__name__
        finally:
            observed["body"] = bytes(body)
            observed["chunk_times"] = chunk_times
            observed["ended"] = time.monotonic()
            connection.close()

    def open_slow_stream(
        self,
        identity_id: str,
        case_id: str,
        label: str,
        gate_index: int,
        denial_gate_index: int,
        denial_expected: set[int],
        action,
        trigger_at_verified_exp: bool = False,
    ) -> None:
        assert self.proxy is not None
        self.proxy.arm(label, case_id)
        observed: dict[str, object] = {}
        opened_after_epoch_ns = time.time_ns()
        thread = threading.Thread(
            target=self.streaming_gate_request,
            args=(identity_id, gate_index, observed),
            daemon=True,
        )
        thread.start()
        self.check(label + "_frf_received_nonempty_body", self.proxy.first_prefix.wait(timeout=10))
        active_events = self.wait_for_frf_stream(opened_after_epoch_ns)
        opened = next(event for event in active_events if event["event"] == "opened")
        request_id = str(opened["request_id"])
        actual_grant_expiry_epoch = int(opened["grant_expiry_epoch_seconds"])
        if trigger_at_verified_exp:
            reference_monotonic = time.monotonic()
            reference_epoch = time.time()
            scheduled_trigger, _scheduled_trigger_epoch_ns = conservative_expiry_trigger(
                float(actual_grant_expiry_epoch),
                reference_epoch,
                reference_monotonic,
            )
            while time.monotonic() < scheduled_trigger:
                time.sleep(min(scheduled_trigger - time.monotonic(), 0.005))
            trigger = time.monotonic()
            active_observed_at = trigger
            response_end_observed_at_trigger = observed.get("ended")
            trigger_epoch_ns = time.time_ns()
            action()
        else:
            trigger = time.monotonic()
            active_observed_at = trigger
            response_end_observed_at_trigger = observed.get("ended")
            trigger_epoch_ns = time.time_ns()
            action()
        observation_lead_ms = round((trigger - active_observed_at) * 1000, 3)
        maximum_observation_lead_ms = (
            ACTIVE_TRIGGER_OBSERVATION_LEAD_MS
            if trigger_at_verified_exp
            else ACTION_TRIGGER_OBSERVATION_LEAD_MS
        )
        terminal_deadline = trigger + (BOUND_MS / 1000)
        terminal_events = self.wait_for_frf_stream(
            opened_after_epoch_ns,
            request_id=request_id,
            require_terminal=True,
            deadline_monotonic=terminal_deadline,
        )
        terminal_observed_at = time.monotonic()
        thread.join(max(0, terminal_deadline - time.monotonic()))
        self.check(label + "_response_closed", not thread.is_alive())
        terminal = next(
            event
            for event in terminal_events
            if event["event"] in FRF_TERMINAL_EVENTS
        )
        frame_events = [
            event for event in terminal_events if event["event"] == "frame"
        ]
        last_frame = frame_events[-1]
        terminal_epoch_ns = int(terminal["observed_epoch_ns"])
        opened_epoch_ns = int(opened["observed_epoch_ns"])
        active_at_trigger = response_active_at_trigger(
            trigger, response_end_observed_at_trigger
        )
        self.check(
            label + "_frf_protected_body_active_at_trigger",
            active_at_trigger
            and abs(observation_lead_ms) <= maximum_observation_lead_ms,
            response_active=active_at_trigger,
            response_end_observed_at_trigger_monotonic_ns=(
                None
                if response_end_observed_at_trigger is None
                else round(float(response_end_observed_at_trigger) * 1_000_000_000)
            ),
            observation_lead_ms=observation_lead_ms,
            maximum_lead_ms=maximum_observation_lead_ms,
            request_id=request_id,
            actual_grant_expiry_epoch_seconds=actual_grant_expiry_epoch,
            terminal_event=terminal["event"],
        )
        self.check(
            label + "_frf_producer_cancelled_after_nonempty_frame",
            terminal["event"] == "cancelled"
            and int(terminal["frames"]) >= 1
            and int(terminal["elapsed_monotonic_ns"])
            > int(last_frame["elapsed_monotonic_ns"]),
            terminal_event=terminal["event"],
            frames=terminal["frames"],
            last_frame_elapsed_monotonic_ns=last_frame["elapsed_monotonic_ns"],
            terminal_elapsed_monotonic_ns=terminal["elapsed_monotonic_ns"],
        )
        elapsed_ms = round((terminal_observed_at - trigger) * 1000, 3)
        body = observed.get("body", b"")
        proxy_observation = self.proxy.observations.get(label, {})
        lower_bound_ms = 0
        self.report["proxy_observations"][label] = proxy_observation
        self.report["frf_stream_observations"][label] = terminal_events
        self.report["timings"][label] = {
            "opening_gate_replica": gate_index + 1,
            "elapsed_ms_from_trigger_to_terminal_observation": elapsed_ms,
            "trigger_monotonic_ns": round(trigger * 1_000_000_000),
            "terminal_observed_monotonic_ns": round(
                terminal_observed_at * 1_000_000_000
            ),
            "trigger_epoch_ns": trigger_epoch_ns,
            "actual_grant_expiry_epoch_seconds": actual_grant_expiry_epoch,
            "frf_stream_opened_epoch_ns": opened_epoch_ns,
            "last_protected_frame_monotonic_ns": last_frame[
                "elapsed_monotonic_ns"
            ],
            "producer_terminal_monotonic_ns": terminal["elapsed_monotonic_ns"],
            "producer_terminal_epoch_ns": terminal_epoch_ns,
            "producer_terminal_event": terminal["event"],
            "response_active_observed_monotonic_ns": round(
                active_observed_at * 1_000_000_000
            ),
            "response_active_observation_lead_ms": observation_lead_ms,
            "response_end_observed_at_trigger_monotonic_ns": (
                None
                if response_end_observed_at_trigger is None
                else round(float(response_end_observed_at_trigger) * 1_000_000_000)
            ),
            "open_response_at_trigger": active_at_trigger,
            "status": observed.get("status"),
            "body_bytes": len(body),
            "body_chunk_count": len(observed.get("chunk_times", [])),
        }
        self.check(
            label + "_upstream_contained_held_protected_row",
            proxy_observation.get("marker_found") is True,
            **proxy_observation,
        )
        self.check(
            label + "_bounded_without_held_protected_row",
            lower_bound_ms <= elapsed_ms <= BOUND_MS
            and case_id.encode() not in body,
            elapsed_ms=elapsed_ms,
            lower_bound_ms=lower_bound_ms,
            bound_ms=BOUND_MS,
            clock_allowance_ms=CLOCK_ALLOWANCE_MS,
            elapsed_clock="outer Python monotonic clock",
            held_case_delivered=case_id.encode() in body,
        )
        denial = self.assert_new_request_denied(
            identity_id,
            label + "_denied_on_peer",
            denial_gate_index,
            denial_expected,
            trigger,
            terminal_deadline,
        )
        combined_elapsed_ms = round(
            (max(terminal_observed_at, denial["observed_at"]) - trigger) * 1000,
            3,
        )
        self.report["timings"][label].update(
            {
                "peer_denial_observed_monotonic_ns": round(
                    denial["observed_at"] * 1_000_000_000
                ),
                "peer_denial_status": denial["status"],
                "peer_denial_error": denial["response_error"],
                "new_request_denied": denial["denied"],
                "combined_terminal_and_peer_denial_elapsed_ms": combined_elapsed_ms,
            }
        )
        self.check(
            label + "_terminal_and_peer_denial_within_single_deadline",
            combined_elapsed_ms <= BOUND_MS,
            elapsed_ms=combined_elapsed_ms,
            bound_ms=BOUND_MS,
        )

    def assert_new_request_denied(
        self,
        identity_id: str,
        label: str,
        gate_index: int,
        expected: set[int],
        trigger: float,
        deadline: float,
    ) -> dict[str, object]:
        remaining = deadline - time.monotonic()
        self.check(label + "_deadline_remaining", remaining > 0, remaining_ms=remaining * 1000)
        status, headers, body = self.gate_request(
            identity_id,
            {"shape": "cases"},
            gate_index,
            timeout=max(0.05, remaining),
        )
        observed_at = time.monotonic()
        elapsed_ms = round((observed_at - trigger) * 1000, 3)
        self.report["timings"][label] = {
            "denial_gate_replica": gate_index + 1,
            "elapsed_ms_from_trigger": elapsed_ms,
            "status": status,
        }
        protected = [
            *self.practices.values(),
            *(self.fixture[f"case_{suffix}"] for suffix in "abcd"),
        ]
        body_text = body.decode(errors="replace")
        try:
            response_error = json.loads(body).get("error") if body else None
        except (json.JSONDecodeError, UnicodeDecodeError):
            response_error = None
        expected_denial = status in expected or (
            status == 503
            and response_error
            in {"authority_decision_unavailable", "replica_grant_unavailable"}
        )
        self.check(
            label,
            expected_denial
            and elapsed_ms <= BOUND_MS
            and self.no_shape_headers(headers)
            and not any(value in body_text for value in protected),
            status=status,
            elapsed_ms=elapsed_ms,
            shape_headers_absent=self.no_shape_headers(headers),
            response_error=response_error,
        )
        return {
            "observed_at": observed_at,
            "status": status,
            "response_error": response_error,
            "denied": expected_denial,
        }

    def denial_commit_monotonic(self, identity_id: str) -> float:
        session_id = self.sessions[identity_id]["id"]
        raw = self.sql(
            "SELECT extract(epoch FROM created_at) FROM aso.session_denials "
            f"WHERE kratos_session_id='{session_id}' ORDER BY created_at DESC LIMIT 1;"
        )
        self.check("durable_denial_exists_" + identity_id, bool(raw))
        return time.monotonic() + (float(raw.splitlines()[-1]) - time.time())

    def application_logout(self, identity_id: str) -> float:
        status, _, _ = self.http(
            f"http://127.0.0.1:{self.args.aso_port}/api/session",
            "DELETE",
            headers={"Authorization": "Bearer " + self.sessions[identity_id]["token"]},
        )
        self.check("application_logout_confirmed", status == 204, status=status)
        return self.denial_commit_monotonic(identity_id)

    def direct_kratos_revocation(self, identity_id: str) -> float:
        session_id = self.sessions[identity_id]["id"]
        status, _, _ = self.http(
            composition.KRATOS_ADMIN + "/admin/sessions/" + session_id,
            "DELETE",
        )
        self.check("direct_kratos_admin_revocation_completed", status == 204, status=status)
        observed_from = time.monotonic()
        status, _, _ = self.http(
            f"http://127.0.0.1:{self.args.aso_port}/api/session",
            headers={"Authorization": "Bearer " + self.sessions[identity_id]["token"]},
        )
        self.check("direct_revocation_trusted_aso_observation", status == 401, status=status)
        self.denial_commit_monotonic(identity_id)
        return observed_from

    def remove_membership(self) -> float:
        started = time.monotonic()
        user_id = self.fixture["user_c"]
        self.sql(f"DELETE FROM aso.user_roles WHERE user_id='{user_id}';")
        remaining = self.sql(
            f"SELECT count(*) FROM aso.user_roles WHERE user_id='{user_id}';"
        )
        self.check("membership_removal_committed", remaining.splitlines()[-1] == "0")
        return started

    def expire_kratos_session(self, identity_id: str, delay_seconds: float) -> float:
        session_id = self.sessions[identity_id]["id"]
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
                "kratos",
                "-Atq",
            ],
            cwd=ROOT,
            env=self.stack_env,
            input=(
                "UPDATE public.sessions SET expires_at=clock_timestamp()+"
                f"make_interval(secs => {delay_seconds}), updated_at=clock_timestamp() "
                f"WHERE id='{session_id}' RETURNING extract(epoch FROM expires_at);"
            ),
            text=True,
            capture_output=True,
            timeout=20,
            check=False,
        )
        if process.returncode != 0:
            raise RuntimeError("Kratos expiry update failed: " + process.stderr.strip())
        expiry_epoch = float(process.stdout.strip().splitlines()[0])
        return expiry_epoch

    def exercise(self) -> None:
        self.prepare_stack()
        self.proxy = SlowElectricProxy(
            self.args.electric_proxy_port, self.args.proxy_hold_seconds
        )
        self.proxy.start()
        identities = [
            self.create_identity_session("application-logout"),
            self.create_identity_session("direct-admin"),
            self.create_identity_session("membership"),
            self.create_identity_session("expiry"),
        ]
        self.seed_fixture(identities)
        super().provision_runtime_server()
        self.start_runtime_stack()

        self.open_slow_stream(
            identities[0],
            self.fixture["case_a"],
            "application_logout",
            0,
            1,
            {401},
            lambda: self.application_logout(identities[0]),
        )
        self.open_slow_stream(
            identities[1],
            self.fixture["case_b"],
            "direct_kratos_revocation",
            1,
            0,
            {401},
            lambda: self.direct_kratos_revocation(identities[1]),
        )
        self.open_slow_stream(
            identities[2],
            self.fixture["case_c"],
            "membership_change",
            0,
            1,
            {403},
            self.remove_membership,
        )

        authoritative_expiry_epoch = self.expire_kratos_session(
            identities[3], self.args.expiry_seconds
        )

        def expiry_trigger() -> None:
            return None

        self.open_slow_stream(
            identities[3],
            self.fixture["case_d"],
            "session_expiry",
            1,
            0,
            {401},
            expiry_trigger,
            trigger_at_verified_exp=True,
        )
        self.report["timings"]["session_expiry"]["trigger_basis"] = (
            "exp from the downstream JWT verified by the FRF route, measured from "
            f"a {ACTIVE_TRIGGER_OBSERVATION_LEAD_MS} ms conservative pre-expiry trigger"
        )
        time.sleep(max(0, authoritative_expiry_epoch - time.time()))

        scenario_data = [
            ("application_logout", 0),
            ("direct_kratos_revocation", 1),
            ("membership_change", 0),
            ("session_expiry", 1),
        ]
        self.report["contract_observations"] = [
            {
                "name": label,
                "triggerMonotonicNs": self.report["timings"][label][
                    "trigger_monotonic_ns"
                ],
                "triggerEpochNs": self.report["timings"][label]["trigger_epoch_ns"],
                "verifiedGrantExpiryEpochSeconds": self.report["timings"][label][
                    "actual_grant_expiry_epoch_seconds"
                ],
                "lastProtectedFrameElapsedMonotonicNs": self.report["timings"][label][
                    "last_protected_frame_monotonic_ns"
                ],
                "producerTerminalElapsedMonotonicNs": self.report["timings"][label][
                    "producer_terminal_monotonic_ns"
                ],
                "terminalObservedMonotonicNs": self.report["timings"][label][
                    "terminal_observed_monotonic_ns"
                ],
                "producerTerminalEpochNs": self.report["timings"][label][
                    "producer_terminal_epoch_ns"
                ],
                "openResponseAtTrigger": self.report["timings"][label][
                    "open_response_at_trigger"
                ],
                "responseActiveObservationLeadMs": self.report["timings"][label][
                    "response_active_observation_lead_ms"
                ],
                "newRequestDenied": self.report["timings"][label][
                    "new_request_denied"
                ],
                "peerDenialObservedMonotonicNs": self.report["timings"][label][
                    "peer_denial_observed_monotonic_ns"
                ],
                "combinedTerminalAndPeerDenialElapsedMs": self.report["timings"][label][
                    "combined_terminal_and_peer_denial_elapsed_ms"
                ],
                "openingGateReplica": gate_index + 1,
                "denialGateReplica": 2 if gate_index == 0 else 1,
            }
            for label, gate_index in scenario_data
        ]

    def cleanup(self) -> None:
        if self.server is not None:
            self.server.terminate()
            try:
                self.server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.server.kill()
                self.server.wait(timeout=5)
            self.report["cleanup"]["aso_server"] = "Passed"
        if self.server_log is not None:
            self.server_log.close()
        if self.proxy is not None:
            self.proxy.close()
            self.report["cleanup"]["electric_proxy"] = (
                "Passed" if not self.proxy.thread.is_alive() else "Failed"
            )
            self.report["proxy_observations"] = self.proxy.observations
        if self.stack_started:
            try:
                self.compose("stop", "realtime-fabric", "flint-gate", "flint-gate-peer")
                self.report["cleanup"]["campaign_services"] = "Passed"
            except Exception as error:
                self.report["cleanup"]["campaign_services"] = "Failed"
                self.report["cleanup"]["campaign_services_error"] = str(error)
        if self.fixture_seeded:
            f = self.fixture
            values = {
                kind: ",".join(repr(f[f"{kind}_{suffix}"]) for suffix in "abcd")
                for kind in ("case", "patient", "user")
            }
            practices = ",".join(repr(value) for value in self.practices.values())
            try:
                remaining = self.sql(
                    f"""
                    BEGIN;
                    SET LOCAL session_replication_role = replica;
                    DELETE FROM aso.gate_affirmations WHERE case_id IN ({values['case']});
                    DELETE FROM aso.cases WHERE id IN ({values['case']});
                    DELETE FROM aso.patients WHERE id IN ({values['patient']});
                    DELETE FROM aso.users WHERE id IN ({values['user']});
                    DELETE FROM aso.payers WHERE id='{f['payer']}';
                    DELETE FROM aso.practices WHERE id IN ({practices});
                    COMMIT;
                    SELECT count(*) FROM aso.cases WHERE id IN ({values['case']});
                    """
                )
                self.report["cleanup"]["synthetic_relational_rows"] = (
                    "Passed" if remaining.splitlines()[-1] == "0" else "Failed"
                )
            except Exception as error:
                self.report["cleanup"]["synthetic_relational_rows"] = "Failed"
                self.report["cleanup"]["relational_cleanup_error"] = str(error)
        roles = [self.runtime_role, self.authority_role, self.gate_authority_role]
        try:
            self.sql(" ".join(f"DROP ROLE IF EXISTS {role};" for role in roles))
            self.report["cleanup"]["restricted_runtime_roles"] = "Passed"
        except Exception as error:
            self.report["cleanup"]["restricted_runtime_roles"] = "Failed"
            self.report["cleanup"]["role_cleanup_error"] = str(error)
        deleted = 0
        for identity_id in reversed(self.identities):
            status, _, _ = self.http(
                composition.KRATOS_ADMIN + "/admin/identities/" + identity_id,
                "DELETE",
            )
            if status == 204:
                deleted += 1
        self.report["cleanup"]["synthetic_identities"] = (
            "Passed" if deleted == len(self.identities) else "Failed"
        )
        self.report["cleanup"]["deleted_identity_count"] = deleted


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aso-port", type=int, default=8788)
    parser.add_argument("--electric-proxy-port", type=int, default=8789)
    parser.add_argument(
        "--campaign-secrets",
        type=Path,
        default=ROOT / ".runtime/ra06c/campaign-secrets.json",
    )
    parser.add_argument(
        "--effective-compose",
        type=Path,
        default=ROOT / ".runtime/ra06c/effective-compose.json",
    )
    parser.add_argument("--proxy-hold-seconds", type=float, default=6.0)
    parser.add_argument("--expiry-seconds", type=float, default=1.25)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--replication-attempts", type=int, default=30)
    parser.add_argument("--replication-interval-seconds", type=float, default=0.25)
    parser.add_argument("--exercise-expired-handle", action="store_false")
    parser.add_argument("--handle-ttl-seconds", type=int, default=1)
    parser.add_argument("--expiry-wait-seconds", type=int, default=2)
    args = parser.parse_args()
    if args.aso_port != 8788:
        parser.error("the candidate Gate configuration binds the ASO callback to port 8788")
    return RevocationProbe(args).run()


if __name__ == "__main__":
    raise SystemExit(main())
