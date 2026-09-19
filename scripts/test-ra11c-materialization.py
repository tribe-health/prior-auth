#!/usr/bin/env python3
"""RA11c: mounted Postgres through Gate/FRF into SQL and PEM acceptance."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys

from pri_c015_fixture import (
    cleanup_switch_fixture,
    prepare_switch_fixture,
    remove_materializer_scratch,
)


ROOT = Path(__file__).resolve().parents[1]
BASE_PATH = ROOT / "scripts/test-ra11a-sync-conformance.py"
DEFAULT_DATA_DIR = ROOT / ".runtime/ra11a-data/ra11c-materialization"
STATIC_CAMPAIGN_INPUT_PATHS = (
    "docker-compose.yaml",
    "docker-compose.ra05.yaml",
    "docker/flint-gate/config.ra05.yaml",
    "docker/frf/shape-catalog.json",
    "scripts/ra05-stack.sh",
    "scripts/ra06c_campaign_config.py",
    "scripts/pri_c015_fixture.py",
    "scripts/test-authorized-shape-composition.py",
    "scripts/test-ra11a-sync-conformance.py",
    "scripts/test-ra11c-browser-memory.py",
    "scripts/test-ra11c-materialization.py",
    "web/package.json",
    "web/pnpm-lock.yaml",
    "web/public/pglite-base.tgz",
    "web/ra11c-browser-memory.html",
    "web/vite.config.ts",
    "web/src/shared/sync/replica-browser-memory.ts",
    "web/src/shared/sync/replica-mounted.integration.test.ts",
)
LOCAL_IMPORT = re.compile(
    r"(?:from\s*|import\s*\(\s*|import\s*)[\"'](\.[^\"']+)[\"']"
)
LOCAL_SOURCE_SUFFIXES = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json")


def resolve_local_import(importer: Path, module: str) -> Path:
    unresolved = importer.parent / module
    candidates = [unresolved]
    if unresolved.suffix == "":
        candidates.extend(unresolved.with_suffix(suffix) for suffix in LOCAL_SOURCE_SUFFIXES)
        candidates.extend(unresolved / ("index" + suffix) for suffix in LOCAL_SOURCE_SUFFIXES)
    for candidate in candidates:
        if candidate.is_file():
            resolved = candidate.resolve()
            resolved.relative_to(ROOT)
            return resolved
    raise FileNotFoundError(f"could not resolve local import {module!r} from {importer}")


def campaign_input_paths() -> tuple[str, ...]:
    paths = {str((ROOT / value).resolve().relative_to(ROOT)) for value in STATIC_CAMPAIGN_INPUT_PATHS}
    pending = [ROOT / value for value in STATIC_CAMPAIGN_INPUT_PATHS if Path(value).suffix in LOCAL_SOURCE_SUFFIXES]
    scanned: set[Path] = set()
    while pending:
        source = pending.pop().resolve()
        if source in scanned or source.suffix not in LOCAL_SOURCE_SUFFIXES[:-1]:
            continue
        scanned.add(source)
        for module in LOCAL_IMPORT.findall(source.read_text()):
            dependency = resolve_local_import(source, module)
            paths.add(str(dependency.relative_to(ROOT)))
            pending.append(dependency)
    return tuple(sorted(paths))


def campaign_input_fingerprints() -> dict[str, object]:
    files: dict[str, dict[str, object]] = {}
    for relative_path in campaign_input_paths():
        content = (ROOT / relative_path).read_bytes()
        files[relative_path] = {
            "bytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
        }
    canonical = json.dumps(
        files, sort_keys=True, separators=(",", ":")
    ).encode()
    return {
        "aggregateSha256": hashlib.sha256(canonical).hexdigest(),
        "files": files,
    }


def load_base():
    spec = importlib.util.spec_from_file_location("ra11a_sync_base", BASE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the RA11a stack coordinator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PRE_RUN_INPUT_FINGERPRINTS = campaign_input_fingerprints()
base = load_base()


class MaterializationProbe(base.SyncConformanceProbe):
    def __init__(self, args):
        super().__init__(args)
        self.fixture_tag = "ra11c_" + self.fixture_tag.removeprefix("ra11a_")
        self.materializer_output = args.output.with_name("task-4-mounted-materializer.json")
        self.browser_memory_output = args.output.with_name(
            "task-4-mounted-browser-memory.json"
        )
        self.report.update({
            "campaign_input_fingerprints": {
                "before": PRE_RUN_INPUT_FINGERPRINTS,
            },
            "command": shlex.join(["python3", *sys.argv]),
            "effective_arguments": {
                "callbackPort": args.callback_port,
                "campaignSecrets": str(args.campaign_secrets.resolve()),
                "dataDir": str(args.data_dir.resolve()),
                "output": str(args.output.resolve()),
                "timeoutSeconds": args.timeout_seconds,
            },
            "scope": (
                "Synthetic Postgres through real Kratos, Gate, FRF and Electric "
                "into the production SQL materializer and PEM projector"
            ),
        })

    def cleanup(self) -> None:
        try:
            remaining = cleanup_switch_fixture(self)
            self.report["cleanup"]["switch_practice_rows"] = (
                "Passed"
                if not remaining or all(value == 0 for value in remaining.values())
                else "Failed"
            )
        except Exception as error:
            self.report["cleanup"]["switch_practice_rows"] = "Failed"
            self.report["cleanup"]["switch_practice_rows_error"] = self.redact(
                str(error)
            )
        super().cleanup()
        try:
            after = campaign_input_fingerprints()
            unchanged = after == PRE_RUN_INPUT_FINGERPRINTS
            self.report["campaign_input_fingerprints"]["after"] = after
            self.report["checks"]["campaign_inputs_unchanged"] = {
                "result": "Passed" if unchanged else "Failed",
                "beforeAggregateSha256": PRE_RUN_INPUT_FINGERPRINTS[
                    "aggregateSha256"
                ],
                "afterAggregateSha256": after["aggregateSha256"],
            }
        except OSError as error:
            self.report["campaign_input_fingerprints"]["afterError"] = str(error)
            self.report["checks"]["campaign_inputs_unchanged"] = {
                "result": "Failed",
                "error": str(error),
            }

    def run_materializer(self, session_token: str) -> None:
        if not getattr(self, "switch_fixture", None):
            prepare_switch_fixture(self)
        self.secret_values = tuple(sorted(
            set((*self.secret_values, session_token, "Bearer " + session_token)),
            key=len,
            reverse=True,
        ))
        if self.args.data_dir.exists():
            shutil.rmtree(self.args.data_dir)
        self.args.data_dir.parent.mkdir(parents=True, exist_ok=True)
        self.materializer_output.parent.mkdir(parents=True, exist_ok=True)
        self.materializer_output.unlink(missing_ok=True)
        environment = os.environ.copy()
        environment.update(self.stack_env)
        environment.update({
            "RA11C_MOUNTED": "1",
            "RA11C_SESSION_TOKEN": session_token,
            "RA11C_GATE_URL": base.composition.GATE,
            "RA11C_DATA_DIR": str(self.args.data_dir.resolve()),
            "RA11C_MATERIALIZER_OUTPUT": str(self.materializer_output.resolve()),
            "RA11C_PGLITE_BASE": str((ROOT / "web/public/pglite-base.tgz").resolve()),
        })
        browser_child = subprocess.run(
            [
                "python3",
                "scripts/test-ra11c-browser-memory.py",
                "--output",
                str(self.browser_memory_output.resolve()),
                "--timeout-seconds",
                str(self.args.timeout_seconds),
            ],
            cwd=ROOT,
            env=environment,
            text=True,
            capture_output=True,
            timeout=self.args.timeout_seconds + 60,
            check=False,
        )
        self.report["browser_memory_run"] = {
            "exit_code": browser_child.returncode,
            "stdout": self.redact(browser_child.stdout)[-1500:],
            "stderr": self.redact(browser_child.stderr)[-1500:],
        }
        if self.browser_memory_output.exists():
            self.report["browser_memory"] = json.loads(
                self.browser_memory_output.read_text()
            )
        else:
            self.report["browser_memory"] = {"result": "Failed"}
        runs = []
        for phase in ("initial", "continuation"):
            environment["RA11C_MOUNTED_PHASE"] = phase
            child = subprocess.run(
                [
                    "pnpm", "--dir", "web", "exec", "vitest", "run",
                    "src/shared/sync/replica-mounted.integration.test.ts",
                ],
                cwd=ROOT,
                env=environment,
                text=True,
                capture_output=True,
                timeout=self.args.timeout_seconds + 60,
                check=False,
            )
            runs.append({
                "phase": phase,
                "exit_code": child.returncode,
                "stdout": self.redact(child.stdout)[-3000:],
                "stderr": self.redact(child.stderr)[-1500:],
            })
        self.report["materializer_runs"] = runs
        self.report["materializer_exit_code"] = runs[-1]["exit_code"]
        if self.materializer_output.exists():
            self.materializer_result = json.loads(self.materializer_output.read_text())
        else:
            self.materializer_result = {"result": "Failed"}
        self.report["materializer"] = self.materializer_result
        self.check(
            "mounted_materializer_passed",
            len(runs) == 2
            and all(run["exit_code"] == 0 for run in runs)
            and self.materializer_result.get("result") == "Passed",
            exit_code=runs[-1]["exit_code"],
        )
        self.check(
            "browser_memory_passed",
            browser_child.returncode == 0
            and self.report["browser_memory"].get("result") == "Passed",
            exit_code=browser_child.returncode,
        )
        self.report["cleanup"]["materializer_scratch"] = (
            "Passed" if remove_materializer_scratch(self) else "Failed"
        )


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--callback-port", type=int, default=18788)
    result.add_argument("--campaign-secrets", type=Path, default=base.DEFAULT_SECRETS)
    result.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    result.add_argument("--output", type=Path, required=True)
    result.add_argument("--timeout-seconds", type=int, default=180)
    return result


def main() -> int:
    return MaterializationProbe(parser().parse_args()).run()


if __name__ == "__main__":
    raise SystemExit(main())
