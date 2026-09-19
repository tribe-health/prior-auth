#!/usr/bin/env python3
"""RA05 T1: real Kratos -> Gate -> FRF -> Electric shape composition proof."""

import argparse
import datetime
import json
from pathlib import Path
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-05-authorized-shape-facade/task-3-compose.json"
)
KRATOS_PUBLIC = "http://127.0.0.1:4433"
KRATOS_ADMIN = "http://127.0.0.1:4434"
GATE = "http://127.0.0.1:4456"
PROJECTIONS = [
    "annotation_types",
    "annotations",
    "cases",
    "case_evidence",
    "evidence_states",
    "evidence_citations",
    "document_statuses",
    "document_task_statuses",
]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Probe:
    def __init__(self, args):
        self.args = args
        self.client = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect()
        )
        self.identities = []
        self.sessions = {}
        self.practices = {}
        self.callback = None
        self.callback_thread = None
        self.callback_calls = []
        self.grant_ttl_seconds = {}
        self.report = {
            "result": "Failed",
            "verification_tier": 1,
            "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": "Real Kratos v26.2.0, Gate RS256 minter, FRF verifier and Electric 1.8.0",
            "command": "python3 scripts/test-authorized-shape-composition.py",
            "checks": {},
            "cleanup": {},
        }

    def check(self, name, condition, **details):
        self.report["checks"][name] = {
            "result": "Passed" if condition else "Failed",
            **details,
        }
        if not condition:
            raise AssertionError(name)

    def http(self, url, method="GET", body=None, headers=None, timeout=15):
        encoded = None
        request_headers = dict(headers or {})
        if body is not None:
            encoded = json.dumps(body).encode()
            request_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            url, data=encoded, headers=request_headers, method=method
        )
        try:
            response = self.client.open(request, timeout=timeout)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return (
                response.status,
                {key.lower(): value for key, value in response.headers.items()},
                response.read(),
            )

    def json_http(self, *args, **kwargs):
        status, headers, raw = self.http(*args, **kwargs)
        return status, headers, json.loads(raw) if raw else {}

    def public_action(self, action):
        parsed = urllib.parse.urlsplit(action)
        suffix = parsed.path
        if parsed.query:
            suffix += "?" + parsed.query
        return KRATOS_PUBLIC + suffix

    def create_identity_session(self, label):
        email = f"ra05-{label}-{uuid.uuid4()}@example.invalid"
        password = secrets.token_urlsafe(36) + "Aa1!"
        status, _, identity = self.json_http(
            KRATOS_ADMIN + "/admin/identities",
            "POST",
            {
                "schema_id": "clinician",
                "state": "active",
                "traits": {
                    "email": email,
                    "name": {"first": "Synthetic", "last": "RA05 Probe"},
                },
                "credentials": {"password": {"config": {"password": password}}},
            },
        )
        self.check(f"{label}_identity_created", status == 201, status=status)
        identity_id = identity["id"]
        self.identities.append(identity_id)

        status, _, flow = self.json_http(KRATOS_PUBLIC + "/self-service/login/api")
        self.check(f"{label}_login_flow_created", status == 200, status=status)
        status, _, login = self.json_http(
            self.public_action(flow["ui"]["action"]),
            "POST",
            {"method": "password", "identifier": email, "password": password},
        )
        self.check(f"{label}_login_completed", status == 200, status=status)
        token = login["session_token"]
        status, _, session = self.json_http(
            KRATOS_PUBLIC + "/sessions/whoami",
            headers={"Authorization": "Bearer " + token},
        )
        self.check(
            f"{label}_session_is_authoritative",
            status == 200 and session["identity"]["id"] == identity_id,
            status=status,
            identity_match=session.get("identity", {}).get("id") == identity_id,
        )
        self.sessions[identity_id] = {"id": session["id"], "token": token}
        self.practices[identity_id] = str(uuid.uuid4())
        return identity_id

    def start_grant_callback(self):
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                if urllib.parse.urlsplit(self.path).path != "/api/session/replica-grant":
                    self.respond(404, {"error": "not_found"})
                    return
                forwarded = {
                    key: self.headers[key]
                    for key in ("Authorization", "X-Session-Token", "Cookie")
                    if self.headers.get(key)
                }
                status, _, session = owner.json_http(
                    KRATOS_PUBLIC + "/sessions/whoami", headers=forwarded
                )
                if status != 200:
                    self.respond(401, {"error": "unauthenticated"})
                    return
                identity_id = session["identity"]["id"]
                practice_id = owner.practices.get(identity_id)
                if practice_id is None:
                    self.respond(403, {"error": "practice_denied"})
                    return
                owner.callback_calls.append(
                    {
                        "identity_id": identity_id,
                        "session_id": session["id"],
                        "ttl_seconds": owner.grant_ttl_seconds.get(identity_id, 300),
                    }
                )
                expires_at = datetime.datetime.now(
                    datetime.timezone.utc
                ) + datetime.timedelta(
                    seconds=owner.grant_ttl_seconds.get(identity_id, 300)
                )
                self.respond(
                    200,
                    {
                        "identityId": identity_id,
                        "originatingSessionId": session["id"],
                        "practiceId": practice_id,
                        "authorizationRevision": "membership:ra05-composition",
                        "projectionRevision": 6,
                        "expiresAt": expires_at.isoformat(),
                        "projections": [{"id": value} for value in PROJECTIONS],
                    },
                )

            def respond(self, status, payload):
                raw = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def log_message(self, *_args):
                pass

        self.callback = ThreadingHTTPServer(
            ("0.0.0.0", self.args.callback_port), Handler
        )
        self.callback_thread = threading.Thread(
            target=self.callback.serve_forever, daemon=True
        )
        self.callback_thread.start()

    def gate_request(self, identity_id, params):
        query = urllib.parse.urlencode(params)
        return self.http(
            GATE + "/v1/shape?" + query,
            headers={"Authorization": "Bearer " + self.sessions[identity_id]["token"]},
            timeout=20,
        )

    def no_shape_headers(self, headers):
        return not any(name.startswith("electric-") for name in headers)

    def exercise(self):
        status, _, version = self.json_http(KRATOS_ADMIN + "/version")
        self.check(
            "kratos_version_is_pinned",
            status == 200 and version.get("version") == "v26.2.0",
            status=status,
            version=version.get("version"),
        )
        status, _, jwks = self.json_http(GATE + "/.well-known/jwks.json")
        keys = jwks.get("keys", [])
        self.check(
            "gate_serves_configured_rs256_key",
            status == 200
            and len(keys) == 1
            and keys[0].get("alg") == "RS256"
            and keys[0].get("kid") == "aso-ra05-local",
            status=status,
            algorithms=[key.get("alg") for key in keys],
            key_ids=[key.get("kid") for key in keys],
        )

        identity_a = self.create_identity_session("a")
        identity_b = self.create_identity_session("b")
        self.start_grant_callback()

        status, headers, _ = self.gate_request(identity_a, {"shape": "cases"})
        handle = headers.get("electric-handle")
        offset = headers.get("electric-offset")
        self.check(
            "real_gate_token_is_accepted_by_frf",
            status == 200 and bool(handle) and offset is not None,
            status=status,
            electric_handle_present=bool(handle),
            electric_offset_present=offset is not None,
        )

        status, continuation_headers, _ = self.gate_request(
            identity_a,
            {"shape": "cases", "handle": handle, "offset": offset},
        )
        self.check(
            "fresh_gate_token_can_continue_originating_session_handle",
            status == 200 and continuation_headers.get("electric-handle") == handle,
            status=status,
            same_handle=continuation_headers.get("electric-handle") == handle,
        )

        status, foreign_headers, _ = self.gate_request(
            identity_b,
            {"shape": "cases", "handle": handle, "offset": offset},
        )
        self.check(
            "other_identity_cannot_reuse_handle",
            status == 403 and self.no_shape_headers(foreign_headers),
            status=status,
            shape_headers_absent=self.no_shape_headers(foreign_headers),
        )

        status, scope_headers, _ = self.gate_request(
            identity_a,
            {"shape": "cases", "practiceId": self.practices[identity_b]},
        )
        self.check(
            "client_scope_change_is_refused",
            status == 403 and self.no_shape_headers(scope_headers),
            status=status,
            shape_headers_absent=self.no_shape_headers(scope_headers),
        )

        status, projection_headers, _ = self.gate_request(
            identity_a, {"shape": "unapproved-projection"}
        )
        self.check(
            "client_projection_change_is_refused",
            status == 403 and self.no_shape_headers(projection_headers),
            status=status,
            shape_headers_absent=self.no_shape_headers(projection_headers),
        )
        self.check(
            "every_gate_request_resolved_fresh_session_grant",
            len(self.callback_calls) == 5,
            callback_calls=len(self.callback_calls),
            distinct_identities=len({call["identity_id"] for call in self.callback_calls}),
        )

        if self.args.exercise_expired_handle:
            self.grant_ttl_seconds[identity_a] = self.args.handle_ttl_seconds
            status, expiring_headers, _ = self.gate_request(
                identity_a, {"shape": "document_statuses"}
            )
            expiring_handle = expiring_headers.get("electric-handle")
            expiring_offset = expiring_headers.get("electric-offset")
            self.check(
                "expiring_handle_initial_request_is_allowed",
                status == 200
                and bool(expiring_handle)
                and expiring_offset is not None,
                status=status,
                electric_handle_present=bool(expiring_handle),
                electric_offset_present=expiring_offset is not None,
                handle_ttl_seconds=self.args.handle_ttl_seconds,
            )

            self.grant_ttl_seconds[identity_a] = 300
            time.sleep(self.args.expiry_wait_seconds)
            status, expired_headers, _ = self.gate_request(
                identity_a,
                {
                    "shape": "document_statuses",
                    "handle": expiring_handle,
                    "offset": expiring_offset,
                },
            )
            self.check(
                "expired_handle_is_denied_without_shape_metadata",
                status == 403 and self.no_shape_headers(expired_headers),
                status=status,
                shape_headers_absent=self.no_shape_headers(expired_headers),
                waited_seconds=self.args.expiry_wait_seconds,
            )
            self.check(
                "expired_handle_request_revalidated_the_session_grant",
                len(self.callback_calls) == 7
                and self.callback_calls[-1]["ttl_seconds"] == 300,
                callback_calls=len(self.callback_calls),
                refreshed_grant_ttl_seconds=self.callback_calls[-1]["ttl_seconds"],
            )

    def cleanup(self):
        if self.callback is not None:
            self.callback.shutdown()
            self.callback.server_close()
        if self.callback_thread is not None:
            self.callback_thread.join(timeout=5)
            self.report["cleanup"]["grant_callback"] = (
                "Passed" if not self.callback_thread.is_alive() else "Failed"
            )
        deleted = 0
        for identity_id in reversed(self.identities):
            status, _, _ = self.http(
                KRATOS_ADMIN + "/admin/identities/" + identity_id, "DELETE"
            )
            if status == 204:
                deleted += 1
        self.report["cleanup"]["synthetic_identities"] = (
            "Passed" if deleted == len(self.identities) else "Failed"
        )
        self.report["cleanup"]["deleted_identity_count"] = deleted

    def run(self):
        failure = None
        try:
            self.exercise()
            self.report["result"] = "Passed"
        except Exception as error:
            failure = error
            self.report["failure"] = type(error).__name__ + ": " + str(error)
        finally:
            self.cleanup()
            if any(
                value == "Failed" for value in self.report["cleanup"].values()
            ):
                self.report["result"] = "Failed"
            self.report["callback_call_count"] = len(self.callback_calls)
            self.args.output.parent.mkdir(parents=True, exist_ok=True)
            self.args.output.write_text(json.dumps(self.report, indent=2) + "\n")
        print(
            json.dumps(
                {
                    "result": self.report["result"],
                    "checks": len(self.report["checks"]),
                    "callback_calls": len(self.callback_calls),
                    "cleanup": self.report["cleanup"],
                },
                indent=2,
            )
        )
        return 1 if failure is not None or self.report["result"] != "Passed" else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--callback-port", type=int, default=8787)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--exercise-expired-handle", action="store_true")
    parser.add_argument("--handle-ttl-seconds", type=int, default=3)
    parser.add_argument("--expiry-wait-seconds", type=int, default=4)
    args = parser.parse_args()
    return Probe(args).run()


if __name__ == "__main__":
    raise SystemExit(main())
