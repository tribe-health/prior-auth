#!/usr/bin/env python3
"""RA05 T1: live issuer, audience, scope, projection and handle authorization proof."""

import argparse
import base64
import datetime
import importlib.util
import json
from pathlib import Path
import subprocess
import time
import uuid


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-05-authorized-shape-facade"
)
DEFAULT_OUTPUT = EVIDENCE / "task-6-authorization.json"
TRANSITION_PROBE = ROOT / "scripts/test-authorized-shape-transition.py"
STACK = ROOT / "scripts/ra05-stack.sh"
PRIVATE_KEY = ROOT / ".runtime/ra05/keys/private.pem"
EXPECTED_ISSUER = "https://gate.aso.local"
EXPECTED_AUDIENCE = "frf-gateway"


def load_transition_probe():
    spec = importlib.util.spec_from_file_location(
        "ra05_authorized_shape_transition", TRANSITION_PROBE
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the RA05 transition probe")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


transition = load_transition_probe()


class AuthorizationProbe(transition.TransitionProbe):
    def __init__(self, args):
        super().__init__(args)
        self.report.update(
            {
                "scope": (
                    "Live Gate token, FRF issuer/audience verifier, tenant projection "
                    "and continuation-handle boundary"
                ),
                "command": (
                    "python3 scripts/test-authorized-shape-authorization.py "
                    "--output .kbd-orchestrator/phases/runtime-architecture/evidence/"
                    "ra-05-authorized-shape-facade/task-6-authorization.json"
                ),
                "authorization": {},
            }
        )

    @staticmethod
    def base64url(value):
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode()

    def signed_token(self, identity_id, issuer, audience):
        now = int(time.time())
        header = {"alg": "RS256", "kid": "aso-ra05-local", "typ": "JWT"}
        claims = {
            "sub": identity_id,
            "tenant_id": self.practices[identity_id],
            "scope": "aso.replica.read",
            "jti": str(uuid.uuid4()),
            "originating_session_id": self.sessions[identity_id]["id"],
            "authorization_revision": "membership:ra05-authorization",
            "projection_revision": 5,
            "projection_ids": list(transition.composition.PROJECTIONS),
            "aud": [audience],
            "iss": issuer,
            "iat": now,
            "exp": now + 120,
        }
        segments = [
            self.base64url(json.dumps(value, separators=(",", ":")).encode())
            for value in (header, claims)
        ]
        signing_input = ".".join(segments).encode()
        signed = subprocess.run(
            [
                "openssl",
                "dgst",
                "-sha256",
                "-sign",
                str(PRIVATE_KEY),
            ],
            cwd=ROOT,
            input=signing_input,
            capture_output=True,
            timeout=15,
            check=False,
        )
        if signed.returncode != 0:
            raise RuntimeError(
                "openssl JWT signing failed with exit " + str(signed.returncode)
            )
        return ".".join([*segments, self.base64url(signed.stdout)])

    def backend_network(self):
        process = subprocess.run(
            ["docker", "inspect", "aso-prior-auth-realtime-fabric-1"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=15,
            check=False,
        )
        if process.returncode != 0:
            raise RuntimeError("could not inspect the running FRF networks")
        networks = json.loads(process.stdout)[0]["NetworkSettings"]["Networks"]
        matches = [name for name in networks if name.endswith("_ra05-backend")]
        if len(matches) != 1:
            raise RuntimeError("running FRF must join exactly one RA05 backend network")
        return matches[0]

    def backend_frf_request(self, token):
        shell = """
read -r token
status=$(curl --silent --show-error --dump-header /tmp/headers \
  --output /tmp/body --write-out '%{http_code}' \
  --header "Authorization: Bearer $token" \
  'http://realtime-fabric:8080/v1/shape?shape=cases')
cat /tmp/headers
printf '\n__STATUS__:%s\n' "$status"
cat /tmp/body
"""
        process = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "--interactive",
                "--network",
                self.backend_network(),
                "--entrypoint",
                "sh",
                "aso-prior-auth-realtime-fabric",
                "-c",
                shell,
            ],
            cwd=ROOT,
            input=token + "\n",
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        if process.returncode != 0:
            raise RuntimeError(
                "backend-segment FRF request failed with exit "
                + str(process.returncode)
                + ": "
                + process.stderr.strip()
            )
        header_text, marked = process.stdout.split("\n__STATUS__:", 1)
        status_text, body = marked.split("\n", 1)
        headers = {}
        for line in header_text.replace("\r", "").splitlines():
            if ":" in line:
                name, value = line.split(":", 1)
                headers[name.lower()] = value.strip()
        return int(status_text), headers, body.encode()

    def running_frf_environment(self):
        process = subprocess.run(
            [
                "docker",
                "inspect",
                "--format",
                "{{json .Config.Env}}",
                "aso-prior-auth-realtime-fabric-1",
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=15,
            check=False,
        )
        if process.returncode != 0:
            raise RuntimeError("could not inspect the running FRF environment")
        environment = {}
        for entry in json.loads(process.stdout):
            name, separator, value = entry.partition("=")
            if separator:
                environment[name] = value
        return environment

    def private_denial(self, name, response, expected_status):
        status, headers, body = response
        shape_headers_absent = self.no_shape_headers(headers)
        body_is_empty = not body.strip()
        protected_values = [
            self.fixture["case_a"],
            self.fixture["case_b"],
            *self.practices.values(),
            getattr(self, "protected_handle", ""),
        ]
        body_text = body.decode(errors="replace")
        protected_value_present = any(
            value and value in body_text for value in protected_values
        )
        try:
            decoded = json.loads(body) if body.strip() else None
        except json.JSONDecodeError:
            decoded = None
        shape_messages_present = isinstance(decoded, list) and any(
            isinstance(item, dict) and "value" in item for item in decoded
        )
        self.check(
            name,
            status == expected_status
            and shape_headers_absent
            and not protected_value_present
            and not shape_messages_present,
            status=status,
            expected_status=expected_status,
            shape_headers_absent=shape_headers_absent,
            body_is_empty=body_is_empty,
            body_byte_count=len(body),
            protected_value_present=protected_value_present,
            shape_messages_present=shape_messages_present,
        )

    def authorization_initial_shape(self, identity_id):
        last = None
        for _ in range(self.args.replication_attempts):
            status, headers, raw = self.gate_request_after_local_rate_limit(
                identity_id, {"shape": "cases"}
            )
            if status != 200:
                return status, headers, []
            messages = self.parse_messages(raw)
            last = (status, headers, messages)
            if self.changes_for(messages, self.fixture["case_a"]):
                return last
            time.sleep(self.args.replication_interval_seconds)
        if last is None:
            raise AssertionError("no initial authorization response was received")
        return last

    def exercise(self):
        status, _, version = self.json_http(
            transition.composition.KRATOS_ADMIN + "/version"
        )
        self.check(
            "kratos_version_is_pinned",
            status == 200 and version.get("version") == "v26.2.0",
            status=status,
            version=version.get("version"),
        )
        status, _, jwks = self.json_http(
            transition.composition.GATE + "/.well-known/jwks.json"
        )
        keys = jwks.get("keys", [])
        self.check(
            "gate_serves_the_configured_rs256_verification_key",
            status == 200
            and len(keys) == 1
            and keys[0].get("kid") == "aso-ra05-local"
            and keys[0].get("alg") == "RS256",
            status=status,
            key_id=(keys or [{}])[0].get("kid"),
            algorithm=(keys or [{}])[0].get("alg"),
        )
        environment = self.running_frf_environment()
        self.report["prerequisites"] = {
            "kratos": {"available": status == 200, "version": version.get("version")},
            "gate_key": {
                "available": len(keys) == 1,
                "key_id": (keys or [{}])[0].get("kid"),
                "algorithm": (keys or [{}])[0].get("alg"),
            },
            "frf": {
                "issuer": environment.get("JWT_ISSUER"),
                "audience": environment.get("JWT_AUDIENCE"),
                "profile": environment.get("GATEWAY_PROFILE"),
            },
            "client_signing_key": {"available": PRIVATE_KEY.is_file()},
        }
        self.check(
            "running_frf_requires_the_gate_issuer_and_audience",
            environment.get("JWT_ISSUER") == EXPECTED_ISSUER
            and environment.get("JWT_AUDIENCE") == EXPECTED_AUDIENCE
            and environment.get("GATEWAY_PROFILE") == "shape-only",
            issuer=environment.get("JWT_ISSUER"),
            audience=environment.get("JWT_AUDIENCE"),
            profile=environment.get("GATEWAY_PROFILE"),
        )
        self.check(
            "synthetic_rs256_signing_key_is_available",
            PRIVATE_KEY.is_file(),
            available=PRIVATE_KEY.is_file(),
        )

        identity_a = self.create_identity_session("authorization-a")
        identity_b = self.create_identity_session("authorization-b")
        self.start_grant_callback()
        self.seed_fixture(identity_a, identity_b)

        status, headers, messages = self.authorization_initial_shape(identity_a)
        handle = headers.get("electric-handle")
        offset = headers.get("electric-offset")
        self.protected_handle = handle or ""
        home_rows = self.changes_for(messages, self.fixture["case_a"])
        foreign_rows = self.changes_for(messages, self.fixture["case_b"])
        self.check(
            "real_gate_minted_token_is_accepted_by_frf",
            status == 200
            and bool(handle)
            and offset is not None
            and bool(home_rows)
            and not foreign_rows,
            status=status,
            electric_handle_present=bool(handle),
            electric_offset=offset,
            authorized_case_present=bool(home_rows),
            foreign_case_present=bool(foreign_rows),
        )

        continuation = self.gate_request_after_local_rate_limit(
            identity_a, {"shape": "cases", "handle": handle, "offset": offset}
        )
        continuation_status, continuation_headers, _ = continuation
        self.check(
            "fresh_gate_token_continues_the_originating_session_handle",
            continuation_status == 200
            and continuation_headers.get("electric-handle") == handle,
            status=continuation_status,
            same_handle=continuation_headers.get("electric-handle") == handle,
        )

        foreign_continuation = self.gate_request_after_local_rate_limit(
            identity_b, {"shape": "cases", "handle": handle, "offset": offset}
        )
        self.private_denial(
            "other_identity_continuation_is_private",
            foreign_continuation,
            403,
        )
        foreign_refetch = self.gate_request_after_local_rate_limit(
            identity_b, {"shape": "cases", "handle": handle, "offset": "-1"}
        )
        self.private_denial(
            "other_identity_refetch_is_private", foreign_refetch, 403
        )
        scope_change = self.gate_request_after_local_rate_limit(
            identity_a,
            {"shape": "cases", "practiceId": self.practices[identity_b]},
        )
        self.private_denial("client_scope_change_is_private", scope_change, 403)
        projection_change = self.gate_request_after_local_rate_limit(
            identity_a, {"shape": "unapproved-projection"}
        )
        self.private_denial(
            "client_projection_change_is_private", projection_change, 403
        )

        correct_token = self.signed_token(
            identity_a, EXPECTED_ISSUER, EXPECTED_AUDIENCE
        )
        wrong_issuer_token = self.signed_token(
            identity_a, "https://wrong-issuer.invalid", EXPECTED_AUDIENCE
        )
        wrong_audience_token = self.signed_token(
            identity_a, EXPECTED_ISSUER, "wrong-audience"
        )
        direct_valid_status, direct_valid_headers, direct_valid_body = (
            self.backend_frf_request(correct_token)
        )
        direct_valid_messages = self.parse_messages(direct_valid_body)
        self.check(
            "same_key_token_with_exact_trust_claims_reaches_shape_policy",
            direct_valid_status == 200
            and bool(direct_valid_headers.get("electric-handle"))
            and bool(self.changes_for(direct_valid_messages, self.fixture["case_a"]))
            and not self.changes_for(direct_valid_messages, self.fixture["case_b"]),
            status=direct_valid_status,
            electric_handle_present=bool(
                direct_valid_headers.get("electric-handle")
            ),
            authorized_case_present=bool(
                self.changes_for(direct_valid_messages, self.fixture["case_a"])
            ),
            foreign_case_present=bool(
                self.changes_for(direct_valid_messages, self.fixture["case_b"])
            ),
        )
        wrong_issuer_response = self.backend_frf_request(wrong_issuer_token)
        self.private_denial(
            "same_key_token_with_wrong_issuer_is_rejected_privately",
            wrong_issuer_response,
            401,
        )
        wrong_audience_response = self.backend_frf_request(wrong_audience_token)
        self.private_denial(
            "same_key_token_with_wrong_audience_is_rejected_privately",
            wrong_audience_response,
            401,
        )
        self.check(
            "every_gate_request_resolved_a_fresh_session_grant",
            len(self.callback_calls) == 6 + self.report["rate_limit_retries"],
            callback_calls=len(self.callback_calls),
            logical_gate_requests=6,
            rate_limit_retries=self.report["rate_limit_retries"],
            distinct_identities=len(
                {call["identity_id"] for call in self.callback_calls}
            ),
        )
        denial_checks = [
            self.report["checks"][name]
            for name in (
                "other_identity_continuation_is_private",
                "other_identity_refetch_is_private",
                "client_scope_change_is_private",
                "client_projection_change_is_private",
                "same_key_token_with_wrong_issuer_is_rejected_privately",
                "same_key_token_with_wrong_audience_is_rejected_privately",
            )
        ]
        self.report["authorization"] = {
            "real_gate_token_status": status,
            "same_session_continuation_status": continuation_status,
            "cross_identity_continuation_status": foreign_continuation[0],
            "cross_identity_refetch_status": foreign_refetch[0],
            "client_scope_change_status": scope_change[0],
            "client_projection_change_status": projection_change[0],
            "same_key_exact_claims_status": direct_valid_status,
            "same_key_wrong_issuer_status": wrong_issuer_response[0],
            "same_key_wrong_audience_status": wrong_audience_response[0],
            "denied_responses_exposed_electric_headers": any(
                not check["shape_headers_absent"] for check in denial_checks
            ),
            "denied_responses_exposed_protected_values": any(
                check["protected_value_present"] for check in denial_checks
            ),
            "denied_responses_exposed_shape_messages": any(
                check["shape_messages_present"] for check in denial_checks
            ),
            "tokens_recorded": False,
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--callback-port", type=int, default=8787)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--replication-attempts", type=int, default=40)
    parser.add_argument("--replication-interval-seconds", type=float, default=0.25)
    args = parser.parse_args()
    return AuthorizationProbe(args).run()


if __name__ == "__main__":
    raise SystemExit(main())
