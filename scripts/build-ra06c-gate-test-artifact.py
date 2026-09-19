#!/usr/bin/env python3
"""Build the Flint Gate core test binary and copy it to a stable candidate path."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gate-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    command = [
        os.environ.get("RA06_TOOL_CARGO", "cargo"),
        "test",
        "--locked",
        "--manifest-path",
        str(args.gate_root / "Cargo.toml"),
        "-p",
        "flint-gate-core",
        "--all-features",
        "--no-run",
        "--message-format=json",
    ]
    completed = subprocess.run(
        command,
        cwd=args.gate_root,
        capture_output=True,
        text=True,
        check=False,
    )
    print(completed.stdout, end="")
    print(completed.stderr, end="", file=sys.stderr)
    if completed.returncode:
        return completed.returncode
    executables = []
    for line in completed.stdout.splitlines():
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        target = message.get("target", {})
        profile = message.get("profile", {})
        executable = message.get("executable")
        if (
            message.get("reason") == "compiler-artifact"
            and target.get("name") in {"flint-gate-core", "flint_gate_core"}
            and profile.get("test") is True
            and executable
        ):
            executables.append(Path(executable))
    if len(executables) != 1:
        print(
            f"expected one flint-gate-core test executable, found {len(executables)}",
            file=sys.stderr,
        )
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    shutil.copy2(executables[0], temporary)
    temporary.chmod(0o755)
    temporary.replace(args.output)
    print("candidate_test_artifact=" + str(args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
