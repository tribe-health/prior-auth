#!/usr/bin/env python3
"""Deterministic manifest of local inputs used to build the Flint Gate binary."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _command_output(command: list[str], gate_root: Path, env: dict[str, str]) -> str:
    completed = subprocess.run(
        command,
        cwd=gate_root,
        env=env,
        capture_output=True,
        text=True,
        check=True,
        timeout=60,
    )
    return completed.stdout.strip()


def controlled_gate_build_env(source_env: dict[str, str] | None = None) -> dict[str, str]:
    """Return the explicit environment used for the mounted Gate build."""
    source = source_env or os.environ
    allowed = ("HOME", "PATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "CARGO_HOME", "RUSTUP_HOME")
    env = {key: source[key] for key in allowed if key in source}
    env.update(
        {
            "RUSTUP_TOOLCHAIN": "1.97.1",
            "CARGO_TARGET_DIR": "/tmp/ra06c02-probe-target",
            "CARGO_BUILD_BUILD_DIR": "/tmp/ra06c02-probe-build",
            "CARGO_TERM_COLOR": "never",
            "LANG": "C",
            "LC_ALL": "C",
        }
    )
    return env


def _cargo_config_files(gate_root: Path, env: dict[str, str]) -> list[Path]:
    files: set[Path] = set()
    for directory in (gate_root.resolve(), *gate_root.resolve().parents):
        for name in ("config", "config.toml"):
            path = directory / ".cargo" / name
            if path.is_file():
                files.add(path)
    cargo_home = Path(env.get("CARGO_HOME", Path(env["HOME"]) / ".cargo"))
    for name in ("config", "config.toml"):
        path = cargo_home / name
        if path.is_file():
            files.add(path.resolve())
    return sorted(files)


def _tool_identity(name: str, version_args: list[str], gate_root: Path, env: dict[str, str]):
    path = shutil.which(name, path=env.get("PATH"))
    if path is None:
        return None
    resolved = Path(path).resolve()
    completed = subprocess.run(
        [str(resolved), *version_args],
        cwd=gate_root,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return {
        "path": str(resolved),
        "sha256": _sha256(resolved),
        "return_code": completed.returncode,
        "version": (completed.stdout + completed.stderr).strip(),
    }


def gate_build_inputs(gate_root: Path, env: dict[str, str] | None = None) -> dict:
    """Hash locked dependencies, toolchain identity, and every reachable local package file."""
    command_env = dict(env) if env is not None else os.environ.copy()
    metadata = json.loads(
        _command_output(
            [os.environ.get("RA06_TOOL_CARGO", "cargo"), "metadata", "--format-version", "1", "--locked", "--all-features"],
            gate_root,
            command_env,
        )
    )
    packages = {package["id"]: package for package in metadata["packages"]}
    nodes = {node["id"]: node for node in metadata["resolve"]["nodes"]}
    root_manifest = (gate_root / "crates/flint-gate/Cargo.toml").resolve()
    root_id = next(
        package["id"]
        for package in metadata["packages"]
        if Path(package["manifest_path"]).resolve() == root_manifest
    )

    reachable: set[str] = set()
    pending = [root_id]
    while pending:
        package_id = pending.pop()
        if package_id in reachable:
            continue
        reachable.add(package_id)
        pending.extend(dependency["pkg"] for dependency in nodes[package_id]["deps"])

    local_packages = [packages[package_id] for package_id in reachable if packages[package_id]["source"] is None]
    files: set[Path] = set()
    for package in local_packages:
        package_root = Path(package["manifest_path"]).resolve().parent
        for path in package_root.rglob("*"):
            if path.is_file() and not {".git", "target"}.intersection(path.parts):
                files.add(path)
    for relative in (
        "Cargo.toml",
        "Cargo.lock",
        "rust-toolchain",
        "rust-toolchain.toml",
        "rustfmt.toml",
        ".cargo/config",
        ".cargo/config.toml",
    ):
        path = gate_root / relative
        if path.is_file():
            files.add(path.resolve())

    file_hashes = {}
    for path in sorted(files):
        try:
            label = str(path.relative_to(gate_root.resolve()))
        except ValueError:
            label = f"external:{path}"
        file_hashes[label] = _sha256(path)

    manifest = {
        "schema_version": 1,
        "root_package": "flint-gate",
        "features": "all",
        "profile": "debug",
        "cargo_metadata_locked": True,
        "build_command": [
            "cargo",
            "build",
            "--locked",
            "--manifest-path",
            str(gate_root / "Cargo.toml"),
            "-p",
            "flint-gate",
            "--all-features",
            "--message-format=json",
        ],
        "build_environment": dict(sorted(command_env.items())),
        "cargo_config_sha256": {
            str(path): _sha256(path) for path in _cargo_config_files(gate_root, command_env)
        },
        "rustc_vv": _command_output(
            [os.environ.get("RA06_TOOL_RUSTC", "rustc"), "-vV"],
            gate_root,
            command_env,
        ),
        "cargo_version": _command_output([os.environ.get("RA06_TOOL_CARGO", "cargo"), "--version"], gate_root, command_env),
        "native_tools": {
            name: identity
            for name, identity in (
                ("cc", _tool_identity("cc", ["--version"], gate_root, command_env)),
                ("clang", _tool_identity("clang", ["--version"], gate_root, command_env)),
                ("ld", _tool_identity("ld", ["-v"], gate_root, command_env)),
                ("sccache", _tool_identity("sccache", ["--version"], gate_root, command_env)),
            )
            if identity is not None
        },
        "local_packages": sorted(
            f"{package['name']}@{package['version']}:{Path(package['manifest_path']).resolve()}"
            for package in local_packages
        ),
        "files": file_hashes,
    }
    encoded = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    return {
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "file_count": len(file_hashes),
        "local_packages": manifest["local_packages"],
        "rustc_vv": manifest["rustc_vv"],
        "cargo_version": manifest["cargo_version"],
        "root_package": manifest["root_package"],
        "features": manifest["features"],
        "profile": manifest["profile"],
        "build_command": manifest["build_command"],
        "build_environment": manifest["build_environment"],
        "cargo_config_sha256": manifest["cargo_config_sha256"],
        "native_tools": manifest["native_tools"],
    }
