#!/usr/bin/env python3
"""Focused tests for RA06d-02 packet identity and monotonic activity helpers."""

from __future__ import annotations

import hashlib
import json
import importlib.util
from pathlib import Path
import sys
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / (
    ".kbd-orchestrator/phases/runtime-architecture/children/"
    "ra06-final-review-cycle-repair/review/ra06d-02-refreeze-and-replay"
)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    sys.path.insert(0, str(ROOT / "scripts"))
    packet = load_module(
        "ra06d02_packet_builder", REVIEW / "build-candidate-review-packet.py"
    )
    timing = load_module(
        "ra06d02_live_timing", ROOT / "scripts/test-ra06-revocation-live.py"
    )
    validator = load_module(
        "ra06d02_packet_validator", REVIEW / "validate-candidate-review-packet.py"
    )
    manifest = load_module("ra06d02_manifest", ROOT / "scripts/ra06c_candidate_manifest.py")
    rules = json.loads((REVIEW / "candidate-exclusions.json").read_text())["rules"]
    inventory = [{"repository": "prior-auth", "path": "runtime.txt", "kind": "file"},
                 {"repository": "prior-auth", "path": "deleted.txt", "kind": "deleted"}]
    members = ["prior-auth/runtime.txt", "__candidate_source_manifest__.json", "__candidate_manifest__.json"]
    errors = []
    validator.validate_bundle_members(members, inventory, errors)
    assert not errors
    for extra in (".prometheus/history.md", "__extra/.refiner/history.md",
                  "prior-auth/runtime.txt", "prior-auth/deleted.txt"):
        errors = []
        validator.validate_bundle_members([*members, extra], inventory, errors)
        assert errors, f"unexpected bundle member accepted: {extra}"

    with tempfile.TemporaryDirectory(prefix="ra06d02-review-") as directory:
        path = Path(directory) / "material.txt"
        raw = b"owner=/Users/gqadonis\n"
        path.write_bytes(raw)
        material = packet.review_material(path, "prior-auth:material.txt")
        displayed = b"owner=<redacted-home>\n"
        assert material["raw_size"] == len(raw)
        assert material["raw_sha256"] == hashlib.sha256(raw).hexdigest()
        assert material["size"] == len(displayed)
        assert material["sha256"] == hashlib.sha256(displayed).hexdigest()
        assert material["content"] == displayed.decode()
        assert material["redactions"] == ["absolute home prefix"]
        task_entry = {"normalized": "openspec-task-checkboxes"}
        unchecked = b"- [ ] Preserve task content.\n"
        checked = b"- [x] Preserve task content.\n"
        changed = b"- [x] Change task content.\n"
        assert packet.project_source_bytes(task_entry, unchecked) == (
            packet.project_source_bytes(task_entry, checked)
        )
        assert packet.project_source_bytes(task_entry, checked) != (
            packet.project_source_bytes(task_entry, changed)
        )
        assert packet.is_process_memory_path(".prometheus/knowledge/review.md")
        assert packet.is_process_memory_path(".refiner/artifacts/change/review.md")
        assert packet.is_process_memory_path(".kbd-orchestrator/review/findings.json")
        for folder in (".prometheus", ".refiner", ".kbd-orchestrator"):
            nested = f"crates/gateway/{folder}/history.txt"
            assert packet.is_process_memory_path(nested)
            assert validator.is_process_memory_path(nested)
            assert manifest.exclusion_for(nested, manifest.rules_for("flint-forge", rules))
        assert not packet.is_process_memory_path("crates/aso-host/src/lib.rs")

        repository = Path(directory) / "repository"
        repository.mkdir()
        def git(*arguments):
            return subprocess.run(
                (packet.GIT_TOOL, "-C", str(repository), *arguments),
                check=True, capture_output=True, text=True,
            ).stdout.strip()
        git("init")
        (repository / "runtime.txt").write_text("original runtime\n")
        history_folders = tuple(
            prefix + folder
            for prefix in ("", "crates/gateway/")
            for folder in (".prometheus", ".refiner", ".kbd-orchestrator")
        )
        for folder in history_folders:
            (repository / folder).mkdir(parents=True)
            (repository / folder / "history.txt").write_text("old review\n")
        git("add", ".")
        git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
            "commit", "-m", "Synthetic review fixture")
        (repository / "runtime.txt").write_text("changed runtime\n")
        for folder in history_folders:
            (repository / folder / "history.txt").write_text("PRIVATE_REVIEW_HISTORY\n")
        git("add", ".")
        (repository / "runtime.txt").write_text("changed runtime\nunstaged runtime\n")
        for folder in history_folders:
            (repository / folder / "history.txt").write_text("PRIVATE_REVIEW_HISTORY_UNSTAGED\n")
        (repository / ".refiner" / "untracked.txt").write_text("PRIVATE_REVIEW_HISTORY\n")
        (repository / "crates/gateway/.prometheus/untracked.txt").write_text("PRIVATE_REVIEW_HISTORY\n")
        original_root = packet.REPOSITORIES["prior-auth"]
        packet.REPOSITORIES["prior-auth"] = repository
        try:
            diff = packet.repository_diff({"label": "prior-auth", "head": git("rev-parse", "HEAD"),
                                           "head_tree": git("rev-parse", "HEAD^{tree}")})
        finally:
            packet.REPOSITORIES["prior-auth"] = original_root
        assert "changed runtime" in diff["head_to_worktree"]["content"]
        assert "changed runtime" in diff["head_to_index"]["content"]
        assert "unstaged runtime" in diff["index_to_worktree"]["content"]
        for name in ("head_to_worktree", "head_to_index", "index_to_worktree", "status"):
            assert "PRIVATE_REVIEW_HISTORY" not in diff[name]["content"]
            assert "history.txt" not in diff[name]["content"]
            assert "untracked.txt" not in diff[name]["content"]

    trigger = 10.0
    assert timing.response_active_at_trigger(trigger, None)
    assert timing.response_active_at_trigger(trigger, trigger)
    assert timing.response_active_at_trigger(trigger, trigger + 0.001)
    assert not timing.response_active_at_trigger(trigger, trigger - 0.001)
    expiry_trigger, expiry_trigger_epoch_ns = timing.conservative_expiry_trigger(
        101.0, 100.0, 10.0
    )
    assert expiry_trigger == 10.9
    assert expiry_trigger_epoch_ns == 100_900_000_000
    print(
        "Passed: review identities, strict activity, and conservative expiry trigger"
    )


if __name__ == "__main__":
    main()
