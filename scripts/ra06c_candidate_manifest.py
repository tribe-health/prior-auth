#!/usr/bin/env python3
"""Create and validate the source/runtime identity for the RA06 local campaign."""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import hmac
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tomllib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

SCHEMA_VERSION = 1
SECRET_KEY = re.compile(
    r"(?:authorization|cookie|credential|password|passwd|private[_-]?key|secret|token|api[_-]?key)",
    re.IGNORECASE,
)
URI_USERINFO = re.compile(r"(?P<scheme>[a-z][a-z0-9+.-]*://)[^/@\s]+@", re.IGNORECASE)
BEARER = re.compile(r"\bBearer\s+[^\s\"']+", re.IGNORECASE)
QUERY_SECRET = re.compile(
    r"([?&](?:access_token|api_key|password|secret|token)=)[^&#\s]+", re.IGNORECASE
)
PRIVATE_KEY = re.compile(
    r"-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----", re.DOTALL
)
HOME_PATH = re.compile(
    r"(?<![A-Za-z0-9])(?:/Users/[^/\s:\"'\}\]\)]+|/home/[^/\s:\"'\}\]\)]+)"
    r"(?:/[^\s,;:\"'\}\]\)]*)?"
)
TASK_CHECKBOX = re.compile(r"(?m)^(\s*-\s+\[)[ xX](\]\s)")
TEXT_ASSIGNMENT = re.compile(
    r"^(?P<prefix>\s*(?:[-]\s*)?(?P<key>[A-Za-z0-9_.-]+)\s*[:=]\s*)(?P<value>.*)$"
)
TOOLCHAINS = (
    ("git", ("git", "--version")),
    ("rustc", ("rustc", "-Vv")),
    ("cargo", ("cargo", "-V")),
    ("node", ("node", "--version")),
    ("pnpm", ("pnpm", "--version")),
    ("python", (sys.executable, "--version")),
    ("docker", ("docker", "--version")),
    ("bash", ("bash", "--version")),
    ("flutter", ("flutter", "--version", "--machine")),
    ("rg", ("rg", "--version")),
    ("rustup", ("rustup", "--version")),
    ("env", ("/usr/bin/env", "-i")),
)
BUILD_ENV_ALLOWLIST = frozenset(
    {
        "CARGO_HOME",
        "DOCKER_CONTEXT",
        "DOCKER_HOST",
        "HOME",
        "LOGNAME",
        "PATH",
        "RUSTUP_HOME",
        "SHELL",
        "SSL_CERT_DIR",
        "SSL_CERT_FILE",
        "TMPDIR",
        "USER",
    }
)
HERMETIC_BUILD_HOME = Path("/tmp/ra06d02-build-home")
HERMETIC_CARGO_HOME = Path("/tmp/ra06d02-cargo-home")
HERMETIC_DOCKER_CONFIG = Path("/tmp/ra06d02-docker-config")
SOURCE_HOME = Path("/Users/gqadonis")
BUILD_MANIFESTS = (
    ("prior-auth", Path("/Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/Cargo.toml")),
    ("flint-gate", Path(os.environ.get(
        "RA06_GATE_SOURCE_ROOT", "/Users/gqadonis/Projects/prometheus/flint-gate"
    )) / "Cargo.toml"),
)
PRIOR_AUTH_ROOT = BUILD_MANIFESTS[0][1].parent
PNPM_INSTALL_ROOT = PRIOR_AUTH_ROOT / "web/node_modules"
DART_PACKAGE_CONFIG = PRIOR_AUTH_ROOT / "mobile/.dart_tool/package_config.json"


class ManifestError(RuntimeError):
    """The candidate cannot be represented or validated safely."""


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def sanitized_path(path: Path) -> str:
    absolute = path.absolute()
    try:
        relative = absolute.relative_to(SOURCE_HOME.resolve())
    except ValueError:
        return str(absolute)
    return f"<redacted-home>/{relative.as_posix()}"


def load_redaction_key(path: Path) -> bytes:
    key = path.read_bytes()
    if len(key) < 32:
        raise ManifestError("redaction key must contain at least 32 bytes")
    return key


def hmac_sha256(key: bytes, value: bytes) -> str:
    return hmac.new(key, value, hashlib.sha256).hexdigest()


def run_git(root: Path, *args: str) -> str:
    completed = subprocess.run(
        ("git", "-C", str(root), *args), capture_output=True, text=True, check=False
    )
    if completed.returncode:
        raise ManifestError(f"git {' '.join(args)} failed for {root.name}: {completed.stderr.strip()}")
    return completed.stdout.strip()


def parse_named(values: list[str], kind: str) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for value in values:
        name, separator, item = value.partition("=")
        if not separator or not name or not item:
            raise ManifestError(f"{kind} must use NAME=VALUE: {value!r}")
        if name in parsed:
            raise ManifestError(f"duplicate {kind} name: {name}")
        parsed[name] = item
    return parsed


def rules_for(label: str, rules: list[dict[str, str]]) -> list[dict[str, str]]:
    return [rule for rule in rules if rule["repository"] in ("*", label)]


def exclusion_for(path: str, rules: list[dict[str, str]]) -> dict[str, str] | None:
    return next((rule for rule in rules if fnmatch.fnmatchcase(path, rule["pattern"])), None)


def index_entries(root: Path) -> dict[str, tuple[str, str]]:
    raw = subprocess.check_output(
        ("git", "-C", str(root), "ls-files", "--stage", "-z")
    )
    entries: dict[str, tuple[str, str]] = {}
    for record in raw.decode(errors="surrogateescape").split("\0"):
        if not record:
            continue
        metadata, path = record.split("\t", 1)
        mode, oid, stage = metadata.split()
        if stage == "0":
            entries[path] = (mode, oid)
    return entries


def head_entries(root: Path) -> dict[str, tuple[str, str]]:
    raw = subprocess.check_output(
        ("git", "-C", str(root), "ls-tree", "-r", "-z", "HEAD")
    )
    entries: dict[str, tuple[str, str]] = {}
    for record in raw.decode(errors="surrogateescape").split("\0"):
        if not record:
            continue
        metadata, path = record.split("\t", 1)
        mode, _kind, oid = metadata.split()
        entries[path] = (mode, oid)
    return entries


def worktree_paths(root: Path) -> list[str]:
    raw = subprocess.check_output(
        ("git", "-C", str(root), "ls-files", "-c", "-o", "--exclude-standard", "-z")
    )
    return sorted(set(raw.decode(errors="surrogateescape").split("\0")) - {""})


def file_entry(
    root: Path,
    relative: str,
    indexed: tuple[str, str] | None,
    headed: tuple[str, str] | None,
) -> dict[str, Any]:
    path = root / relative
    tracked = indexed is not None
    index_mode, index_oid = indexed or (None, None)
    _head_mode, head_oid = headed or (None, None)
    base: dict[str, Any] = {"path": relative, "tracked": tracked}
    if tracked:
        base.update({"index_oid": index_oid, "head_oid": head_oid})
    if not os.path.lexists(path):
        return {**base, "kind": "deleted", "mode": index_mode}
    if index_mode == "160000":
        head = run_git(path, "rev-parse", "HEAD") if (path / ".git").exists() else None
        dirty = bool(run_git(path, "status", "--porcelain")) if head else None
        return {
            **base,
            "kind": "gitlink",
            "mode": index_mode,
            "worktree_head": head,
            "worktree_dirty": dirty,
        }
    metadata = path.lstat()
    if stat.S_ISLNK(metadata.st_mode):
        target = os.readlink(path)
        return {
            **base,
            "kind": "symlink",
            "mode": "120000",
            "target": target,
            "sha256": sha256_bytes(os.fsencode(target)),
        }
    mode = "100755" if metadata.st_mode & stat.S_IXUSR else "100644"
    content = path.read_bytes()
    normalized = False
    if relative.startswith("openspec/changes/") and relative.endswith("/tasks.md"):
        content = TASK_CHECKBOX.sub(r"\1 \2", content.decode("utf-8")).encode("utf-8")
        normalized = True
    return {
        **base,
        "kind": "file",
        "mode": mode,
        "size": len(content),
        "sha256": sha256_bytes(content),
        **({"normalized": "openspec-task-checkboxes"} if normalized else {}),
    }


def collect_repository(
    label: str, root: Path, all_rules: list[dict[str, str]]
) -> dict[str, Any]:
    root = root.resolve()
    if not (root / ".git").exists():
        raise ManifestError(f"repository {label} is not a Git checkout")
    indexed = index_entries(root)
    headed = head_entries(root)
    active_rules = rules_for(label, all_rules)
    files: list[dict[str, Any]] = []
    excluded: list[dict[str, str]] = []
    for relative in worktree_paths(root):
        rule = exclusion_for(relative, active_rules)
        if rule:
            excluded.append(
                {"path": relative, "pattern": rule["pattern"], "reason": rule["reason"]}
            )
        else:
            files.append(
                file_entry(root, relative, indexed.get(relative), headed.get(relative))
            )
    return {
        "label": label,
        "head": run_git(root, "rev-parse", "HEAD"),
        "head_tree": run_git(root, "rev-parse", "HEAD^{tree}"),
        "files": files,
        "excluded_files": excluded,
    }


def sanitize_string(value: str) -> str:
    value = PRIVATE_KEY.sub("<redacted-private-key>", value)
    value = BEARER.sub("Bearer <redacted-present>", value)
    value = URI_USERINFO.sub(r"\g<scheme><redacted-userinfo>@", value)
    value = QUERY_SECRET.sub(r"\1<redacted-present>", value)
    return HOME_PATH.sub("<redacted-home-path>", value)


def redact_marker(value: Any) -> str:
    if value in ("<redacted-absent>", "<redacted-present>"):
        return value
    return "<redacted-absent>" if value in (None, "", [], {}) else "<redacted-present>"


def secret_value(key: str, value: Any) -> bool:
    normalized = key.lower().replace("-", "_")
    if isinstance(value, (dict, list, bool, int, float)) or value is None:
        return False
    if normalized.endswith(("_enabled", "_path")) or normalized in {
        "forward_cookies",
        "session_cookie",
        "token_exchange",
    }:
        return False
    return bool(SECRET_KEY.search(key))


def sanitize_json(value: Any, key: str = "") -> Any:
    if secret_value(key, value):
        return redact_marker(value)
    if isinstance(value, dict):
        return {item: sanitize_json(child, item) for item, child in sorted(value.items())}
    if isinstance(value, list):
        return [sanitize_json(child) for child in value]
    if isinstance(value, str):
        return sanitize_string(value)
    return value


def sanitize_text(value: str) -> str:
    value = PRIVATE_KEY.sub("<redacted-private-key>", value)
    lines = []
    sensitive_blocks: list[tuple[int, bool]] = []
    for line in value.splitlines():
        stripped = line.lstrip()
        indentation = len(line) - len(stripped)
        while sensitive_blocks and indentation <= sensitive_blocks[-1][0]:
            sensitive_blocks.pop()
        inherited_sensitive = sensitive_blocks[-1][1] if sensitive_blocks else False
        match = TEXT_ASSIGNMENT.match(line)
        raw_value = match.group("value").strip() if match else ""
        scalar: Any = raw_value
        if raw_value.lower() in {"true", "false"}:
            scalar = raw_value.lower() == "true"
        if match and not raw_value:
            normalized_key = match.group("key").lower().replace("-", "_")
            block_sensitive = inherited_sensitive or normalized_key in {
                "credentials",
                "secrets",
            } or normalized_key.endswith("_secrets")
            lines.append(sanitize_string(line))
            sensitive_blocks.append((indentation, block_sensitive))
        elif match and (inherited_sensitive or secret_value(match.group("key"), scalar)):
            lines.append(match.group("prefix") + redact_marker(match.group("value").strip()))
        elif inherited_sensitive and stripped.startswith("-"):
            marker = redact_marker(stripped[1:].strip())
            lines.append(" " * indentation + "- " + marker)
        else:
            lines.append(sanitize_string(line))
    return "\n".join(lines) + ("\n" if value.endswith("\n") else "")


def configuration(label: str, path: Path, redaction_key: bytes) -> dict[str, Any]:
    raw_bytes = path.read_bytes()
    raw = raw_bytes.decode()
    try:
        sanitized: Any = sanitize_json(json.loads(raw))
        format_name = "json"
    except json.JSONDecodeError:
        sanitized = sanitize_text(raw)
        format_name = "text"
    return {
        "label": label,
        "format": format_name,
        "sanitized": sanitized,
        "sanitized_sha256": sha256_bytes(canonical(sanitized)),
        "exact_hmac_sha256": hmac_sha256(redaction_key, raw_bytes),
    }


def image_identity(label: str, reference: str) -> dict[str, Any]:
    docker = os.environ.get("RA06_TOOL_DOCKER") or shutil.which("docker")
    if not docker:
        raise ManifestError(f"docker executable is unavailable for image {label}")
    completed = subprocess.run(
        (docker, "image", "inspect", reference),
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode:
        raise ManifestError(
            f"docker image inspect failed for {label}: {completed.stderr.strip()}"
        )
    inspected = json.loads(completed.stdout)
    if not isinstance(inspected, list) or len(inspected) != 1:
        raise ManifestError(f"docker image inspect returned an unexpected result for {label}")
    image = inspected[0]
    image_id = image.get("Id")
    if not isinstance(image_id, str) or not image_id.startswith("sha256:"):
        raise ManifestError(f"docker image {label} has no immutable image ID")
    return {
        "label": label,
        "reference": reference,
        "image_id": image_id,
        "repo_digests": sorted(image.get("RepoDigests") or []),
    }


def path_identity(label: str, path: Path) -> dict[str, Any]:
    metadata = path.stat()
    return {
        "label": label,
        "mode": format(stat.S_IMODE(metadata.st_mode), "04o"),
        "size": metadata.st_size,
        "sha256": sha256_file(path),
    }


def openspec_contract_identity(label: str, path: Path) -> dict[str, Any]:
    if not path.is_dir():
        raise ManifestError(f"OpenSpec contract directory cannot be read: {label}")
    files = []
    for item in sorted(candidate for candidate in path.rglob("*") if candidate.is_file()):
        relative = item.relative_to(path).as_posix()
        content = item.read_text(encoding="utf-8")
        if relative == "tasks.md":
            content = TASK_CHECKBOX.sub(r"\1 \2", content)
        encoded = content.encode()
        files.append(
            {
                "path": relative,
                "size": len(encoded),
                "sha256": sha256_bytes(encoded),
            }
        )
    required = {".openspec.yaml", "proposal.md", "design.md", "tasks.md"}
    observed = {item["path"] for item in files}
    if not required.issubset(observed) or not any(
        path.startswith("specs/") and path.endswith("/spec.md") for path in observed
    ):
        raise ManifestError(f"OpenSpec contract is incomplete: {label}")
    return {"label": label, "files": files}


def secret_identity(label: str, path: Path, redaction_key: bytes) -> dict[str, Any]:
    metadata = path.stat()
    return {
        "label": label,
        "mode": format(stat.S_IMODE(metadata.st_mode), "04o"),
        "size": metadata.st_size,
        "exact_hmac_sha256": hmac_sha256(redaction_key, path.read_bytes()),
    }


def toolchain_paths() -> dict[str, Path]:
    paths: dict[str, Path] = {}
    for label, command in TOOLCHAINS:
        executable = os.environ.get(f"RA06_TOOL_{label.upper()}")
        if executable is None and label in {"cargo", "rustc"}:
            rustup = shutil.which("rustup")
            if rustup:
                selected = subprocess.run(
                    (rustup, "which", label, "--toolchain", "1.98.1"),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if selected.returncode == 0:
                    executable = selected.stdout.strip()
        if executable is None:
            requested = command[0]
            executable = (
                requested
                if Path(requested).is_absolute()
                else shutil.which(requested)
            )
        if executable:
            paths[label] = Path(executable)
    return paths


def linked_dependencies(path: Path) -> list[dict[str, Any]]:
    otool = Path("/usr/bin/otool")
    if sys.platform != "darwin" or not otool.is_file():
        return []
    completed = subprocess.run(
        (str(otool), "-L", str(path)),
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return []
    rpaths: list[Path] = []
    load_commands = subprocess.run(
        (str(otool), "-l", str(path)),
        capture_output=True,
        text=True,
        check=False,
    )
    if load_commands.returncode == 0:
        lines = load_commands.stdout.splitlines()
        for index, line in enumerate(lines):
            if line.strip() == "cmd LC_RPATH" and index + 2 < len(lines):
                value = lines[index + 2].strip().removeprefix("path ").split(" (", 1)[0]
                value = value.replace("@loader_path", str(path.parent))
                value = value.replace("@executable_path", str(path.parent))
                candidate = Path(value)
                if candidate.is_absolute():
                    rpaths.append(candidate)
    dependencies: list[dict[str, Any]] = []
    for line in completed.stdout.splitlines()[1:]:
        value = line.strip().split(" (", 1)[0]
        candidates = [Path(value)]
        if value.startswith("@rpath/"):
            candidates = [base / value.removeprefix("@rpath/") for base in rpaths]
        dependency = next((candidate for candidate in candidates if candidate.is_file()), None)
        record: dict[str, Any] = {"load_command": value}
        if dependency is not None:
            record.update(
                {
                    "path": sanitized_path(dependency),
                    "size": dependency.stat().st_size,
                    "sha256": sha256_file(dependency),
                }
            )
        else:
            record["provided_by_platform"] = value.startswith(("/usr/lib/", "/System/"))
        dependencies.append(record)
    return sorted(dependencies, key=lambda item: item["load_command"])


def runtime_dependencies(label: str, path: Path) -> list[dict[str, Any]]:
    paths: set[Path] = set()
    if label == "pnpm":
        paths.update(candidate for candidate in path.parent.rglob("*") if candidate.is_file())
        selected = subprocess.run(
            (str(path), "--version"), capture_output=True, text=True, check=False
        )
        if selected.returncode == 0 and selected.stdout.strip():
            corepack_home = Path(
                os.environ.get(
                    "COREPACK_HOME", str(SOURCE_HOME / ".cache/node/corepack")
                )
            )
            package = corepack_home / "v1/pnpm" / selected.stdout.strip()
            if package.is_dir():
                paths.update(
                    candidate for candidate in package.rglob("*") if candidate.is_file()
                )
    elif label == "flutter":
        sdk = path.parent.parent
        internal = sdk / "bin/internal"
        if internal.is_dir():
            paths.update(candidate for candidate in internal.rglob("*") if candidate.is_file())
        for relative in (
            "bin/cache/dart-sdk/bin/dart",
            "bin/cache/flutter_tools.snapshot",
            "bin/cache/engine.stamp",
            "bin/cache/flutter.version.json",
            "version",
        ):
            candidate = sdk / relative
            if candidate.is_file():
                paths.add(candidate)
    elif label == "rustc":
        selected = subprocess.run(
            (str(path), "--print", "sysroot"),
            capture_output=True,
            text=True,
            check=False,
        )
        if selected.returncode == 0:
            rustlib = Path(selected.stdout.strip()) / "lib/rustlib"
            if rustlib.is_dir():
                paths.update(candidate for candidate in rustlib.rglob("*") if candidate.is_file())
    elif label == "docker":
        selected = subprocess.run(
            (str(path), "info", "--format", "{{json .ClientInfo.Plugins}}"),
            capture_output=True,
            text=True,
            check=False,
        )
        if selected.returncode == 0:
            for plugin in json.loads(selected.stdout or "[]"):
                candidate = Path(plugin.get("Path", ""))
                if candidate.is_file():
                    paths.add(candidate)
    elif label == "rustup" and path.stat().st_size < 4096:
        candidate = path.parent.parent / "libexec/bin/rustup"
        if candidate.is_file():
            paths.add(candidate)
    return [
        {
            "path": sanitized_path(candidate),
            "size": candidate.stat().st_size,
            "sha256": sha256_file(candidate),
        }
        for candidate in sorted(paths)
    ]


def collect_toolchains() -> list[dict[str, Any]]:
    identities: list[dict[str, Any]] = []
    paths = toolchain_paths()
    for label, command in TOOLCHAINS:
        execution_path = paths.get(label)
        if execution_path is None:
            identities.append({"label": label, "available": False})
            continue
        path = execution_path.resolve()
        try:
            completed = subprocess.run(
                (str(execution_path), *command[1:]),
                capture_output=True,
                text=True,
                check=False,
            )
        except OSError:
            identities.append({"label": label, "available": False})
            continue
        version = (completed.stdout or completed.stderr).strip()
        if label == "flutter" and completed.returncode == 0:
            # Human output includes relative ages that change without SDK changes.
            # A fresh build home appends a first-run notice after the JSON document.
            metadata, _ = json.JSONDecoder().raw_decode(version)
            metadata["flutterRoot"] = sanitized_path(Path(metadata["flutterRoot"]))
            version = json.dumps(metadata, sort_keys=True, separators=(",", ":"))
        identities.append(
            {
                "label": label,
                "available": completed.returncode == 0,
                "version": version,
                "execution_path": sanitized_path(execution_path),
                "resolved_path": sanitized_path(path),
                "mode": format(stat.S_IMODE(path.stat().st_mode), "04o"),
                "size": path.stat().st_size,
                "sha256": sha256_file(path),
                "linked_dependencies": linked_dependencies(path),
                "runtime_dependencies": runtime_dependencies(label, execution_path),
            }
        )
    return identities


def command_identity(
    label: str, argv: tuple[str, ...], redaction_key: bytes
) -> dict[str, Any]:
    completed = subprocess.run(argv, capture_output=True, check=False)
    raw = completed.stdout + completed.stderr
    if completed.returncode:
        raise ManifestError(f"host build identity command failed: {label}")
    return {
        "label": label,
        "argv": [sanitize_string(argument) for argument in argv],
        "sanitized": sanitize_string(raw.decode(errors="backslashreplace").strip()),
        "exact_hmac_sha256": hmac_sha256(redaction_key, raw),
    }


def command_json_identity(
    label: str, argv: tuple[str, ...], redaction_key: bytes
) -> dict[str, Any]:
    completed = subprocess.run(argv, capture_output=True, check=False)
    if completed.returncode:
        raise ManifestError(f"host build identity command failed: {label}")
    try:
        value = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise ManifestError(f"host build identity command returned invalid JSON: {label}") from error
    def normalize(item: Any) -> Any:
        if isinstance(item, dict):
            return {key: normalize(nested) for key, nested in sorted(item.items())}
        if isinstance(item, list):
            normalized = [normalize(nested) for nested in item]
            return sorted(normalized, key=canonical)
        return item

    normalized_value = normalize(value)
    canonical_value = canonical(normalized_value)
    return {
        "label": label,
        "argv": [sanitize_string(argument) for argument in argv],
        "sanitized": sanitize_json(normalized_value),
        "exact_hmac_sha256": hmac_sha256(redaction_key, canonical_value),
    }


def exact_environment_identity(
    environment: dict[str, str], redaction_key: bytes
) -> list[dict[str, Any]]:
    return [
        {
            "name": name,
            "sanitized": sanitize_string(value),
            "exact_hmac_sha256": hmac_sha256(redaction_key, value.encode()),
        }
        for name, value in sorted(environment.items())
    ]


def executable_identity(label: str, path: Path) -> dict[str, Any]:
    resolved = path.resolve()
    if not resolved.is_file():
        raise ManifestError(f"transitive build executable is unavailable: {label}")
    return {
        "label": label,
        "execution_path": sanitized_path(path),
        "resolved_path": sanitized_path(resolved),
        "mode": format(stat.S_IMODE(resolved.stat().st_mode), "04o"),
        "size": resolved.stat().st_size,
        "sha256": sha256_file(resolved),
        "linked_dependencies": linked_dependencies(resolved),
    }


def prepare_isolated_cargo_home() -> None:
    HERMETIC_CARGO_HOME.mkdir(parents=True, exist_ok=True)
    for name in ("registry", "git"):
        link = HERMETIC_CARGO_HOME / name
        expected = SOURCE_HOME / ".cargo" / name
        if link.is_symlink():
            if link.resolve() != expected.resolve():
                raise ManifestError(f"isolated Cargo {name} link has unexpected target")
        elif link.exists():
            raise ManifestError(f"isolated Cargo {name} path is not a symlink")
        else:
            link.symlink_to(expected, target_is_directory=True)


def dependency_tree_identity(path: Path) -> dict[str, Any]:
    entries: list[list[Any]] = []
    total_bytes = 0
    for candidate in sorted(path.rglob("*")):
        relative = candidate.relative_to(path).as_posix()
        metadata = candidate.lstat()
        mode = format(stat.S_IMODE(metadata.st_mode), "04o")
        if candidate.is_symlink():
            target = os.readlink(candidate)
            data = target.encode()
            entries.append([relative, "symlink", mode, len(data), sha256_bytes(data), target])
            total_bytes += len(data)
        elif candidate.is_file():
            size = metadata.st_size
            entries.append([relative, "file", mode, size, sha256_file(candidate), None])
            total_bytes += size
    return {
        "path": sanitized_path(path),
        "file_count": len(entries),
        "total_bytes": total_bytes,
        "tree_sha256": sha256_bytes(canonical(entries)),
    }


def collect_pnpm_dependency_sources(
    install_root: Path = PNPM_INSTALL_ROOT,
) -> dict[str, Any]:
    install_root = install_root.resolve()
    if not install_root.is_dir() or not (install_root / ".pnpm").is_dir():
        raise ManifestError(f"pnpm install tree cannot be read: {install_root}")
    return {
        "install_layout": "pnpm-node-modules-tree",
        "workspaces": [
            {
                "label": "prior-auth-web",
                **dependency_tree_identity(install_root),
            }
        ],
    }


def package_root(root_uri: str, package_config: Path) -> Path:
    parsed = urlparse(root_uri)
    if parsed.scheme and parsed.scheme != "file":
        raise ManifestError(f"unsupported Dart package root URI: {root_uri}")
    if parsed.scheme == "file":
        if parsed.netloc not in ("", "localhost"):
            raise ManifestError(f"remote Dart package root URI is unsupported: {root_uri}")
        return Path(unquote(parsed.path)).resolve()
    return (package_config.parent / unquote(root_uri)).resolve()


def dart_source_kind(root: Path, candidate_root: Path) -> str:
    for base, kind in (
        (candidate_root.resolve(), "candidate-source"),
        ((SOURCE_HOME / ".pub-cache").resolve(), "pub-cache"),
    ):
        try:
            root.relative_to(base)
            return kind
        except ValueError:
            pass
    return "sdk-or-external"


def collect_dart_dependency_sources(
    package_config: Path = DART_PACKAGE_CONFIG,
    candidate_root: Path = PRIOR_AUTH_ROOT,
) -> dict[str, Any]:
    package_config = package_config.resolve()
    candidate_root = candidate_root.resolve()
    if not package_config.is_file():
        raise ManifestError(f"Dart package config cannot be read: {package_config}")
    document = json.loads(package_config.read_text(encoding="utf-8"))
    packages = document.get("packages")
    if not isinstance(packages, list) or not packages:
        raise ManifestError("Dart package config has no package resolution")
    resolution: list[dict[str, Any]] = []
    external_roots: dict[Path, str] = {}
    names: set[str] = set()
    for package in packages:
        if not isinstance(package, dict):
            raise ManifestError("Dart package config contains a malformed package")
        name = package.get("name")
        root_uri = package.get("rootUri")
        if not isinstance(name, str) or not name or name in names:
            raise ManifestError("Dart package config contains a missing or duplicate name")
        if not isinstance(root_uri, str) or not root_uri:
            raise ManifestError(f"Dart package root is absent: {name}")
        root = package_root(root_uri, package_config)
        if not root.is_dir():
            raise ManifestError(f"Dart package root cannot be read: {name}")
        names.add(name)
        source_kind = dart_source_kind(root, candidate_root)
        resolution.append(
            {
                "name": name,
                "root": sanitized_path(root),
                "package_uri": package.get("packageUri"),
                "language_version": package.get("languageVersion"),
                "source_kind": source_kind,
            }
        )
        if source_kind != "candidate-source":
            external_roots[root] = source_kind
    sources = [
        {
            "source_kind": source_kind,
            **dependency_tree_identity(root),
        }
        for root, source_kind in sorted(external_roots.items(), key=lambda item: str(item[0]))
    ]
    return {
        "package_config": path_identity("mobile-package-config", package_config),
        "package_count": len(resolution),
        "resolution_sha256": sha256_bytes(canonical(resolution)),
        "packages": resolution,
        "sources": sources,
    }


def collect_cargo_dependency_sources(
    paths: dict[str, Path], environment: dict[str, str]
) -> dict[str, Any]:
    prepare_isolated_cargo_home()
    cargo = paths["cargo"]
    metadata_environment = {
        **environment,
        "RUSTUP_TOOLCHAIN": "1.98.1",
    }
    roots: dict[Path, str] = {}
    workspaces: list[dict[str, Any]] = []
    for label, manifest in BUILD_MANIFESTS:
        completed = subprocess.run(
            (
                str(cargo),
                "metadata",
                "--locked",
                "--offline",
                "--format-version",
                "1",
                "--manifest-path",
                str(manifest),
            ),
            env=metadata_environment,
            capture_output=True,
            check=False,
        )
        if completed.returncode:
            detail = completed.stderr.decode(errors="backslashreplace").strip()
            raise ManifestError(f"locked offline Cargo metadata failed for {label}: {detail}")
        metadata = json.loads(completed.stdout)
        resolution: list[list[str]] = []
        dependency_roots: set[Path] = set()
        for package in metadata.get("packages", []):
            source = package.get("source")
            manifest_path = Path(package["manifest_path"]).resolve()
            resolution.append(
                [package["id"], source or "workspace", sanitized_path(manifest_path)]
            )
            if not source:
                continue
            if source.startswith("registry+"):
                dependency_root = manifest_path.parent
                source_kind = "registry"
            elif source.startswith("git+"):
                parts = manifest_path.parts
                try:
                    checkout = parts.index("checkouts")
                except ValueError as error:
                    raise ManifestError(
                        f"Cargo Git checkout root cannot be resolved: {manifest_path}"
                    ) from error
                dependency_root = Path(*parts[: checkout + 3])
                source_kind = "git"
            else:
                raise ManifestError(f"unsupported Cargo dependency source: {source}")
            roots[dependency_root] = source_kind
            dependency_roots.add(dependency_root)
        workspaces.append(
            {
                "label": label,
                "manifest": sanitized_path(manifest),
                "package_count": len(metadata.get("packages", [])),
                "dependency_root_count": len(dependency_roots),
                "resolution_sha256": sha256_bytes(canonical(sorted(resolution))),
            }
        )
    sources = []
    for root, source_kind in sorted(roots.items(), key=lambda item: str(item[0])):
        identity = dependency_tree_identity(root)
        sources.append({"source_kind": source_kind, **identity})
    return {"workspaces": workspaces, "sources": sources}


def docker_host(docker: Path) -> str:
    explicit = os.environ.get("DOCKER_HOST")
    if explicit:
        return explicit
    completed = subprocess.run(
        (str(docker), "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"),
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode or not completed.stdout.strip():
        raise ManifestError("Docker endpoint cannot be resolved for the hermetic build")
    return completed.stdout.strip()


def xcrun_find(tool: str) -> Path:
    completed = subprocess.run(
        ("/usr/bin/xcrun", "--find", tool),
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode or not completed.stdout.strip():
        raise ManifestError(f"Xcode tool cannot be resolved: {tool}")
    path = Path(completed.stdout.strip())
    if not path.is_file():
        raise ManifestError(f"Xcode tool is unavailable: {tool}")
    return path


def effective_build_environment(paths: dict[str, Path]) -> dict[str, str]:
    required = {"cargo", "rustc", "docker", "python", "bash", "node"}
    missing = sorted(required - set(paths))
    if missing:
        raise ManifestError("build tool paths are unavailable: " + ", ".join(missing))
    xcrun = Path("/usr/bin/xcrun")
    sdk = subprocess.run(
        (str(xcrun), "--sdk", "macosx", "--show-sdk-path"),
        capture_output=True,
        text=True,
        check=False,
    )
    if sdk.returncode or not sdk.stdout.strip():
        raise ManifestError("macOS SDK path cannot be resolved")
    rustdoc = paths["rustc"].parent / "rustdoc"
    if not rustdoc.is_file():
        raise ManifestError("rustdoc is unavailable beside the bound rustc executable")
    native_tools = {
        name: xcrun_find(name)
        for name in ("ar", "clang", "clang++", "ld", "make", "ranlib")
    }
    return {
        "AR": str(native_tools["ar"]),
        "CARGO": str(paths["cargo"]),
        "CARGO_HOME": str(HERMETIC_CARGO_HOME),
        "CARGO_INCREMENTAL": "0",
        "CARGO_NET_OFFLINE": "true",
        "COREPACK_ENABLE_DOWNLOAD_PROMPT": "0",
        "COREPACK_HOME": str(SOURCE_HOME / ".cache/node/corepack"),
        "CC": str(native_tools["clang"]),
        "CXX": str(native_tools["clang++"]),
        "DOCKER_CONFIG": str(HERMETIC_DOCKER_CONFIG),
        "DOCKER_HOST": docker_host(paths["docker"]),
        "HOME": str(HERMETIC_BUILD_HOME),
        "LANG": "C",
        "LC_ALL": "C",
        "LD": str(native_tools["ld"]),
        "PATH": (
            f"{paths['rustc'].parent}:{paths['node'].parent}:"
            f"{native_tools['make'].parent}:/usr/bin:/bin:/usr/sbin:/sbin"
        ),
        "PUB_CACHE": str(SOURCE_HOME / ".pub-cache"),
        "RANLIB": str(native_tools["ranlib"]),
        "RUSTC": str(paths["rustc"]),
        "RUSTDOC": str(rustdoc),
        "RUSTUP_HOME": str(SOURCE_HOME / ".rustup"),
        "SDKROOT": sdk.stdout.strip(),
        "TMPDIR": "/tmp",
    }


def collect_cargo_configuration(
    environment: dict[str, str],
    manifests: tuple[tuple[str, Path], ...] | None = None,
) -> dict[str, Any]:
    """Bind Cargo's cwd-based config search, including future config creation.

    Cargo config path and precedence rules:
    https://doc.rust-lang.org/cargo/reference/config.html
    The campaign uses no --config arguments or unstable config includes.
    """
    workspaces = []
    for label, manifest in (BUILD_MANIFESTS if manifests is None else manifests):
        cwd = manifest.parent.resolve()
        cargo_home = Path(environment.get("CARGO_HOME", str(Path(environment["HOME"]) / ".cargo")))
        if not cargo_home.is_absolute():
            cargo_home = cwd / cargo_home
        directories = [directory / ".cargo" for directory in (cwd, *cwd.parents)]
        if cargo_home not in directories:
            directories.append(cargo_home)
        configs = []
        values: dict[str, tuple[str, Path]] = {}
        for directory in directories:
            legacy, modern = directory / "config", directory / "config.toml"
            selected = legacy if legacy.exists() else modern
            for candidate in (legacy, modern):
                entry: dict[str, Any] = {
                    "path": sanitized_path(candidate),
                    "present": candidate.exists(),
                    "selected": candidate == selected and candidate.exists(),
                }
                if candidate.is_symlink() and not candidate.exists():
                    raise ManifestError("Cargo configuration has a dangling symlink")
                if candidate.exists():
                    if not candidate.is_file():
                        raise ManifestError("Cargo configuration is not a regular file")
                    entry.update({
                        "resolved_path": sanitized_path(candidate.resolve()),
                        "sha256": sha256_file(candidate),
                        "mode": format(stat.S_IMODE(candidate.stat().st_mode), "04o"),
                    })
                configs.append(entry)
            if not selected.is_file():
                continue
            try:
                config = tomllib.loads(selected.read_text())
            except (ValueError, UnicodeError) as error:
                raise ManifestError("Cargo configuration cannot be parsed") from error
            if "include" in config:
                raise ManifestError("Cargo config includes are outside the campaign's bound configuration contract")
            build = config.get("build", {})
            if not isinstance(build, dict):
                raise ManifestError("Cargo build configuration is not a table")
            for key in ("rustc-wrapper", "rustc-workspace-wrapper"):
                if key in build and key not in values:
                    if not isinstance(build[key], str):
                        raise ManifestError("Cargo compiler wrapper must be a string")
                    values[key] = (build[key], selected)
        wrappers = []
        for key in ("rustc-wrapper", "rustc-workspace-wrapper"):
            direct = key.upper().replace("-", "_")
            config_env = "CARGO_BUILD_" + direct
            value, origin = values.get(key, ("", None))
            base = origin.parent.parent if origin else cwd
            source = sanitized_path(origin) if origin else "unset"
            for name in (config_env, direct):
                if name in environment:
                    value, base, source = environment[name], cwd, name
            wrapper: dict[str, Any] = {"label": key, "source": source, "enabled": bool(value)}
            if value:
                executable = Path(value)
                if not executable.is_absolute():
                    if "/" in value:
                        executable = base / executable
                    else:
                        # Relative PATH entries are resolved from Cargo's invocation cwd.
                        search = os.pathsep.join(
                            str(Path(item) if Path(item).is_absolute() else cwd / item)
                            for item in environment.get("PATH", "").split(os.pathsep)
                        )
                        found = shutil.which(value, path=search)
                        if not found:
                            raise ManifestError("Cargo compiler wrapper is unavailable on the build PATH")
                        executable = Path(found)
                wrapper["executable"] = executable_identity(key, executable)
            wrappers.append(wrapper)
        workspaces.append({"label": label, "cwd": sanitized_path(cwd), "configs": configs, "wrappers": wrappers})
    return {"workspaces": workspaces}


def collect_host_build_inputs(
    redaction_key: bytes,
    paths: dict[str, Path] | None = None,
    toolchains: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    paths = paths or toolchain_paths()
    environment = effective_build_environment(paths)
    tools = {
        "ar": xcrun_find("ar"),
        "clang": xcrun_find("clang"),
        "clang++": xcrun_find("clang++"),
        "ld": xcrun_find("ld"),
        "make": xcrun_find("make"),
        "ranlib": xcrun_find("ranlib"),
        "rustdoc": paths["rustc"].parent / "rustdoc",
        "sh": Path("/bin/sh"),
        "xcodebuild": Path("/usr/bin/xcodebuild"),
        "xcrun": Path("/usr/bin/xcrun"),
    }
    docker_plugins = next(
        item["runtime_dependencies"]
        for item in (toolchains or collect_toolchains())
        if item["label"] == "docker"
    )
    cargo_dependencies = collect_cargo_dependency_sources(paths, environment)
    pnpm_dependencies = collect_pnpm_dependency_sources()
    dart_dependencies = collect_dart_dependency_sources()
    clang_resource = subprocess.run(
        (str(tools["clang"]), "-print-resource-dir"),
        capture_output=True,
        text=True,
        check=False,
    )
    if clang_resource.returncode or not clang_resource.stdout.strip():
        raise ManifestError("Clang resource directory cannot be resolved")
    platform_trees = [
        {"label": "macos-sdk", **dependency_tree_identity(Path(environment["SDKROOT"]).resolve())},
        {
            "label": "clang-resource-dir",
            **dependency_tree_identity(Path(clang_resource.stdout.strip()).resolve()),
        },
    ]
    return {
        "environment": exact_environment_identity(environment, redaction_key),
        "transitive_tools": [
            executable_identity(label, path) for label, path in sorted(tools.items())
        ],
        "docker_plugins": docker_plugins,
        "cargo_dependencies": cargo_dependencies,
        "cargo_configuration": collect_cargo_configuration(environment),
        "pnpm_dependencies": pnpm_dependencies,
        "dart_dependencies": dart_dependencies,
        "platform_trees": platform_trees,
        "platform": [
            command_identity("macos", ("/usr/bin/sw_vers",), redaction_key),
            command_identity("kernel", ("/usr/bin/uname", "-a"), redaction_key),
            command_identity("xcode", ("/usr/bin/xcodebuild", "-version"), redaction_key),
            command_identity(
                "xcode-selection", ("/usr/bin/xcode-select", "-p"), redaction_key
            ),
            command_identity(
                "xcode-tools",
                (
                    "/bin/sh",
                    "-c",
                    "/usr/bin/xcrun --find ar && /usr/bin/xcrun --find clang && "
                    "/usr/bin/xcrun --find clang++ && /usr/bin/xcrun --find ld && "
                    "/usr/bin/xcrun --find make && /usr/bin/xcrun --find ranlib",
                ),
                redaction_key,
            ),
            command_identity(
                "sdk",
                ("/usr/bin/xcrun", "--sdk", "macosx", "--show-sdk-build-version"),
                redaction_key,
            ),
            command_json_identity(
                "docker-engine",
                (str(paths["docker"]), "version", "--format", "{{json .}}"),
                redaction_key,
            ),
            command_json_identity(
                "docker-context",
                (str(paths["docker"]), "context", "inspect"),
                redaction_key,
            ),
            command_identity(
                "docker-buildx",
                (str(paths["docker"]), "buildx", "version"),
                redaction_key,
            ),
        ],
        "dependency_policy": {
            "cargo_locked": True,
            "cargo_offline": True,
            "isolated_cargo_home": sanitized_path(HERMETIC_CARGO_HOME),
            "isolated_home": sanitized_path(HERMETIC_BUILD_HOME),
            "isolated_docker_config": sanitized_path(HERMETIC_DOCKER_CONFIG),
            "registry_integrity": "Cargo.lock registry checksums",
            "git_integrity": "Cargo.lock precise git revisions",
            "pnpm_integrity": "pnpm-lock.yaml plus exact installed node_modules tree",
            "dart_integrity": "pubspec.lock plus exact package_config and resolved package trees",
        },
    }


def build_input_digest(candidate: dict[str, Any]) -> str:
    inputs = {
        key: candidate.get(key, [])
        for key in (
            "exclusion_contract",
            "repositories",
            "configurations",
            "locks",
            "fixtures",
            "openspec_contracts",
            "secret_inputs",
            "clocks",
            "toolchains",
            "host_build_inputs",
        )
    }
    inputs["repositories"] = [
        comparable_repository(repository) for repository in inputs["repositories"]
    ]
    return f"sha256:{sha256_bytes(canonical(inputs))}"


def load_attestation(label: str, path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if value.get("schema_version") != 1:
        raise ManifestError(f"build attestation has unsupported schema: {label}")
    return {"label": label, **value}


def load_build_spec(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if value.get("schema_version") != 1:
        raise ManifestError("build specification must use schema_version 1")
    inherited = value.get("inherit_environment")
    commands = value.get("commands")
    if not isinstance(inherited, list) or not all(
        isinstance(name, str) and name for name in inherited
    ):
        raise ManifestError("build specification requires inherit_environment names")
    refused = sorted(set(inherited) - BUILD_ENV_ALLOWLIST)
    if refused:
        raise ManifestError(
            "build specification requests non-allowlisted environment: "
            + ", ".join(refused)
        )
    if not isinstance(commands, list) or not commands:
        raise ManifestError("build specification requires at least one command")
    labels: set[str] = set()
    for command in commands:
        if not isinstance(command, dict) or set(command) != {
            "label",
            "cwd",
            "argv",
            "environment",
            "log",
        }:
            raise ManifestError(
                "each build command requires label, cwd, argv, environment, and log"
            )
        label = command["label"]
        if not isinstance(label, str) or not label or label in labels:
            raise ManifestError("build command labels must be unique nonempty strings")
        labels.add(label)
        if not isinstance(command["cwd"], str) or not command["cwd"]:
            raise ManifestError(f"build command cwd is invalid: {label}")
        if not isinstance(command["argv"], list) or not command["argv"] or not all(
            isinstance(argument, str) and argument for argument in command["argv"]
        ):
            raise ManifestError(f"build command argv is invalid: {label}")
        if not isinstance(command["environment"], dict) or not all(
            isinstance(name, str)
            and name
            and isinstance(item, str)
            for name, item in command["environment"].items()
        ):
            raise ManifestError(f"build command environment is invalid: {label}")
        if not isinstance(command["log"], str) or not command["log"]:
            raise ManifestError(f"build command log is invalid: {label}")
    return value


def execute_build_command(
    command: dict[str, Any],
    inherited_environment: dict[str, str],
    paths: dict[str, Path],
) -> dict[str, Any]:
    label = command["label"]
    cwd = Path(command["cwd"]).resolve()
    if not cwd.is_dir():
        raise ManifestError(f"build command cwd does not exist: {label}")
    log_path = Path(command["log"]).resolve()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    environment = {
        **effective_build_environment(paths),
        **inherited_environment,
        "CARGO_TERM_COLOR": "never",
        **command["environment"],
    }
    for tool_label, tool_path in paths.items():
        environment[f"RA06_TOOL_{tool_label.upper()}"] = str(tool_path)
    aliases = {"python3": "python", "python": "python"}
    executable_label = aliases.get(
        Path(command["argv"][0]).name, Path(command["argv"][0]).name
    )
    argv = list(command["argv"])
    if executable_label in paths:
        argv[0] = str(paths[executable_label])
    started_at = datetime.now(timezone.utc).isoformat()
    with log_path.open("wb") as log:
        try:
            completed = subprocess.run(
                argv,
                cwd=cwd,
                env=environment,
                stdout=log,
                stderr=subprocess.STDOUT,
                check=False,
            )
        except FileNotFoundError as error:
            raise ManifestError(f"build command executable is unavailable: {label}") from error
    result = {
        "label": label,
        "started_at": started_at,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "cwd": sanitize_string(str(cwd)),
        "argv": [sanitize_string(argument) for argument in argv],
        "environment": sanitize_json(environment),
        "return_code": completed.returncode,
        "log": path_identity(label, log_path),
    }
    if completed.returncode:
        raise ManifestError(
            f"build command failed: {label} (exit {completed.returncode}; log {log_path})"
        )
    return result


def create_attestation(args: argparse.Namespace) -> dict[str, Any]:
    input_path = Path(args.input_manifest)
    input_manifest = json.loads(input_path.read_text())
    candidate = input_manifest.get("candidate")
    if not isinstance(candidate, dict):
        raise ManifestError("build input manifest has no candidate")
    if candidate.get("artifacts") or candidate.get("images") or candidate.get(
        "build_attestations"
    ):
        raise ManifestError("build input manifest must precede artifacts and images")
    roots = parse_named(args.repo, "repository")
    configs = parse_named(args.effective_config, "effective config")
    secret_inputs = parse_named(args.secret_input, "secret input")
    locks = parse_named(args.lock, "lock")
    fixtures = parse_named(args.fixture, "fixture")
    openspec_contracts = parse_named(args.openspec_contract, "OpenSpec contract")
    redaction_key = load_redaction_key(Path(args.redaction_key))
    pre_build_errors = validate_manifest(
        input_manifest,
        roots,
        configs,
        {},
        secret_inputs,
        redaction_key,
        locks,
        fixtures,
        openspec_contracts,
    )
    if pre_build_errors:
        raise ManifestError("build input validation failed: " + "; ".join(pre_build_errors))
    build_spec_path = Path(args.build_spec)
    build_spec = load_build_spec(build_spec_path)
    inherited_environment = {
        name: os.environ[name]
        for name in build_spec["inherit_environment"]
        if name in os.environ
    }
    started_at = datetime.now(timezone.utc).isoformat()
    paths = toolchain_paths()
    command_results = [
        execute_build_command(command, inherited_environment, paths)
        for command in build_spec["commands"]
    ]
    post_build_errors = validate_manifest(
        input_manifest,
        roots,
        configs,
        {},
        secret_inputs,
        redaction_key,
        locks,
        fixtures,
        openspec_contracts,
    )
    if post_build_errors:
        raise ManifestError("build changed frozen inputs: " + "; ".join(post_build_errors))
    artifacts = parse_named(args.artifact, "artifact")
    images = parse_named(args.image, "image")
    return {
        "schema_version": 1,
        "started_at": started_at,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "input_manifest_sha256": sha256_file(input_path),
        "input_digest": build_input_digest(candidate),
        "build_spec_sha256": sha256_file(build_spec_path),
        "environment_allowlist": sorted(BUILD_ENV_ALLOWLIST),
        "inherited_environment": sanitize_json(inherited_environment),
        "pre_build_validation_errors": pre_build_errors,
        "post_build_validation_errors": post_build_errors,
        "commands": command_results,
        "toolchains": candidate.get("toolchains", []),
        "host_build_inputs": candidate.get("host_build_inputs", {}),
        "logs": [result["log"] for result in command_results],
        "artifacts": [
            path_identity(label, Path(path)) for label, path in sorted(artifacts.items())
        ],
        "images": [
            image_identity(label, reference) for label, reference in sorted(images.items())
        ],
    }


def load_rules(path: Path) -> tuple[list[dict[str, str]], str]:
    data = json.loads(path.read_text())
    if data.get("schema_version") != 1 or not isinstance(data.get("rules"), list):
        raise ManifestError("exclusion contract must contain schema_version 1 and rules")
    for rule in data["rules"]:
        if set(rule) != {"repository", "pattern", "reason"} or not all(rule.values()):
            raise ManifestError("every exclusion rule requires repository, pattern, and reason")
    return data["rules"], sha256_bytes(canonical(data))


def build_manifest(args: argparse.Namespace) -> dict[str, Any]:
    repositories = parse_named(args.repo, "repository")
    configs = parse_named(args.effective_config, "effective config")
    locks = parse_named(args.lock, "lock")
    fixtures = parse_named(args.fixture, "fixture")
    openspec_contracts = parse_named(args.openspec_contract, "OpenSpec contract")
    secret_inputs = parse_named(args.secret_input, "secret input")
    artifacts = parse_named(args.artifact, "artifact")
    clocks = parse_named(args.clock, "clock")
    images = parse_named(args.image, "image")
    attestations = parse_named(args.build_attestation, "build attestation")
    rules, rules_digest = load_rules(Path(args.exclusions))
    redaction_key = load_redaction_key(Path(args.redaction_key))
    toolchains = collect_toolchains()
    candidate = {
        "exclusion_contract": {"sha256": rules_digest, "rules": rules},
        "repositories": [
            collect_repository(label, Path(path), rules)
            for label, path in sorted(repositories.items())
        ],
        "configurations": [
            configuration(label, Path(path), redaction_key)
            for label, path in sorted(configs.items())
        ],
        "locks": [path_identity(label, Path(path)) for label, path in sorted(locks.items())],
        "fixtures": [
            path_identity(label, Path(path)) for label, path in sorted(fixtures.items())
        ],
        "openspec_contracts": [
            openspec_contract_identity(label, Path(path))
            for label, path in sorted(openspec_contracts.items())
        ],
        "secret_inputs": [
            secret_identity(label, Path(path), redaction_key)
            for label, path in sorted(secret_inputs.items())
        ],
        "artifacts": [
            path_identity(label, Path(path)) for label, path in sorted(artifacts.items())
        ],
        "clocks": [{"label": key, "identity": value} for key, value in sorted(clocks.items())],
        "images": [
            image_identity(label, reference) for label, reference in sorted(images.items())
        ],
        "toolchains": toolchains,
        "host_build_inputs": collect_host_build_inputs(
            redaction_key, toolchain_paths(), toolchains
        ),
        "build_attestations": [
            load_attestation(label, Path(path))
            for label, path in sorted(attestations.items())
        ],
    }
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "candidate": candidate,
        "candidate_digest": candidate_digest(candidate),
    }


def comparable_repository(repository: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in repository.items() if key != "excluded_files"}


def candidate_digest(candidate: dict[str, Any]) -> str:
    digestable = dict(candidate)
    digestable["repositories"] = [
        comparable_repository(repository) for repository in candidate.get("repositories", [])
    ]
    return f"sha256:{sha256_bytes(canonical(digestable))}"


def validate_manifest(
    manifest: dict[str, Any],
    roots: dict[str, str],
    configs: dict[str, str] | None = None,
    artifacts: dict[str, str] | None = None,
    secret_inputs: dict[str, str] | None = None,
    redaction_key: bytes | None = None,
    locks: dict[str, str] | None = None,
    fixtures: dict[str, str] | None = None,
    openspec_contracts: dict[str, str] | None = None,
) -> list[str]:
    errors = []
    if manifest.get("schema_version") != SCHEMA_VERSION:
        errors.append("unsupported schema version")
        return errors
    candidate = manifest.get("candidate")
    if not isinstance(candidate, dict):
        return ["candidate object is missing"]
    if redaction_key is None:
        return ["redaction key is required"]
    expected = candidate_digest(candidate)
    if manifest.get("candidate_digest") != expected:
        errors.append("candidate digest does not match canonical content")
    stored = {repo["label"]: repo for repo in candidate.get("repositories", [])}
    if set(stored) != set(roots):
        errors.append("repository labels do not match validation roots")
    rules = candidate.get("exclusion_contract", {}).get("rules", [])
    expected_rules_digest = sha256_bytes(canonical({"schema_version": 1, "rules": rules}))
    if candidate.get("exclusion_contract", {}).get("sha256") != expected_rules_digest:
        errors.append("exclusion contract digest mismatch")
    for label in sorted(set(stored) & set(roots)):
        current = collect_repository(label, Path(roots[label]), rules)
        if comparable_repository(current) != comparable_repository(stored[label]):
            errors.append(f"repository changed after manifest capture: {label}")
    stored_configs = {
        config["label"]: config for config in candidate.get("configurations", [])
    }
    current_configs = configs or {}
    if set(stored_configs) != set(current_configs):
        errors.append("effective configuration labels do not match validation inputs")
    for label in sorted(set(stored_configs) & set(current_configs)):
        try:
            current = configuration(label, Path(current_configs[label]), redaction_key)
        except OSError as error:
            errors.append(f"effective configuration cannot be read: {label}: {error}")
            continue
        if current != stored_configs[label]:
            errors.append(f"effective configuration changed after manifest capture: {label}")
    for config in stored_configs.values():
        if config.get("sanitized_sha256") != sha256_bytes(canonical(config.get("sanitized"))):
            errors.append(f"sanitized configuration digest mismatch: {config.get('label')}")
        sanitized = config.get("sanitized")
        if isinstance(sanitized, str):
            safe = sanitize_text(sanitized) == sanitized
        else:
            safe = sanitize_json(sanitized) == sanitized
        if not safe:
            errors.append(f"configuration is not fully sanitized: {config.get('label')}")
        if not isinstance(config.get("exact_hmac_sha256"), str):
            errors.append(f"configuration exact identity is missing: {config.get('label')}")
    for kind, candidate_key, current_paths in (
        ("lock", "locks", locks),
        ("fixture", "fixtures", fixtures),
    ):
        if current_paths is None:
            continue
        stored_paths = {
            item["label"]: item for item in candidate.get(candidate_key, [])
        }
        if set(stored_paths) != set(current_paths):
            errors.append(f"{kind} labels do not match validation inputs")
        for label in sorted(set(stored_paths) & set(current_paths)):
            try:
                current = path_identity(label, Path(current_paths[label]))
            except OSError as error:
                errors.append(f"{kind} cannot be read: {label}: {error}")
                continue
            if current != stored_paths[label]:
                errors.append(f"{kind} changed after manifest capture: {label}")
    if openspec_contracts is not None:
        stored_contracts = {
            item["label"]: item for item in candidate.get("openspec_contracts", [])
        }
        if set(stored_contracts) != set(openspec_contracts):
            errors.append("OpenSpec contract labels do not match validation inputs")
        for label in sorted(set(stored_contracts) & set(openspec_contracts)):
            try:
                current = openspec_contract_identity(
                    label, Path(openspec_contracts[label])
                )
            except (ManifestError, OSError, UnicodeDecodeError) as error:
                errors.append(f"OpenSpec contract cannot be read: {label}: {error}")
                continue
            if current != stored_contracts[label]:
                errors.append(f"OpenSpec contract changed after manifest capture: {label}")
    stored_secrets = {
        item["label"]: item for item in candidate.get("secret_inputs", [])
    }
    current_secrets = secret_inputs or {}
    if set(stored_secrets) != set(current_secrets):
        errors.append("secret input labels do not match validation inputs")
    for label in sorted(set(stored_secrets) & set(current_secrets)):
        try:
            current = secret_identity(label, Path(current_secrets[label]), redaction_key)
        except OSError as error:
            errors.append(f"secret input cannot be read: {label}: {error}")
            continue
        if current != stored_secrets[label]:
            errors.append(f"secret input changed after manifest capture: {label}")
    stored_artifacts = {
        artifact["label"]: artifact for artifact in candidate.get("artifacts", [])
    }
    current_artifacts = artifacts or {}
    if set(stored_artifacts) != set(current_artifacts):
        errors.append("artifact labels do not match validation inputs")
    for label in sorted(set(stored_artifacts) & set(current_artifacts)):
        try:
            current = path_identity(label, Path(current_artifacts[label]))
        except OSError as error:
            errors.append(f"artifact cannot be read: {label}: {error}")
            continue
        if current != stored_artifacts[label]:
            errors.append(f"artifact changed after manifest capture: {label}")
    for image in candidate.get("images", []):
        label = image.get("label")
        if not isinstance(image.get("image_id"), str) or not image["image_id"].startswith(
            "sha256:"
        ):
            errors.append(f"image identity is not immutable: {label}")
            continue
        try:
            current = image_identity(label, image["reference"])
        except (ManifestError, OSError, json.JSONDecodeError, KeyError) as error:
            errors.append(f"image cannot be validated: {label}: {error}")
            continue
        if current != image:
            errors.append(f"image changed after manifest capture: {label}")
    stored_toolchains = candidate.get("toolchains", [])
    current_toolchains = collect_toolchains()
    if current_toolchains != stored_toolchains:
        errors.append("toolchain identities changed after manifest capture")
    stored_host_build_inputs = candidate.get("host_build_inputs")
    if not isinstance(stored_host_build_inputs, dict) or not stored_host_build_inputs:
        errors.append("host build inputs are missing")
    else:
        try:
            current_host_build_inputs = collect_host_build_inputs(
                redaction_key, toolchain_paths(), current_toolchains
            )
        except (ManifestError, OSError, json.JSONDecodeError) as error:
            errors.append(f"host build inputs cannot be validated: {error}")
        else:
            if current_host_build_inputs != stored_host_build_inputs:
                errors.append("host build inputs changed after manifest capture")
    artifact_identities = {
        artifact["label"]: artifact for artifact in candidate.get("artifacts", [])
    }
    image_identities = {
        image["label"]: image for image in candidate.get("images", [])
    }
    expected_input_digest = build_input_digest(candidate)
    for attestation in candidate.get("build_attestations", []):
        label = attestation.get("label")
        if attestation.get("input_digest") != expected_input_digest:
            errors.append(f"build attestation input digest mismatch: {label}")
        if attestation.get("toolchains") != stored_toolchains:
            errors.append(f"build attestation toolchain mismatch: {label}")
        if attestation.get("host_build_inputs") != stored_host_build_inputs:
            errors.append(f"build attestation host build input mismatch: {label}")
        if attestation.get("environment_allowlist") != sorted(BUILD_ENV_ALLOWLIST):
            errors.append(f"build attestation environment allowlist mismatch: {label}")
        if attestation.get("pre_build_validation_errors") != [] or attestation.get(
            "post_build_validation_errors"
        ) != []:
            errors.append(f"build attestation input validation failed: {label}")
        commands = attestation.get("commands")
        logs = attestation.get("logs")
        if not isinstance(commands, list) or not commands or not isinstance(logs, list) or not logs:
            errors.append(f"build attestation provenance is incomplete: {label}")
            commands = []
            logs = []
        command_logs = []
        for command in commands:
            if not isinstance(command, dict) or command.get("return_code") != 0:
                errors.append(f"build attestation command did not pass: {label}")
                continue
            if not command.get("argv") or not command.get("cwd") or not command.get(
                "environment"
            ):
                errors.append(f"build attestation command is incomplete: {label}")
            if isinstance(command.get("log"), dict):
                command_logs.append(command["log"])
        if command_logs != logs:
            errors.append(f"build attestation command logs mismatch: {label}")
        for artifact in attestation.get("artifacts", []):
            if artifact_identities.get(artifact.get("label")) != artifact:
                errors.append(
                    f"build attestation artifact mismatch: {label}:{artifact.get('label')}"
                )
        for image in attestation.get("images", []):
            if image_identities.get(image.get("label")) != image:
                errors.append(
                    f"build attestation image mismatch: {label}:{image.get('label')}"
                )
    return errors


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    generate = commands.add_parser("generate")
    generate.add_argument("--repo", action="append", default=[], required=True)
    generate.add_argument("--exclusions", required=True)
    generate.add_argument("--effective-config", action="append", default=[])
    generate.add_argument("--lock", action="append", default=[])
    generate.add_argument("--fixture", action="append", default=[])
    generate.add_argument("--openspec-contract", action="append", default=[])
    generate.add_argument("--secret-input", action="append", default=[])
    generate.add_argument("--redaction-key", required=True)
    generate.add_argument("--artifact", action="append", default=[])
    generate.add_argument("--clock", action="append", default=[])
    generate.add_argument("--image", action="append", default=[])
    generate.add_argument("--build-attestation", action="append", default=[])
    generate.add_argument("--output", required=True)
    validate = commands.add_parser("validate")
    validate.add_argument("--manifest", required=True)
    validate.add_argument("--repo", action="append", default=[], required=True)
    validate.add_argument("--effective-config", action="append", default=[])
    validate.add_argument("--lock", action="append", default=[])
    validate.add_argument("--fixture", action="append", default=[])
    validate.add_argument("--openspec-contract", action="append", default=[])
    validate.add_argument("--artifact", action="append", default=[])
    validate.add_argument("--secret-input", action="append", default=[])
    validate.add_argument("--redaction-key", required=True)
    attest = commands.add_parser("attest")
    attest.add_argument("--input-manifest", required=True)
    attest.add_argument("--build-spec", required=True)
    attest.add_argument("--repo", action="append", default=[], required=True)
    attest.add_argument("--effective-config", action="append", default=[])
    attest.add_argument("--lock", action="append", default=[])
    attest.add_argument("--fixture", action="append", default=[])
    attest.add_argument("--openspec-contract", action="append", default=[])
    attest.add_argument("--artifact", action="append", default=[])
    attest.add_argument("--secret-input", action="append", default=[])
    attest.add_argument("--redaction-key", required=True)
    attest.add_argument("--image", action="append", default=[])
    attest.add_argument("--output", required=True)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        if args.command == "generate":
            manifest = build_manifest(args)
            output = Path(args.output)
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary = output.with_suffix(output.suffix + ".tmp")
            temporary.write_text(json.dumps(manifest, indent=2) + "\n")
            temporary.replace(output)
            print(manifest["candidate_digest"])
            return 0
        if args.command == "attest":
            attestation = create_attestation(args)
            output = Path(args.output)
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary = output.with_suffix(output.suffix + ".tmp")
            temporary.write_text(json.dumps(attestation, indent=2) + "\n")
            temporary.replace(output)
            print(attestation["input_digest"])
            return 0
        manifest = json.loads(Path(args.manifest).read_text())
        errors = validate_manifest(
            manifest,
            parse_named(args.repo, "repository"),
            parse_named(args.effective_config, "effective config"),
            parse_named(args.artifact, "artifact"),
            parse_named(args.secret_input, "secret input"),
            load_redaction_key(Path(args.redaction_key)),
            parse_named(args.lock, "lock"),
            parse_named(args.fixture, "fixture"),
            parse_named(args.openspec_contract, "OpenSpec contract"),
        )
        if errors:
            for error in errors:
                print(f"FAILED: {error}", file=sys.stderr)
            return 1
        print(f"Passed: {manifest['candidate_digest']}")
        return 0
    except (ManifestError, OSError, json.JSONDecodeError) as error:
        print(f"FAILED: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
