"""Source binding and production-wiring evidence for PRI c015."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import subprocess
from typing import Any


ASO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATHS = {
    "aso": (
        "docker-compose.yaml",
        "docker-compose.ra05.yaml",
        "docker/flint-gate/config.ra05.yaml",
        "docker/frf/shape-catalog.json",
        "scripts/pri_c015_evidence.py",
        "scripts/pri_c015_browser_lifecycle.py",
        "scripts/pri_c015_fixture.py",
        "scripts/ra05-stack.sh",
        "scripts/ra06c_campaign_config.py",
        "scripts/test-authorized-shape-composition.py",
        "scripts/test-authorized-shape-topology.py",
        "scripts/test-pri-c015-protected-replica.py",
        "scripts/test-ra11a-sync-conformance.py",
        "scripts/test-ra11c-browser-memory.py",
        "scripts/test-ra11c-materialization.py",
        "web/package.json",
        "web/pnpm-lock.yaml",
        "web/public/pglite-base.tgz",
        "web/ra11c-browser-memory.html",
        "web/ra11c-browser-lifecycle.html",
        "web/vendor/pem",
        "web/src/app/providers",
        "web/src/features/session",
        "web/src/shared/session-revocation-events.ts",
        "web/src/shared/sync",
        "web/vite.config.ts",
    ),
    "fabric": (
        ".dockerignore",
        "Dockerfile",
        "Cargo.lock",
        "Cargo.toml",
        "admin-ui",
        "crates",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "proto",
        "sdks/entity-management",
        "sdks/ts",
    ),
    "gate": (
        ".dockerignore",
        "Dockerfile",
        "Cargo.lock",
        "Cargo.toml",
        "crates",
    ),
}
IMPORT = re.compile(r"(?:from\s*|import\s*\(\s*|import\s*)[\"']([^\"']+)[\"']")
WATCH = re.compile(
    r"\b(?:WatchEntityType|watchEntityType|watch_entity_type|watchEntity|WatchType|watch_type)\b"
)
SOURCE_SUFFIXES = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json")


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def command_output(root: Path, *arguments: str) -> bytes:
    process = subprocess.run(
        list(arguments), cwd=root, capture_output=True, check=True
    )
    return process.stdout


def selected_files(root: Path, paths: tuple[str, ...]) -> dict[str, dict[str, Any]]:
    files: dict[str, dict[str, Any]] = {}
    for relative in paths:
        candidate = root / relative
        values = sorted(candidate.rglob("*")) if candidate.is_dir() else [candidate]
        for value in values:
            if (
                not value.is_file()
                or ".git" in value.parts
                or "node_modules" in value.parts
                or "target" in value.parts
                or "dist" in value.parts
            ):
                continue
            content = value.read_bytes()
            files[value.relative_to(root).as_posix()] = {
                "bytes": len(content),
                "sha256": sha256(content),
            }
    return files


def repository_state(root: Path, paths: tuple[str, ...]) -> dict[str, Any]:
    files = selected_files(root, paths)
    canonical = json.dumps(files, sort_keys=True, separators=(",", ":")).encode()
    status = command_output(root, "git", "status", "--porcelain=v1", "-z")
    unstaged = command_output(root, "git", "diff", "--binary", "--no-ext-diff")
    staged = command_output(
        root, "git", "diff", "--binary", "--cached", "--no-ext-diff"
    )
    return {
        "branch": command_output(root, "git", "branch", "--show-current").decode().strip(),
        "head": command_output(root, "git", "rev-parse", "HEAD").decode().strip(),
        "statusSha256": sha256(status),
        "unstagedDiffSha256": sha256(unstaged),
        "stagedDiffSha256": sha256(staged),
        "selectedAggregateSha256": sha256(canonical),
        "selectedFiles": files,
    }


def resolve_import(importer: Path, module: str) -> Path | None:
    if module.startswith("@/"):
        unresolved = ASO_ROOT / "web/src" / module[2:]
    elif module.startswith("."):
        unresolved = importer.parent / module
    else:
        return None
    candidates = [unresolved]
    if unresolved.suffix == "":
        candidates.extend(unresolved.with_suffix(suffix) for suffix in SOURCE_SUFFIXES)
        candidates.extend(unresolved / ("index" + suffix) for suffix in SOURCE_SUFFIXES)
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError(f"could not resolve {module!r} from {importer}")


def production_sync_proof() -> dict[str, Any]:
    entry = (ASO_ROOT / "web/src/app/providers/graph-provider.tsx").resolve()
    pending = [entry]
    scanned: set[Path] = set()
    while pending:
        source = pending.pop()
        if source in scanned or ".test." in source.name:
            continue
        scanned.add(source)
        if source.suffix not in SOURCE_SUFFIXES[:-1]:
            continue
        for module in IMPORT.findall(source.read_text()):
            dependency = resolve_import(source, module)
            if dependency is not None:
                pending.append(dependency)

    production_files = [
        path
        for path in (ASO_ROOT / "web/src").rglob("*")
        if path.is_file()
        and path.suffix in SOURCE_SUFFIXES[:-1]
        and ".test." not in path.name
        and "__tests__" not in path.parts
    ]
    matches = []
    for source in sorted(production_files):
        for match in WATCH.finditer(source.read_text()):
            matches.append(
                {
                    "file": source.relative_to(ASO_ROOT).as_posix(),
                    "symbol": match.group(0),
                }
            )
    closure_files = {
        path.relative_to(ASO_ROOT).as_posix(): sha256(path.read_bytes())
        for path in sorted(scanned)
    }
    provider = entry.read_text()
    canonical = json.dumps(
        closure_files, sort_keys=True, separators=(",", ":")
    ).encode()
    return {
        "entrypoint": entry.relative_to(ASO_ROOT).as_posix(),
        "closureAggregateSha256": sha256(canonical),
        "closureFiles": closure_files,
        "competingGenericWatchMatches": matches,
        "shapeTransportWired": "createFrfShapeTransport" in provider,
        "sqlMaterializerWired": "startReplicaRuntime" in provider,
    }
