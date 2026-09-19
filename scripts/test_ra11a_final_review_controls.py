#!/usr/bin/env python3
"""Focused negative controls for RA11a final-review failure paths."""

from __future__ import annotations

import importlib.util
import copy
import json
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
COORDINATOR = ROOT / "scripts/test-ra11a-sync-conformance.py"
VERIFIER = ROOT / "scripts/verify-ra11a-sync-conformance.py"


def load_coordinator():
    spec = importlib.util.spec_from_file_location("ra11a_coordinator", COORDINATOR)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load RA11a coordinator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


coordinator = load_coordinator()


def load_verifier():
    spec = importlib.util.spec_from_file_location("ra11a_verifier", VERIFIER)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load RA11a verifier")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


verifier = load_verifier()


class FinalReviewControls(unittest.TestCase):
    def test_service_cleanup_error_cannot_be_overwritten_by_restored_state(self) -> None:
        self.assertFalse(
            coordinator.SyncConformanceProbe.service_cleanup_succeeded(
                state_restored=True, command_failed=True
            )
        )

    def test_stale_policy_inputs_fail_live_source_binding(self) -> None:
        original_sha256 = verifier.sha256
        for policy_path in (ROOT / "versions.toml", ROOT / "web/package.json"):
            with self.subTest(policy_path=policy_path):
                verifier.sha256 = lambda path, policy_path=policy_path: (
                    "0" * 64
                    if Path(path).resolve() == policy_path.resolve()
                    else original_sha256(path)
                )
                result = verifier.verify()
                binding = next(
                    check
                    for check in result["checks"]
                    if check["name"]
                    == "live_receipt_matches_final_executables_and_lock"
                )
                self.assertEqual(result["result"], "Failed")
                self.assertEqual(binding["result"], "Failed")
        verifier.sha256 = original_sha256

    def test_late_unhandled_rejection_fails_result_and_exit_code(self) -> None:
        source = """
import {
  completeTeardownAndRecordUnhandledRejectionCheck,
  createOwnedResource,
  exactLogFullFacadeRejection,
  outcomeFromFailureChecks,
  outcomeFromChecks,
  recordUnhandledRejectionCheck,
} from './report-gate.ts';
const unhandled = [];
process.on('unhandledRejection', (error) => unhandled.push(String(error)));
const checks = { behavior: true };
const unexpectedTeardownFailure = await completeTeardownAndRecordUnhandledRejectionCheck(
  checks,
  unhandled,
  async () => { void Promise.reject(new Error('injected teardown rejection')); },
);
let closeCalls = 0;
const failedCloseChecks = { behavior: true };
const closeFailure = await completeTeardownAndRecordUnhandledRejectionCheck(
  failedCloseChecks,
  [],
  async () => { closeCalls += 1; throw new Error('close failed'); },
);
const duplicateChecks = { behavior: true };
await recordUnhandledRejectionCheck(
  duplicateChecks,
  ['expected facade error', 'expected facade error'],
  ['expected facade error'],
);
let ownedResource = null;
let initializationCloseCalls = 0;
let initializationFailure;
try {
  await createOwnedResource(
    async () => ({ close: async () => { initializationCloseCalls += 1; } }),
    (resource) => { ownedResource = resource; },
    async () => { throw new Error('initialization failed'); },
  );
} catch (error) {
  initializationFailure = error;
}
const initializationChecks = { behavior: true };
const initializationTeardownFailure = await completeTeardownAndRecordUnhandledRejectionCheck(
  initializationChecks,
  [],
  async () => { await ownedResource?.close(); },
);
const exactObservation = {
  bodyPreview: 'parameter not allowed: log',
  path: '/v1/shape',
  query: { log: ['full'], offset: ['-1'], shape: ['cases'] },
  status: 400,
};
const exactFailure = 'HTTP Error 400 at http://127.0.0.1:4456/v1/shape?log=full&offset=-1&shape=cases: parameter not allowed: log';
const classifier = {
  exact: exactLogFullFacadeRejection(exactFailure, [exactObservation]),
  unrelatedStatuses: [401, 403, 409, 429, 503].map((status) =>
    exactLogFullFacadeRejection(
      `HTTP Error ${status} at http://127.0.0.1:4456/v1/shape?log=full: parameter not allowed: log`,
      [{ ...exactObservation, status }],
    )
  ),
  wrongBody: exactLogFullFacadeRejection(
    'HTTP Error 400 at http://127.0.0.1:4456/v1/shape?log=full: temporarily unavailable',
    [{ ...exactObservation, bodyPreview: 'temporarily unavailable' }],
  ),
  prefixedPath: exactLogFullFacadeRejection(
    'HTTP Error 400 at http://127.0.0.1:4456/prefix/v1/shape?log=full&offset=-1&shape=cases: parameter not allowed: log',
    [exactObservation],
  ),
  catalogParameter: exactLogFullFacadeRejection(
    'HTTP Error 400 at http://127.0.0.1:4456/v1/shape?catalog=full&offset=-1&shape=cases: parameter not allowed: log',
    [exactObservation],
  ),
  mismatchedShape: exactLogFullFacadeRejection(
    'HTTP Error 400 at http://127.0.0.1:4456/v1/shape?log=full&offset=-1&shape=documents: parameter not allowed: log',
    [exactObservation],
  ),
  mixedFailures: [401, 403, 409, 429, 503].map((status) =>
    exactLogFullFacadeRejection(exactFailure, [
      exactObservation,
      { ...exactObservation, status },
    ])
  ),
  mixedWrongBody: exactLogFullFacadeRejection(exactFailure, [
    exactObservation,
    { ...exactObservation, bodyPreview: 'temporarily unavailable' },
  ]),
};
process.stdout.write(JSON.stringify({
  success: outcomeFromChecks(checks),
  blocked: outcomeFromFailureChecks(checks, true),
  classifier,
  checks,
  closeCalls,
  closeFailure: String(closeFailure),
  closeOutcome: outcomeFromFailureChecks(failedCloseChecks, true),
  failedCloseChecks,
  duplicateChecks,
  duplicateOutcome: outcomeFromFailureChecks(duplicateChecks, true),
  initializationCloseCalls,
  initializationFailure: String(initializationFailure),
  initializationOutcome: outcomeFromFailureChecks(initializationChecks, false),
  initializationTeardownFailure: String(initializationTeardownFailure),
  unrelatedAfterFacade: outcomeFromFailureChecks({ behavior: true }, false),
  unexpectedTeardownFailure: String(unexpectedTeardownFailure),
}));
"""
        process = subprocess.run(
            [
                "node",
                "--experimental-strip-types",
                "--input-type=module",
                "--eval",
                source,
            ],
            cwd=ROOT / "conformance/ra11a-sync",
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(process.returncode, 0, process.stderr)
        observed = json.loads(process.stdout)
        self.assertEqual(observed["success"]["result"], "Failed")
        self.assertEqual(observed["success"]["exitCode"], 1)
        self.assertEqual(observed["blocked"]["result"], "Failed")
        self.assertEqual(observed["blocked"]["exitCode"], 1)
        self.assertFalse(observed["checks"]["noUnexpectedUnhandledRejections"])
        self.assertTrue(observed["classifier"]["exact"])
        self.assertEqual(
            observed["classifier"]["unrelatedStatuses"],
            [False, False, False, False, False],
        )
        self.assertFalse(observed["classifier"]["wrongBody"])
        self.assertFalse(observed["classifier"]["prefixedPath"])
        self.assertFalse(observed["classifier"]["catalogParameter"])
        self.assertFalse(observed["classifier"]["mismatchedShape"])
        self.assertEqual(
            observed["classifier"]["mixedFailures"],
            [False, False, False, False, False],
        )
        self.assertFalse(observed["classifier"]["mixedWrongBody"])
        self.assertEqual(observed["closeCalls"], 1)
        self.assertIn("close failed", observed["closeFailure"])
        self.assertEqual(observed["closeOutcome"]["result"], "Failed")
        self.assertEqual(observed["closeOutcome"]["exitCode"], 1)
        self.assertFalse(observed["failedCloseChecks"]["finalTeardown"])
        self.assertFalse(
            observed["duplicateChecks"]["noUnexpectedUnhandledRejections"]
        )
        self.assertEqual(observed["duplicateOutcome"]["result"], "Failed")
        self.assertEqual(observed["duplicateOutcome"]["exitCode"], 1)
        self.assertEqual(observed["initializationCloseCalls"], 1)
        self.assertIn("initialization failed", observed["initializationFailure"])
        self.assertEqual(observed["initializationOutcome"]["result"], "Failed")
        self.assertEqual(observed["initializationOutcome"]["exitCode"], 1)
        self.assertEqual(observed["initializationTeardownFailure"], "undefined")
        self.assertEqual(observed["unrelatedAfterFacade"]["result"], "Failed")
        self.assertEqual(observed["unrelatedAfterFacade"]["exitCode"], 1)

    def test_nested_blocked_receipt_mutations_fail_verification(self) -> None:
        original_load_json = verifier.load_json
        live_path = verifier.EVIDENCE / "task-5-real-facade.json"
        live = original_load_json(live_path)

        def mutate(path: tuple[str, ...], value: object) -> dict[str, object]:
            changed = copy.deepcopy(live)
            target = changed
            for key in path[:-1]:
                target = target[key]
            target[path[-1]] = value
            return changed

        mutations = [
            mutate(("materializer", "result"), "Failed"),
            mutate(("materializer_exit_code",), 1),
            mutate(("materializer", "failureClass"), "conformance-harness-failure"),
            mutate(("materializer", "checks", "finalTeardown"), False),
            mutate(
                (
                    "materializer",
                    "checks",
                    "noUnexpectedUnhandledRejections",
                ),
                False,
            ),
            mutate(
                ("materializer", "unhandledRejections"),
                [
                    live["materializer"]["failure"],
                    live["materializer"]["failure"],
                ],
            ),
            mutate(("materializer", "unhandledRejections"), ["unrelated"]),
        ]
        missing_failure = copy.deepcopy(live)
        del missing_failure["materializer"]["failure"]
        null_pair = copy.deepcopy(live)
        null_pair["materializer"]["failure"] = None
        null_pair["materializer"]["unhandledRejections"] = [None]
        wrong_type_pair = copy.deepcopy(live)
        wrong_type_pair["materializer"]["failure"] = 400
        wrong_type_pair["materializer"]["unhandledRejections"] = [400]
        arbitrary_pair = copy.deepcopy(live)
        arbitrary_pair["materializer"]["failure"] = "arbitrary"
        arbitrary_pair["materializer"]["unhandledRejections"] = ["arbitrary"]
        mutations.extend(
            [missing_failure, null_pair, wrong_type_pair, arbitrary_pair]
        )
        try:
            for changed in mutations:
                with self.subTest(changed=changed):
                    verifier.load_json = lambda path, changed=changed: (
                        changed if Path(path) == live_path else original_load_json(path)
                    )
                    result = verifier.verify()
                    gate = next(
                        check
                        for check in result["checks"]
                        if check["name"] == "blocked_receipt_has_clean_finalization"
                    )
                    self.assertEqual(result["result"], "Failed")
                    self.assertEqual(gate["result"], "Failed")
        finally:
            verifier.load_json = original_load_json

    def test_versions_decision_requires_exact_candidate_and_reason(self) -> None:
        exact = {
            "decisions": {
                "ra11a_sql_materializer": verifier.EXPECTED_DECISION,
            }
        }
        self.assertTrue(verifier.ra11a_decision_is_exact(exact))
        for replacement in (
            "Blocked: another candidate",
            verifier.EXPECTED_DECISION.replace("0.6.9", "0.6.8"),
            verifier.EXPECTED_DECISION.replace("adoption is prohibited", "adoption is allowed"),
            verifier.EXPECTED_DECISION.replace("unsupported log=full", "transient HTTP error"),
        ):
            with self.subTest(replacement=replacement):
                self.assertFalse(
                    verifier.ra11a_decision_is_exact(
                        {"decisions": {"ra11a_sql_materializer": replacement}}
                    )
                )

    def test_role_creation_race_never_claims_or_drops_external_role(self) -> None:
        probe = object.__new__(coordinator.SyncConformanceProbe)
        probe.gate_authority_role = "ra11a_gate"
        probe.gate_authority_password = "synthetic-password"
        probe.gate_role_cleanup_required = False
        probe.gate_role_created = False
        probe.pre_run_gate_role_state = None
        probe.report = {}
        external_role = {
            "bypassRls": False,
            "canLogin": True,
            "createDb": False,
            "createRole": False,
            "inherit": True,
            "memberships": ["aso_authority_event_reader"],
            "replication": False,
            "superuser": False,
        }
        states = iter([None, external_role, external_role])
        probe.gate_role_state = lambda: next(states)
        statements: list[str] = []

        def duplicate_create(statement: str) -> str:
            statements.append(statement)
            raise RuntimeError("duplicate_object")

        probe.sql = duplicate_create
        with self.assertRaisesRegex(RuntimeError, "duplicate_object"):
            probe.prepare_gate_role()
        self.assertFalse(probe.gate_role_created)
        self.assertEqual(probe.report["role_creation_failure_state"], external_role)
        self.assertFalse(probe.cleanup_gate_role())
        self.assertEqual(len(statements), 1)
        self.assertNotIn("DROP ROLE", statements[0])

    def test_ambiguous_seed_commit_still_runs_twelve_table_cleanup(self) -> None:
        probe = object.__new__(coordinator.SyncConformanceProbe)
        probe.practices = {
            "identity": "00000000-0000-0000-0000-000000000001"
        }
        probe.practice_id = None
        probe.fixture_tag = "ra11a_ambiguous_commit"
        probe.fixture_cleanup_required = False
        seed_statements: list[str] = []

        def ambiguous_commit(statement: str) -> str:
            seed_statements.append(statement)
            raise RuntimeError("transport failed after COMMIT")

        probe.sql = ambiguous_commit
        with self.assertRaisesRegex(RuntimeError, "after COMMIT"):
            probe.seed_fixture("identity")
        self.assertTrue(probe.fixture_cleanup_required)
        self.assertIn("COMMIT;", seed_statements[0])

        empty_counts = {
            "cases": 0,
            "case_evidence": 0,
            "document_types": 0,
            "documents": 0,
            "evidence_citations": 0,
            "patients": 0,
            "payers": 0,
            "policies": 0,
            "policy_criteria": 0,
            "policy_types": 0,
            "practices": 0,
            "users": 0,
        }
        cleanup_statements: list[str] = []

        def cleanup(statement: str) -> str:
            cleanup_statements.append(statement)
            return json.dumps(empty_counts)

        probe.sql = cleanup
        self.assertEqual(probe.cleanup_fixture(), empty_counts)
        self.assertFalse(probe.fixture_cleanup_required)
        self.assertEqual(len(cleanup_statements), 1)
        for table in empty_counts:
            self.assertIn(f"DELETE FROM {table}", cleanup_statements[0])


if __name__ == "__main__":
    unittest.main()
