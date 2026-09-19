#!/usr/bin/env python3
"""Focused tests for the RA06 evidence verifier."""

from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/evidence"
    / "ra-06-bounded-revocation/budget-contract.json"
)
MODULE_PATH = ROOT / "scripts/verify-ra06-revocation.py"
SPEC = importlib.util.spec_from_file_location("ra06_verifier", MODULE_PATH)
assert SPEC and SPEC.loader
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


def observation(name: str, **values: object) -> dict[str, object]:
    return {"name": name, **values}


class RevocationConformanceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
        open_response = {
            "openResponseAtTrigger": True,
            "triggerMonotonicNs": 1_000_000_000,
            "lastProtectedByteMonotonicNs": 5_900_000_000,
            "newRequestDenied": True,
        }
        self.observations = {
            "scenarios": [
                observation("logout_open_response", **open_response),
                observation("membership_removal_open_response", **open_response),
                observation("session_expiry_open_response", **open_response),
                observation(
                    "stale_identity_refill",
                    invalidationAdvancedBeforeEviction=True,
                    staleValuePublished=False,
                ),
                observation(
                    "authority_unavailable_open_response",
                    **open_response,
                    closedFailClosed=True,
                ),
                observation("reconnect_after_revocation", newRequestDenied=True),
                observation(
                    "clinical_command_after_revocation",
                    formerCredentialTimeValid=True,
                    freshValidationAttempted=True,
                    commandDenied=True,
                    mutationCommitted=False,
                ),
            ]
        }

    def test_contract_and_complete_observations_pass(self) -> None:
        self.assertEqual([], VERIFIER.validate_contract(self.contract))
        self.assertEqual(
            [], VERIFIER.validate_observations(self.contract, self.observations)
        )

    def test_delivery_one_nanosecond_over_bound_fails(self) -> None:
        logout = self.observations["scenarios"][0]
        logout["lastProtectedByteMonotonicNs"] = 6_000_000_001

        errors = VERIFIER.validate_observations(self.contract, self.observations)

        self.assertTrue(any("logout_open_response" in error for error in errors))

    def test_late_stale_refill_fails(self) -> None:
        stale = self.observations["scenarios"][3]
        stale["staleValuePublished"] = True

        errors = VERIFIER.validate_observations(self.contract, self.observations)

        self.assertIn(
            "stale_identity_refill: stale authorization was published", errors
        )

    def test_protected_exit_animation_fails_contract(self) -> None:
        self.contract["browserOrdering"]["protectedExitAnimationAllowed"] = True

        errors = VERIFIER.validate_contract(self.contract)

        self.assertIn("protected exit animation must be disabled", errors)


if __name__ == "__main__":
    unittest.main()
