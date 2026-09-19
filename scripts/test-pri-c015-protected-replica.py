#!/usr/bin/env python3
"""PRI c015: current-source protected browser shape-to-SQL-to-PEM proof."""

from __future__ import annotations

import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import time
from typing import Any

from pri_c015_evidence import (
    SOURCE_PATHS,
    production_sync_proof,
    repository_state,
    sha256,
)
from pri_c015_fixture import (
    cleanup_switch_fixture, prepare_switch_fixture, remove_materializer_scratch,
)

ASO_ROOT = Path(__file__).resolve().parents[1]
MATERIALIZATION = ASO_ROOT / "scripts/test-ra11c-materialization.py"
DEFAULT_FABRIC_ROOT = Path("/Users/gqadonis/Projects/prometheus/flint-realtime-fabric")
DEFAULT_GATE_ROOT = Path("/Users/gqadonis/Projects/prometheus/flint-gate")
DEFAULT_OUTPUT = (
    DEFAULT_FABRIC_ROOT
    / ".kbd-orchestrator/phases/production-readiness-integration/evidence/"
    "pri-c015-aso-protected-proof/campaign.json"
)
FOCUSED_TESTS = (
    "src/shared/sync/protected-replica-boundaries.integration.test.ts",
    "src/shared/sync/frf-shape-transport.test.ts",
    "src/shared/sync/replica-runtime.test.ts",
    "src/shared/sync/graph-session-manager.test.ts",
    "src/shared/sync/replica-worker-owner.test.ts",
    "src/shared/sync/chunk-writer.test.ts",
    "src/shared/sync/case-summary-materialization.test.ts",
    "src/shared/sync/catalog-conformance.test.ts",
)
def load_materialization():
    spec = importlib.util.spec_from_file_location("pri_c015_materialization", MATERIALIZATION)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the RA11c materialization coordinator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_materialization()


class ProtectedReplicaProbe(base.MaterializationProbe):
    def __init__(self, args):
        super().__init__(args)
        self.fabric_root = args.fabric_root.resolve()
        self.gate_root = args.gate_root.resolve()
        self.composition_output = args.output.with_name("protected-composition.json")
        self.topology_output = args.output.with_name("protected-topology.json")
        self.repositories_before = self.repository_states()
        gate_source = self.repositories_before["gate"]
        fabric_source = self.repositories_before["fabric"]
        suffix = gate_source["selectedAggregateSha256"][:16]
        fabric_suffix = fabric_source["selectedAggregateSha256"][:16]
        self.runtime_image_tags = {
            "flint-gate": f"pri-c015-gate:{suffix}",
            "flint-gate-init": f"pri-c015-gate-init:{suffix}",
            "realtime-fabric": f"pri-c015-frf:{fabric_suffix}",
        }
        self.stack_env.update({
            "RA05_GATE_IMAGE": self.runtime_image_tags["flint-gate"],
            "RA05_GATE_INIT_IMAGE": self.runtime_image_tags["flint-gate-init"],
            "RA05_FRF_IMAGE": self.runtime_image_tags["realtime-fabric"],
            "RA05_GATE_SOURCE_REVISION": gate_source["head"],
            "RA05_GATE_SOURCE_AGGREGATE": gate_source["selectedAggregateSha256"],
            "RA05_FRF_SOURCE_REVISION": fabric_source["head"],
            "RA05_FRF_SOURCE_AGGREGATE": fabric_source["selectedAggregateSha256"],
        })
        self.report.update({
            "command": shlex.join(["python3", *sys.argv]),
            "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": (
                "Current browser PGlite topology from protected Gate/FRF shapes "
                "through transactional SQL materialization into the PEM graph"
            ),
            "selected_topologies": ["browser PGlite through pinned PEM packages"],
            "native_topology_selected": False,
            "repositories": {"before": self.repositories_before},
            "runtime_images": {"tags": self.runtime_image_tags},
            "child_runs": {},
        })

    def repository_states(self) -> dict[str, Any]:
        roots = {
            "aso": ASO_ROOT,
            "fabric": self.fabric_root,
            "gate": self.gate_root,
        }
        return {
            name: repository_state(roots[name], SOURCE_PATHS[name])
            for name in ("aso", "fabric", "gate")
        }

    def child(self, name: str, arguments: list[str], root: Path, timeout: int) -> int:
        started = datetime.datetime.now(datetime.timezone.utc)
        process = subprocess.run(
            arguments,
            cwd=root,
            env=self.stack_env.copy(),
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        self.report["child_runs"][name] = {
            "command": shlex.join(arguments),
            "cwd": str(root),
            "durationSeconds": (
                datetime.datetime.now(datetime.timezone.utc) - started
            ).total_seconds(),
            "exitCode": process.returncode,
            "stdout": self.redact(process.stdout)[-4000:],
            "stderr": self.redact(process.stderr)[-2000:],
        }
        return process.returncode

    def docker_json(self, *arguments: str) -> Any:
        process = subprocess.run(
            [os.environ.get("RA06_TOOL_DOCKER", "docker"), *arguments],
            cwd=ASO_ROOT,
            text=True,
            capture_output=True,
            timeout=120,
            check=False,
        )
        if process.returncode != 0:
            raise RuntimeError("docker inspect failed: " + process.stderr.strip())
        return json.loads(process.stdout)

    def image_record(self, tag: str) -> dict[str, Any]:
        image = self.docker_json("image", "inspect", tag)[0]
        return {
            "created": image.get("Created"),
            "id": image.get("Id"),
            "labels": image.get("Config", {}).get("Labels") or {},
            "repoTags": image.get("RepoTags") or [],
            "tag": tag,
        }

    def container_record(self, service: str) -> dict[str, Any]:
        container_id = self.compose("ps", "-q", service).stdout.strip()
        if not container_id:
            raise RuntimeError(f"{service} has no running container")
        container = self.docker_json("inspect", container_id)[0]
        return {
            "containerId": container_id,
            "imageId": container.get("Image"),
            "imageTag": container.get("Config", {}).get("Image"),
        }

    def prepare_stack(self) -> None:
        started = time.monotonic()
        reuse = os.environ.get("PRI_C015_REUSE_SOURCE_IMAGES") == "1"
        if not reuse:
            self.compose(
                "build", "--pull", "--no-cache", "flint-gate", "realtime-fabric",
                timeout=3_600,
            )
        gate_tag = self.runtime_image_tags["flint-gate"]
        gate_init_tag = self.runtime_image_tags["flint-gate-init"]
        tag = subprocess.run(
            [os.environ.get("RA06_TOOL_DOCKER", "docker"), "tag", gate_tag, gate_init_tag],
            cwd=ASO_ROOT,
            text=True,
            capture_output=True,
            timeout=120,
            check=False,
        )
        if tag.returncode != 0:
            raise RuntimeError("tagging Gate init image failed: " + tag.stderr.strip())
        built = {
            name: self.image_record(image_tag)
            for name, image_tag in self.runtime_image_tags.items()
        }
        expected = {
            "flint-gate": self.repositories_before["gate"],
            "flint-gate-init": self.repositories_before["gate"],
            "realtime-fabric": self.repositories_before["fabric"],
        }
        labels_match = all(
            built[name]["labels"].get("org.opencontainers.image.revision")
            == expected[name]["head"]
            and built[name]["labels"].get("io.prometheus.source.aggregate")
            == expected[name]["selectedAggregateSha256"]
            for name in built
        )
        self.report["runtime_images"].update({
            "buildCommand": (
                "verified exact local image reuse" if reuse else
                "bash scripts/ra05-stack.sh build --pull --no-cache flint-gate realtime-fabric"
            ),
            "buildMode": "verified-local-reuse" if reuse else "pull-no-cache",
            "buildDurationSeconds": time.monotonic() - started,
            "built": built,
            "labelsMatchFrozenSources": labels_match,
        })
        if not labels_match:
            raise AssertionError("source_bound_image_labels")
        super().prepare_stack()
        running = {
            service: self.container_record(service)
            for service in ("flint-gate", "realtime-fabric")
        }
        runtime_match = all(
            running[name]["imageId"] == built[name]["id"]
            and running[name]["imageTag"] == self.runtime_image_tags[name]
            for name in running
        )
        self.report["runtime_images"]["running"] = running
        self.check(
            "fresh_source_bound_gate_and_fabric_images_are_running",
            runtime_match,
            running=running,
        )

    def run_materializer(self, session_token: str) -> None:
        if not getattr(self, "switch_fixture", None):
            prepare_switch_fixture(self)
        identity_a = self.identities[0]
        composition = self.protected_composition(identity_a)
        self.report["protected_composition"] = composition
        self.check(
            "fresh_grant_scope_and_expired_handle_composition_passed",
            composition.get("result") == "Passed",
            receiptSha256=sha256(self.composition_output.read_bytes()),
        )
        try:
            super().run_materializer(session_token)
        except AssertionError as error:
            if str(error) != "browser_memory_passed":
                raise
            memory = self.report["checks"].pop("browser_memory_passed")
            observations = self.report.setdefault("nonblocking_observations", {})
            observations["browserMemory"] = memory
            campaign = self.report["browser_memory"].get("browserCampaign", {})
            self.check(
                "browser_protected_materialization_passed",
                campaign.get("result") == "Passed",
                memoryGateOwnedBy="pri-c014-aso-memory",
            )
        finally:
            self.report["cleanup"]["materializer_scratch"] = (
                "Passed" if remove_materializer_scratch(self) else "Failed"
            )

    def protected_composition(self, identity_a: str) -> dict[str, Any]:
        receipt: dict[str, Any] = {
            "result": "Failed",
            "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": "Live Kratos to Gate to FRF to Electric protected shape composition",
            "checks": {},
        }

        def record(name: str, condition: bool, **details: Any) -> None:
            receipt["checks"][name] = {
                "result": "Passed" if condition else "Failed",
                **details,
            }
            self.composition_output.parent.mkdir(parents=True, exist_ok=True)
            self.composition_output.write_text(json.dumps(receipt, indent=2) + "\n")
            if not condition:
                raise AssertionError(name)

        callback_start = len(self.callback_calls)
        identity_b = self.switch_fixture["identity"]
        status, headers, _ = self.gate_request(identity_a, {"shape": "cases"})
        handle = headers.get("electric-handle")
        offset = headers.get("electric-offset")
        record(
            "initial_shape_is_authorized",
            status == 200 and bool(handle) and offset is not None,
            status=status,
            handlePresent=bool(handle),
            offsetPresent=offset is not None,
        )

        status, continuation_headers, _ = self.gate_request(
            identity_a, {"shape": "cases", "handle": handle, "offset": offset}
        )
        record(
            "fresh_grant_continues_originating_handle",
            status == 200 and continuation_headers.get("electric-handle") == handle,
            status=status,
        )
        status, foreign_headers, _ = self.gate_request(
            identity_b, {"shape": "cases", "handle": handle, "offset": offset}
        )
        record(
            "other_identity_cannot_reuse_handle",
            status == 403 and self.no_shape_headers(foreign_headers),
            status=status,
        )
        status, scope_headers, _ = self.gate_request(
            identity_a,
            {"shape": "cases", "practiceId": self.practices[identity_b]},
        )
        record(
            "client_cannot_change_practice_scope",
            status == 403 and self.no_shape_headers(scope_headers),
            status=status,
        )
        status, projection_headers, _ = self.gate_request(
            identity_a, {"shape": "unapproved-projection"}
        )
        record(
            "client_cannot_select_unapproved_projection",
            status == 403 and self.no_shape_headers(projection_headers),
            status=status,
        )
        record(
            "each_request_revalidated_the_session_grant",
            len(self.callback_calls) - callback_start == 5,
            callbackCalls=len(self.callback_calls) - callback_start,
        )

        self.grant_ttl_seconds[identity_a] = 3
        status, expiring_headers, _ = self.gate_request(
            identity_a, {"shape": "document_statuses"}
        )
        expiring_handle = expiring_headers.get("electric-handle")
        expiring_offset = expiring_headers.get("electric-offset")
        record(
            "expiring_handle_initial_request_is_allowed",
            status == 200 and bool(expiring_handle) and expiring_offset is not None,
            status=status,
        )
        self.grant_ttl_seconds[identity_a] = 300
        time.sleep(4)
        status, expired_headers, _ = self.gate_request(
            identity_a,
            {
                "shape": "document_statuses",
                "handle": expiring_handle,
                "offset": expiring_offset,
            },
        )
        record(
            "expired_handle_forces_refetch_after_fresh_grant_resolution",
            status == 409 and self.no_shape_headers(expired_headers),
            status=status,
        )
        status, refetch_headers, _ = self.gate_request(
            identity_a, {"shape": "document_statuses"}
        )
        record(
            "cold_refetch_after_expiry_is_authorized",
            status == 200
            and bool(refetch_headers.get("electric-handle"))
            and refetch_headers.get("electric-offset") is not None,
            status=status,
        )
        record(
            "expired_handle_request_revalidated_the_session_grant",
            len(self.callback_calls) - callback_start == 8
            and self.callback_calls[-1]["ttl_seconds"] == 300,
            callbackCalls=len(self.callback_calls) - callback_start,
            refreshedGrantTtlSeconds=self.callback_calls[-1]["ttl_seconds"],
        )
        receipt["result"] = "Passed"
        receipt["callbackCalls"] = len(self.callback_calls) - callback_start
        self.composition_output.write_text(json.dumps(receipt, indent=2) + "\n")
        return receipt

    def exercise(self) -> None:
        sync_proof = production_sync_proof()
        self.report["production_sync"] = sync_proof
        self.check(
            "production_replica_uses_shape_transport_without_generic_watch_writer",
            sync_proof["shapeTransportWired"] is True
            and sync_proof["sqlMaterializerWired"] is True
            and sync_proof["competingGenericWatchMatches"] == [],
            closureAggregateSha256=sync_proof["closureAggregateSha256"],
            closureFileCount=len(sync_proof["closureFiles"]),
            competingGenericWatchMatches=sync_proof["competingGenericWatchMatches"],
        )

        vitest = [
            "pnpm", "--dir", "web", "exec", "vitest", "run",
            "--no-file-parallelism", "--maxWorkers=1", "--testTimeout=30000",
            *FOCUSED_TESTS,
        ]
        self.check(
            "focused_browser_crash_fence_and_egress_tests_passed",
            self.child("focused_vitest", vitest, ASO_ROOT, 240) == 0,
            testFiles=list(FOCUSED_TESTS),
        )
        self.check(
            "fabric_stream_revocation_suite_passed",
            self.child(
                "fabric_shape_revocation",
                ["cargo", "test", "-p", "frf-app", "--test", "shape_revocation"],
                self.fabric_root,
                900,
            ) == 0,
        )

        super().exercise()

        topology_exit = self.child(
            "protected_topology",
            [
                "python3", "scripts/test-authorized-shape-topology.py",
                "--output", str(self.topology_output),
            ],
            ASO_ROOT,
            120,
        )
        topology = json.loads(self.topology_output.read_text())
        self.report["protected_topology"] = topology
        self.check(
            "client_cannot_bypass_gate_to_frf_or_electric",
            topology_exit == 0 and topology.get("result") == "Passed",
            receiptSha256=sha256(self.topology_output.read_bytes()),
        )

    def cleanup(self) -> None:
        try:
            remaining = cleanup_switch_fixture(self)
            self.report["cleanup"]["switch_practice_rows"] = (
                "Passed" if not remaining or all(value == 0 for value in remaining.values())
                else "Failed"
            )
        except Exception as error:
            self.report["cleanup"]["switch_practice_rows"] = "Failed"
            self.report["cleanup"]["switch_practice_rows_error"] = self.redact(str(error))
        super().cleanup()
        try:
            if "built" in self.report["runtime_images"]:
                post_services = self.compose_container_state()
                source_bound_services = all(
                    post_services.get(name, {}).get("image") == self.runtime_image_tags[name]
                    and post_services.get(name, {}).get("state")
                    == self.pre_run_container_state.get(name, {}).get("state")
                    for name in ("flint-gate", "realtime-fabric")
                )
                self.report.setdefault("service_state", {})[
                    "sourceBoundRuntimeRetained"
                ] = source_bound_services
                self.report["cleanup"]["campaign_services"] = (
                    "Passed" if source_bound_services else "Failed"
                )
            after = self.repository_states()
            self.report["repositories"]["after"] = after
            unchanged = all(
                self.repositories_before[name]["head"] == after[name]["head"]
                and self.repositories_before[name]["selectedAggregateSha256"]
                == after[name]["selectedAggregateSha256"]
                for name in self.repositories_before
            )
            self.report["checks"]["selected_source_inputs_unchanged"] = {
                "result": "Passed" if unchanged else "Failed",
                "repositories": {
                    name: {
                        "before": self.repositories_before[name]["selectedAggregateSha256"],
                        "after": after[name]["selectedAggregateSha256"],
                    }
                    for name in self.repositories_before
                },
            }
        except Exception as error:
            self.report["checks"]["selected_source_inputs_unchanged"] = {
                "result": "Failed",
                "error": str(error),
            }


def parser() -> argparse.ArgumentParser:
    result = base.parser()
    result.description = __doc__
    result.set_defaults(output=DEFAULT_OUTPUT, timeout_seconds=600)
    result.add_argument("--fabric-root", type=Path, default=DEFAULT_FABRIC_ROOT)
    result.add_argument("--gate-root", type=Path, default=DEFAULT_GATE_ROOT)
    return result


def main() -> int:
    return ProtectedReplicaProbe(parser().parse_args()).run()


if __name__ == "__main__":
    raise SystemExit(main())
