#!/usr/bin/env python3
"""Run one local RA06 command and bind its receipt to a frozen candidate."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from ra06c_candidate_manifest import (
    SECRET_KEY,
    ManifestError,
    parse_named,
    load_redaction_key,
    sanitize_string,
    sha256_file,
    toolchain_paths,
    validate_manifest,
)

SCHEMA_VERSION = 1


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def sanitized_command(command: list[str]) -> list[str]:
    sanitized: list[str] = []
    redact_next = False
    for argument in command:
        if redact_next:
            sanitized.append("<redacted-present>" if argument else "<redacted-absent>")
            redact_next = False
            continue
        key, separator, value = argument.partition("=")
        if separator and SECRET_KEY.search(key):
            marker = "<redacted-present>" if value else "<redacted-absent>"
            sanitized.append(f"{key}={marker}")
            continue
        if argument.startswith("-") and SECRET_KEY.search(argument.lstrip("-")):
            sanitized.append(argument)
            redact_next = True
            continue
        sanitized.append(sanitize_string(argument))
    return sanitized


def write_json(path: Path, value: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def bind_command_executable(command: list[str], paths: dict[str, Path]) -> list[str]:
    aliases = {
        "bash": "bash",
        "cargo": "cargo",
        "docker": "docker",
        "env": "env",
        "flutter": "flutter",
        "git": "git",
        "node": "node",
        "pnpm": "pnpm",
        "python": "python",
        "python3": "python",
        "rg": "rg",
        "rustc": "rustc",
        "rustup": "rustup",
    }
    bound = list(command)
    label = aliases.get(Path(bound[0]).name)
    if label in paths:
        bound[0] = str(paths[label])
    if Path(bound[0]).name == "env":
        for index, argument in enumerate(bound[1:], start=1):
            if "=" in argument:
                continue
            label = aliases.get(Path(argument).name)
            if label in paths:
                bound[index] = str(paths[label])
            break
    return bound


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument("--manifest", required=True)
    root.add_argument("--repo", action="append", default=[], required=True)
    root.add_argument("--effective-config", action="append", default=[])
    root.add_argument("--lock", action="append", default=[])
    root.add_argument("--fixture", action="append", default=[])
    root.add_argument("--openspec-contract", action="append", default=[])
    root.add_argument("--artifact", action="append", default=[])
    root.add_argument("--secret-input", action="append", default=[])
    root.add_argument("--redaction-key", required=True)
    root.add_argument("--result-output", action="append", default=[])
    root.add_argument("--receipt", required=True)
    root.add_argument("--log", required=True)
    root.add_argument("--cwd")
    root.add_argument("command_args", nargs=argparse.REMAINDER)
    return root


def main() -> int:
    args = parser().parse_args()
    command = args.command_args
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        print("FAILED: command is required after --", file=sys.stderr)
        return 2

    receipt_path = Path(args.receipt)
    log_path = Path(args.log)
    started_at = timestamp()
    exit_code: int | None = None
    pre_errors: list[str] = []
    post_errors: list[str] = []
    output_errors: list[str] = []
    outputs: list[dict[str, object]] = []
    manifest: dict[str, object] = {}
    failure: str | None = None

    try:
        manifest = json.loads(Path(args.manifest).read_text())
        roots = parse_named(args.repo, "repository")
        configs = parse_named(args.effective_config, "effective config")
        locks = parse_named(args.lock, "lock")
        fixtures = parse_named(args.fixture, "fixture")
        openspec_contracts = parse_named(args.openspec_contract, "OpenSpec contract")
        artifacts = parse_named(args.artifact, "artifact")
        secret_inputs = parse_named(args.secret_input, "secret input")
        redaction_key = load_redaction_key(Path(args.redaction_key))
        result_outputs = parse_named(args.result_output, "result output")
        pre_errors = validate_manifest(
            manifest,
            roots,
            configs,
            artifacts,
            secret_inputs,
            redaction_key,
            locks,
            fixtures,
            openspec_contracts,
        )
        if not pre_errors:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            for output_path in result_outputs.values():
                Path(output_path).unlink(missing_ok=True)
            paths = toolchain_paths()
            command = bind_command_executable(command, paths)
            environment = os.environ.copy()
            environment["RA06_CANDIDATE_DIGEST"] = str(manifest["candidate_digest"])
            for label, path in paths.items():
                environment[f"RA06_TOOL_{label.upper()}"] = str(path)
            with log_path.open("wb") as log:
                completed = subprocess.run(
                    command,
                    cwd=args.cwd,
                    env=environment,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    check=False,
                )
            exit_code = completed.returncode
            post_errors = validate_manifest(
                manifest,
                roots,
                configs,
                artifacts,
                secret_inputs,
                redaction_key,
                locks,
                fixtures,
                openspec_contracts,
            )
            for label, output_path_value in sorted(result_outputs.items()):
                output_path = Path(output_path_value)
                if not output_path.is_file():
                    output_errors.append(f"result output is missing: {label}")
                    continue
                try:
                    result = json.loads(output_path.read_text())
                except json.JSONDecodeError:
                    output_errors.append(f"result output is not valid JSON: {label}")
                    continue
                if result.get("candidate_digest") != manifest["candidate_digest"]:
                    output_errors.append(
                        f"result output candidate digest mismatch: {label}"
                    )
                outputs.append(
                    {
                        "label": label,
                        "name": output_path.name,
                        "sha256": sha256_file(output_path),
                        "size": output_path.stat().st_size,
                    }
                )
    except (ManifestError, OSError, json.JSONDecodeError, KeyError) as error:
        failure = str(error)

    passed = (
        not failure
        and not pre_errors
        and exit_code == 0
        and not post_errors
        and not output_errors
    )
    receipt: dict[str, object] = {
        "schema_version": SCHEMA_VERSION,
        "candidate_digest": manifest.get("candidate_digest"),
        "started_at": started_at,
        "completed_at": timestamp(),
        "command": sanitized_command(command),
        "working_directory": sanitize_string(args.cwd) if args.cwd else None,
        "exit_code": exit_code,
        "pre_validation_errors": pre_errors,
        "post_validation_errors": post_errors,
        "output_validation_errors": output_errors,
        "failure": failure,
        "result": "Passed" if passed else "Failed",
        "log": {
            "name": log_path.name,
            "sha256": sha256_file(log_path) if log_path.is_file() else None,
            "size": log_path.stat().st_size if log_path.is_file() else None,
        },
        "outputs": outputs,
    }
    write_json(receipt_path, receipt)
    print(f"{receipt['result']}: {receipt.get('candidate_digest')}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
