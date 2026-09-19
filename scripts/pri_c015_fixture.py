"""Second authorized practice fixture for PRI c015 mounted lifecycle proof."""

from __future__ import annotations

import datetime
import json
from typing import Any


def _browser_session(probe: Any, identity_id: str, tag: str) -> dict[str, object]:
    return {
        "token": probe.sessions[identity_id]["token"],
        "verified": {
            "identityId": identity_id,
            "sessionId": probe.sessions[identity_id]["id"],
            "userId": probe.sql(f"SELECT md5('{tag}:user')::uuid;").splitlines()[-1],
            "practiceId": probe.practices[identity_id],
            "displayName": "Synthetic PRI c015 Surgeon",
            "capabilities": ["case:read"],
            "principal": "user",
            "expiresAt": (
                datetime.datetime.now(datetime.timezone.utc)
                + datetime.timedelta(hours=1)
            ).isoformat(),
            "authorizationRevision": "membership:ra05-composition",
        },
    }


def prepare_switch_fixture(probe: Any) -> str:
    """Seed a full, independently authorized replacement practice."""
    primary_identity = probe.identities[0]
    primary_tag = probe.fixture_tag
    primary_practice = probe.practice_id
    identity = probe.create_identity_session("pri-c015-switch")
    switch_tag = primary_tag + "_switch"
    probe.switch_fixture = {
        "identity": identity,
        "practice": probe.practices[identity],
        "tag": switch_tag,
    }
    try:
        probe.fixture_tag = switch_tag
        probe.seed_fixture(identity)
    finally:
        probe.fixture_tag = primary_tag
        probe.practice_id = primary_practice
        probe.fixture_cleanup_required = True
    lifecycle = {
        "primary": _browser_session(probe, primary_identity, primary_tag),
        "replacement": _browser_session(probe, identity, switch_tag),
    }
    replacement_token = probe.sessions[identity]["token"]
    probe.secret_values = tuple(sorted(
        set((*probe.secret_values, replacement_token, "Bearer " + replacement_token)),
        key=len,
        reverse=True,
    ))
    probe.stack_env["RA11C_LIFECYCLE_CONFIG"] = json.dumps(lifecycle)
    return identity


def cleanup_switch_fixture(probe: Any) -> dict[str, int]:
    """Remove the replacement practice while preserving primary cleanup state."""
    fixture = getattr(probe, "switch_fixture", None)
    if not fixture:
        return {}
    primary = (probe.practice_id, probe.fixture_tag, probe.fixture_cleanup_required)
    try:
        probe.practice_id = fixture["practice"]
        probe.fixture_tag = fixture["tag"]
        probe.fixture_cleanup_required = True
        return probe.cleanup_fixture()
    finally:
        probe.practice_id, probe.fixture_tag, _ = primary
        probe.fixture_cleanup_required = True
        probe.switch_fixture = None


def remove_materializer_scratch(probe: Any) -> bool:
    paths = (
        probe.materializer_output.with_suffix(probe.materializer_output.suffix + ".progress"),
        probe.materializer_output.with_suffix(probe.materializer_output.suffix + ".state.json"),
    )
    for path in paths:
        path.unlink(missing_ok=True)
    return not any(path.exists() for path in paths)
