#!/usr/bin/env python3
"""Materialize and verify the frozen RA06c live-campaign configuration."""

from __future__ import annotations

import argparse
import json
import os
import secrets
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SECRETS = ROOT / ".runtime/ra06c/campaign-secrets.json"
DEFAULT_EFFECTIVE = ROOT / ".runtime/ra06c/effective-compose.json"
DEFAULT_ELECTRIC_URL = "http://host.docker.internal:8789"
BASH_TOOL = os.environ.get("RA06_TOOL_BASH", "bash")


def write_json(path: Path, value: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    temporary.chmod(0o600)
    temporary.replace(path)


def initialize(path: Path) -> None:
    if path.exists():
        load_secrets(path)
        path.chmod(0o600)
        return
    write_json(
        path,
        {
            "authority_role": "ra05_authority_" + secrets.token_hex(6),
            "authority_password": secrets.token_urlsafe(24),
            "gate_authority_role": "ra06_gate_reader_" + secrets.token_hex(6),
            "gate_authority_password": secrets.token_urlsafe(24),
            "runtime_role": "ra05_runtime_" + secrets.token_hex(6),
            "runtime_password": secrets.token_urlsafe(24),
        },
    )


def load_secrets(path: Path) -> dict[str, str]:
    value = json.loads(path.read_text())
    required = {
        "authority_role",
        "authority_password",
        "gate_authority_role",
        "gate_authority_password",
        "runtime_role",
        "runtime_password",
    }
    if set(value) != required or not all(
        isinstance(item, str) and item for item in value.values()
    ):
        raise ValueError("campaign secret file has an invalid shape")
    return value


def campaign_environment(path: Path, electric_url: str) -> dict[str, str]:
    value = load_secrets(path)
    return {
        "RA06C_GATE_AUTHORITY_DATABASE_URL": (
            "postgres://"
            + value["gate_authority_role"]
            + ":"
            + value["gate_authority_password"]
            + "@db:5432/flint"
        ),
        "RA06C_ELECTRIC_URL": electric_url,
    }


def resolved_compose(path: Path, electric_url: str) -> bytes:
    environment = os.environ.copy()
    environment.update(campaign_environment(path, electric_url))
    completed = subprocess.run(
        [BASH_TOOL, str(ROOT / "scripts/ra05-stack.sh"), "config", "--format", "json"],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        check=False,
    )
    if completed.returncode:
        raise RuntimeError("docker compose config failed")
    json.loads(completed.stdout)
    return completed.stdout


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument("command", choices=("init", "materialize", "check"))
    root.add_argument("--secrets", type=Path, default=DEFAULT_SECRETS)
    root.add_argument("--output", type=Path, default=DEFAULT_EFFECTIVE)
    root.add_argument("--electric-url", default=DEFAULT_ELECTRIC_URL)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        if args.command == "init":
            initialize(args.secrets)
            print("Passed: campaign secret identity is ready")
            return 0
        current = resolved_compose(args.secrets, args.electric_url)
        if args.command == "materialize":
            args.output.parent.mkdir(parents=True, exist_ok=True)
            temporary = args.output.with_suffix(args.output.suffix + ".tmp")
            temporary.write_bytes(current)
            temporary.chmod(0o600)
            temporary.replace(args.output)
            print("Passed: effective Compose configuration materialized")
            return 0
        if current != args.output.read_bytes():
            raise RuntimeError("effective Compose configuration differs from frozen input")
        print("Passed: launch environment matches frozen effective Compose configuration")
        return 0
    except (OSError, ValueError, json.JSONDecodeError, RuntimeError) as error:
        print(f"FAILED: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
