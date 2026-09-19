#!/usr/bin/env python3
"""Validate the fixed RA06 revocation budget and measured observations."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


OPEN_RESPONSE_SCENARIOS = {
    "logout_open_response",
    "membership_removal_open_response",
    "session_expiry_open_response",
    "authority_unavailable_open_response",
}


def read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as source:
        value = json.load(source)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def validate_contract(contract: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    bound = contract.get("serverBoundMs")
    budgets = contract.get("componentBudgetsMs")
    scenarios = contract.get("requiredScenarios")
    browser = contract.get("browserOrdering")

    if not isinstance(bound, int) or bound <= 0:
        errors.append("serverBoundMs must be a positive integer")
    if not isinstance(budgets, dict) or not budgets:
        errors.append("componentBudgetsMs must be a non-empty object")
    elif any(not isinstance(value, int) or value < 0 for value in budgets.values()):
        errors.append("every component budget must be a non-negative integer")
    elif isinstance(bound, int) and sum(budgets.values()) != bound:
        errors.append("component budgets must add exactly to serverBoundMs")

    if not isinstance(scenarios, list) or len(scenarios) != len(set(scenarios)):
        errors.append("requiredScenarios must be a unique list")
    if not contract.get("recordedBeforeRuntimeImplementation"):
        errors.append("the budget must be recorded before runtime implementation")
    if contract.get("authority", {}).get("cacheIsAuthority") is not False:
        errors.append("a cache cannot be the revocation authority")
    if contract.get("authority", {}).get("notificationIsAuthority") is not False:
        errors.append("a notification cannot be the revocation authority")
    if not isinstance(browser, dict):
        errors.append("browserOrdering must be present")
    else:
        if browser.get("elapsedSlaMs") is not None:
            errors.append("the browser ordering contract must not invent a timer SLA")
        if browser.get("protectedExitAnimationAllowed") is not False:
            errors.append("protected exit animation must be disabled")
        if browser.get("responsiveComponentReplacementAllowed") is not False:
            errors.append("responsive resize must preserve component identity")
    return errors


def elapsed_ms(observation: dict[str, Any]) -> float | None:
    start = observation.get("triggerMonotonicNs")
    stop = observation.get("lastProtectedByteMonotonicNs")
    if not isinstance(start, int) or not isinstance(stop, int) or stop < start:
        return None
    return (stop - start) / 1_000_000


def validate_observations(
    contract: dict[str, Any], observations: dict[str, Any]
) -> list[str]:
    errors: list[str] = []
    required = set(contract["requiredScenarios"])
    rows = observations.get("scenarios")
    if not isinstance(rows, list):
        return ["observations.scenarios must be a list"]

    by_name: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("name"), str):
            errors.append("each observation must be an object with a name")
            continue
        name = row["name"]
        if name in by_name:
            errors.append(f"duplicate observation: {name}")
        by_name[name] = row

    missing = required - set(by_name)
    extra = set(by_name) - required
    if missing:
        errors.append(f"missing observations: {', '.join(sorted(missing))}")
    if extra:
        errors.append(f"unexpected observations: {', '.join(sorted(extra))}")

    bound = contract["serverBoundMs"]
    for name in OPEN_RESPONSE_SCENARIOS & set(by_name):
        row = by_name[name]
        duration = elapsed_ms(row)
        if row.get("openResponseAtTrigger") is not True:
            errors.append(f"{name}: response was not open at the trigger")
        if duration is None:
            errors.append(f"{name}: invalid monotonic timestamps")
        elif duration > bound:
            errors.append(f"{name}: {duration:.3f} ms exceeds {bound} ms")
        if row.get("newRequestDenied") is not True:
            errors.append(f"{name}: a new request was not denied")

    stale = by_name.get("stale_identity_refill")
    if stale:
        if stale.get("invalidationAdvancedBeforeEviction") is not True:
            errors.append("stale_identity_refill: invalidation did not advance first")
        if stale.get("staleValuePublished") is not False:
            errors.append("stale_identity_refill: stale authorization was published")

    reconnect = by_name.get("reconnect_after_revocation")
    if reconnect and reconnect.get("newRequestDenied") is not True:
        errors.append("reconnect_after_revocation: reconnect was not denied")

    command = by_name.get("clinical_command_after_revocation")
    if command:
        if command.get("formerCredentialTimeValid") is not True:
            errors.append("clinical command proof did not retain a time-valid credential")
        if command.get("freshValidationAttempted") is not True:
            errors.append("clinical command did not perform fresh validation")
        if command.get("commandDenied") is not True:
            errors.append("clinical command was not denied")
        if command.get("mutationCommitted") is not False:
            errors.append("clinical command committed a mutation")

    authority = by_name.get("authority_unavailable_open_response")
    if authority and authority.get("closedFailClosed") is not True:
        errors.append("authority_unavailable_open_response: response did not fail closed")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--observations", type=Path)
    args = parser.parse_args()

    try:
        contract = read_json(args.contract)
        errors = validate_contract(contract)
        if args.observations:
            errors.extend(validate_observations(contract, read_json(args.observations)))
    except (OSError, ValueError, json.JSONDecodeError, KeyError) as error:
        errors = [str(error)]

    if errors:
        print("Failed")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
