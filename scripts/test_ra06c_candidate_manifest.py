#!/usr/bin/env python3
"""Local boundary tests for the RA06c candidate manifest."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import tempfile
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("ra06c_candidate_manifest.py")
SPEC = importlib.util.spec_from_file_location("ra06c_candidate_manifest", MODULE_PATH)
assert SPEC and SPEC.loader
manifest_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(manifest_module)
REDACTION_KEY = b"ra06c-candidate-manifest-test-key"


def assert_flutter_version_identity(toolchains: list[dict]) -> None:
    flutter = next(item for item in toolchains if item["label"] == "flutter")
    version = json.loads(flutter["version"])
    assert len(version["frameworkRevision"]) == 40
    assert len(version["engineRevision"]) == 40
    assert version["frameworkCommitDate"]
    assert version["engineCommitDate"]
    assert version["flutterRoot"].startswith("<redacted-home>/")
    assert " days ago" not in flutter["version"]


def git(root: Path, *args: str) -> str:
    completed = subprocess.run(
        ("git", "-C", str(root), *args), capture_output=True, text=True, check=True
    )
    return completed.stdout.strip()


def write(path: Path, value: str, mode: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value)
    if mode is not None:
        path.chmod(mode)


def repository(root: Path) -> None:
    root.mkdir()
    git(root, "init", "-q")
    git(root, "config", "user.email", "manifest@example.invalid")
    git(root, "config", "user.name", "Manifest Test")
    write(root / "tracked.txt", "tracked\n")
    write(root / "deleted.txt", "deleted\n")
    write(root / "executable.sh", "#!/bin/sh\nexit 0\n", 0o755)
    os.symlink("tracked.txt", root / "tracked-link")
    nested = root / "vendor" / "module"
    nested.mkdir(parents=True)
    git(nested, "init", "-q")
    git(nested, "config", "user.email", "manifest@example.invalid")
    git(nested, "config", "user.name", "Manifest Test")
    write(nested / "module.txt", "module\n")
    git(nested, "add", ".")
    git(nested, "commit", "-qm", "module fixture")
    git(root, "add", ".")
    git(root, "commit", "-qm", "fixture")
    (root / "deleted.txt").unlink()
    write(root / "untracked.txt", "untracked\n")
    write(root / "evidence" / "mutable.log", "excluded\n")


def assert_secret_safe(temp: Path) -> None:
    first = temp / "first.json"
    second = temp / "second.json"
    base = {
        "database_url": "postgres://alice:{password}@db.local/aso",
        "jwt_secret": "{secret}",
        "listen": "127.0.0.1:8080",
        "bind_mount": "/Users/example/Projects/service/config.yaml:/config.yaml:ro",
    }
    first.write_text(
        json.dumps({key: value.format(password="one", secret="alpha") for key, value in base.items()})
    )
    second.write_text(
        json.dumps({key: value.format(password="two", secret="bravo") for key, value in base.items()})
    )
    left = manifest_module.configuration("effective", first, REDACTION_KEY)
    right = manifest_module.configuration("effective", second, REDACTION_KEY)
    encoded = json.dumps(left)
    assert left["sanitized_sha256"] == right["sanitized_sha256"]
    assert left["exact_hmac_sha256"] != right["exact_hmac_sha256"]
    assert "alpha" not in encoded and "one" not in encoded and "alice" not in encoded
    assert "/Users/example/" not in encoded
    nested = manifest_module.sanitize_text(
        "secrets:\n  cookie:\n    - nested-cookie-value\n"
        "  cipher:\n    - nested-cipher-value\n"
        "oauth:\n  client_credentials_enabled: false\n"
        "token_exchange:\n  enabled: false\n"
    )
    assert "nested-cookie-value" not in nested
    assert "nested-cipher-value" not in nested
    assert "client_credentials_enabled: false" in nested
    assert "token_exchange:" in nested
    assert manifest_module.sanitize_text(nested) == nested
    shell_expansion = "root=${PROMETHEUS_ROOT:-/Users/example/Projects/prior-auth}\n"
    assert manifest_module.sanitize_text(shell_expansion) == (
        "root=${PROMETHEUS_ROOT:-<redacted-home-path>}\n"
    )


def assert_cargo_configuration() -> None:
    """Synthetic only: no metadata, toolchain, Docker, or dependency collection."""
    with tempfile.TemporaryDirectory(prefix="ra06c-cargo-config-") as directory:
        root = Path(directory).resolve()
        cwd = root / "project" / "nested"
        cwd.mkdir(parents=True)
        home = root / "isolated-cargo"
        home.mkdir()
        env = {"HOME": str(root), "CARGO_HOME": str(home), "PATH": str(root / "bin")}
        manifests = (("fixture", cwd / "Cargo.toml"),)
        collect = lambda: manifest_module.collect_cargo_configuration(env, manifests)
        initial = collect()
        parent_config = root / ".cargo" / "config.toml"
        write(parent_config, "[build]\njobs = 2\n")
        created = collect()
        assert created != initial, "new ancestor configuration must change identity"
        write(parent_config, "[build]\njobs = 3\n")
        assert collect() != created, "configuration bytes must change identity"
        wrapper = root / "bin" / "wrapper"
        write(wrapper, "#!/bin/sh\nexit 0\n", 0o755)
        write(parent_config, '[build]\nrustc-wrapper = "bin/wrapper"\n')
        wrapped = collect()
        selected = wrapped["workspaces"][0]["wrappers"][0]
        assert selected["executable"]["sha256"] == manifest_module.sha256_file(wrapper)
        write(wrapper, "#!/bin/sh\nexit 1\n", 0o755)
        assert collect() != wrapped, "wrapper bytes must change identity"
        local = cwd / ".cargo" / "config.toml"
        write(local, '[build]\nrustc-wrapper = "wrapper"\n')
        assert collect()["workspaces"][0]["wrappers"][0]["source"] == str(local)
        # Legacy config wins when both names exist, including an empty override.
        write(cwd / ".cargo" / "config", '[build]\nrustc-wrapper = ""\n')
        assert collect()["workspaces"][0]["wrappers"][0]["enabled"] is False
        env["CARGO_BUILD_RUSTC_WRAPPER"] = str(wrapper)
        assert collect()["workspaces"][0]["wrappers"][0]["enabled"] is True
        env["RUSTC_WRAPPER"] = ""
        assert collect()["workspaces"][0]["wrappers"][0]["enabled"] is False
        env["RUSTC_WORKSPACE_WRAPPER"] = "../../bin/wrapper"
        assert collect()["workspaces"][0]["wrappers"][1]["executable"]["sha256"] == manifest_module.sha256_file(wrapper)
        before_global = collect()
        write(home / "config.toml", "[build]\njobs = 5\n")
        assert collect() != before_global, "new CARGO_HOME configuration must change identity"
        configs = collect()["workspaces"][0]["configs"]
        assert any(entry["path"] == str(home / "config") and not entry["present"] for entry in configs)


def main() -> None:
    assert_cargo_configuration()
    with tempfile.TemporaryDirectory(prefix="ra06c-manifest-") as directory:
        temp = Path(directory)
        repo = temp / "repo"
        repository(repo)
        rules = [
            {"repository": "fixture", "pattern": "evidence/**", "reason": "test evidence"}
        ]
        captured = manifest_module.collect_repository("fixture", repo, rules)
        entries = {entry["path"]: entry for entry in captured["files"]}
        assert entries["tracked.txt"]["sha256"]
        assert entries["tracked.txt"]["index_oid"]
        assert entries["tracked.txt"]["head_oid"]
        assert entries["deleted.txt"]["kind"] == "deleted"
        assert entries["deleted.txt"]["index_oid"]
        assert entries["untracked.txt"]["tracked"] is False
        assert entries["executable.sh"]["mode"] == "100755"
        assert entries["tracked-link"]["kind"] == "symlink"
        assert entries["vendor/module"]["kind"] == "gitlink"
        assert entries["vendor/module"]["worktree_head"]
        assert entries["vendor/module"]["worktree_dirty"] is False
        assert captured["excluded_files"] == [
            {"path": "evidence/mutable.log", "pattern": "evidence/**", "reason": "test evidence"}
        ]
        tasks = repo / "openspec" / "changes" / "candidate" / "tasks.md"
        write(tasks, "- [ ] Preserve task content.\n")
        unchecked = manifest_module.collect_repository("fixture", repo, rules)
        write(tasks, "- [x] Preserve task content.\n")
        checked = manifest_module.collect_repository("fixture", repo, rules)
        assert manifest_module.comparable_repository(unchecked) == (
            manifest_module.comparable_repository(checked)
        )
        write(tasks, "- [x] Change task content.\n")
        changed = manifest_module.collect_repository("fixture", repo, rules)
        assert manifest_module.comparable_repository(unchecked) != (
            manifest_module.comparable_repository(changed)
        )
        tasks.unlink()
        assert_secret_safe(temp)
        effective_config = temp / "effective.json"
        effective_config.write_text(
            json.dumps({"database_url": "postgres://flint:first@db/flint", "mode": "shape"})
        )
        artifact = temp / "aso-web-server"
        secret_input = temp / "signing-key.pem"
        secret_input.write_text("private-key-one")
        redaction_key_path = temp / "manifest-hmac.key"
        redaction_key_path.write_bytes(REDACTION_KEY)

        pnpm_install = temp / "web-node-modules"
        write(pnpm_install / ".pnpm/example@1.0.0/node_modules/example/index.js", "v1\n")
        os.symlink(
            ".pnpm/example@1.0.0/node_modules/example",
            pnpm_install / "example",
        )
        pnpm_v1 = manifest_module.collect_pnpm_dependency_sources(pnpm_install)
        assert pnpm_v1["install_layout"] == "pnpm-node-modules-tree"
        assert pnpm_v1["workspaces"][0]["file_count"] == 2
        write(pnpm_install / ".pnpm/example@1.0.0/node_modules/example/index.js", "v2\n")
        pnpm_v2 = manifest_module.collect_pnpm_dependency_sources(pnpm_install)
        assert pnpm_v1["workspaces"][0]["tree_sha256"] != (
            pnpm_v2["workspaces"][0]["tree_sha256"]
        )

        dart_candidate = temp / "dart-candidate"
        dart_external = temp / "dart-cache/example-1.0.0"
        package_config = dart_candidate / "mobile/.dart_tool/package_config.json"
        write(dart_candidate / "mobile/lib/main.dart", "void main() {}\n")
        write(dart_external / "lib/example.dart", "const value = 1;\n")
        write(
            package_config,
            json.dumps(
                {
                    "configVersion": 2,
                    "packages": [
                        {
                            "name": "prior_auth",
                            "rootUri": "../../",
                            "packageUri": "lib/",
                            "languageVersion": "3.11",
                        },
                        {
                            "name": "example",
                            "rootUri": dart_external.as_uri(),
                            "packageUri": "lib/",
                            "languageVersion": "3.11",
                        },
                    ],
                }
            ),
        )
        dart_v1 = manifest_module.collect_dart_dependency_sources(
            package_config, dart_candidate
        )
        assert dart_v1["package_count"] == 2
        assert len(dart_v1["sources"]) == 1
        assert dart_v1["sources"][0]["source_kind"] == "sdk-or-external"
        write(dart_external / "lib/example.dart", "const value = 2;\n")
        dart_v2 = manifest_module.collect_dart_dependency_sources(
            package_config, dart_candidate
        )
        assert dart_v1["sources"][0]["tree_sha256"] != (
            dart_v2["sources"][0]["tree_sha256"]
        )

        toolchains = manifest_module.collect_toolchains()
        assert_flutter_version_identity(toolchains)
        assert len(toolchains) == 12
        assert all(item.get("available") is True for item in toolchains)
        assert all(len(item.get("sha256", "")) == 64 for item in toolchains)
        assert all(item.get("execution_path") for item in toolchains)
        assert next(item for item in toolchains if item["label"] == "rustc")[
            "linked_dependencies"
        ]
        assert next(item for item in toolchains if item["label"] == "flutter")[
            "runtime_dependencies"
        ]
        assert next(item for item in toolchains if item["label"] == "pnpm")[
            "runtime_dependencies"
        ]
        host_build_inputs = manifest_module.collect_host_build_inputs(
            REDACTION_KEY, manifest_module.toolchain_paths(), toolchains
        )
        assert {item["name"] for item in host_build_inputs["environment"]} == {
            "AR", "CARGO", "CARGO_HOME", "CARGO_INCREMENTAL", "CARGO_NET_OFFLINE",
            "CC", "COREPACK_ENABLE_DOWNLOAD_PROMPT", "COREPACK_HOME", "CXX",
            "DOCKER_CONFIG", "DOCKER_HOST", "HOME", "LANG", "LC_ALL",
            "LD", "PATH", "PUB_CACHE", "RANLIB", "RUSTC", "RUSTDOC", "RUSTUP_HOME", "SDKROOT",
            "TMPDIR",
        }
        assert all(
            len(item["exact_hmac_sha256"]) == 64
            for item in host_build_inputs["environment"]
        )
        native_tools = {
            item["label"]: item for item in host_build_inputs["transitive_tools"]
        }
        for label in ("ar", "clang", "clang++", "ld", "make", "ranlib"):
            assert native_tools[label]["execution_path"] == str(
                manifest_module.xcrun_find(label)
            )
            assert len(native_tools[label]["sha256"]) == 64
        assert {item["label"] for item in host_build_inputs["platform"]} >= {
            "xcode-selection", "xcode-tools"
        }
        assert host_build_inputs["dependency_policy"]["cargo_offline"] is True
        assert {item["label"] for item in host_build_inputs["cargo_dependencies"]["workspaces"]} == {
            "prior-auth", "flint-gate"
        }
        assert host_build_inputs["cargo_dependencies"]["sources"]
        assert all(
            len(item["tree_sha256"]) == 64
            for item in host_build_inputs["cargo_dependencies"]["sources"]
        )
        assert host_build_inputs["pnpm_dependencies"]["workspaces"][0][
            "file_count"
        ] > 0
        assert len(
            host_build_inputs["pnpm_dependencies"]["workspaces"][0]["tree_sha256"]
        ) == 64
        assert host_build_inputs["dart_dependencies"]["package_count"] > 0
        assert host_build_inputs["dart_dependencies"]["sources"]
        assert all(
            len(item["tree_sha256"]) == 64
            for item in host_build_inputs["dart_dependencies"]["sources"]
        )
        assert {item["label"] for item in host_build_inputs["platform_trees"]} == {
            "macos-sdk", "clang-resource-dir"
        }
        assert all(
            len(item["tree_sha256"]) == 64
            for item in host_build_inputs["platform_trees"]
        )
        frozen_toolchains = json.loads(json.dumps(toolchains))
        frozen_host_build_inputs = json.loads(json.dumps(host_build_inputs))
        manifest_module.collect_toolchains = lambda: json.loads(
            json.dumps(frozen_toolchains)
        )
        manifest_module.collect_host_build_inputs = lambda *_args, **_kwargs: json.loads(
            json.dumps(frozen_host_build_inputs)
        )
        candidate = {
            "exclusion_contract": {
                "rules": rules,
                "sha256": manifest_module.sha256_bytes(
                    manifest_module.canonical({"schema_version": 1, "rules": rules})
                ),
            },
            "repositories": [captured],
            "configurations": [
                manifest_module.configuration("compose", effective_config, REDACTION_KEY)
            ],
            "locks": [],
            "fixtures": [],
            "secret_inputs": [
                manifest_module.secret_identity("signing-key", secret_input, REDACTION_KEY)
            ],
            "artifacts": [],
            "clocks": [],
            "images": [],
            "toolchains": toolchains,
            "host_build_inputs": host_build_inputs,
        }
        manifest = {
            "schema_version": 1,
            "candidate": candidate,
            "candidate_digest": manifest_module.candidate_digest(candidate),
        }
        validation_configs = {"compose": str(effective_config)}
        errors = manifest_module.validate_manifest(
            manifest,
            {"fixture": str(repo)},
            validation_configs,
            {},
            {"signing-key": str(secret_input)},
            REDACTION_KEY,
        )
        assert errors == [], errors
        lock_path = temp / "dependency.lock"
        fixture_path = temp / "contract-fixture.json"
        lock_path.write_text("locked-v1\n")
        fixture_path.write_text('{"contract":"v1"}\n')
        path_manifest = json.loads(json.dumps(manifest))
        path_manifest["candidate"]["locks"] = [
            manifest_module.path_identity("dependency", lock_path)
        ]
        path_manifest["candidate"]["fixtures"] = [
            manifest_module.path_identity("contract", fixture_path)
        ]
        path_manifest["candidate_digest"] = manifest_module.candidate_digest(
            path_manifest["candidate"]
        )
        path_validation = {
            "locks": {"dependency": str(lock_path)},
            "fixtures": {"contract": str(fixture_path)},
        }
        assert manifest_module.validate_manifest(
            path_manifest,
            {"fixture": str(repo)},
            validation_configs,
            {},
            {"signing-key": str(secret_input)},
            REDACTION_KEY,
            **path_validation,
        ) == []
        lock_path.write_text("locked-v2\n")
        assert manifest_module.validate_manifest(
            path_manifest,
            {"fixture": str(repo)},
            validation_configs,
            {},
            {"signing-key": str(secret_input)},
            REDACTION_KEY,
            **path_validation,
        ) == ["lock changed after manifest capture: dependency"]
        lock_path.write_text("locked-v1\n")
        fixture_path.write_text('{"contract":"v2"}\n')
        assert manifest_module.validate_manifest(
            path_manifest,
            {"fixture": str(repo)},
            validation_configs,
            {},
            {"signing-key": str(secret_input)},
            REDACTION_KEY,
            **path_validation,
        ) == ["fixture changed after manifest capture: contract"]
        fixture_path.write_text('{"contract":"v1"}\n')
        contract_dir = temp / "active-change"
        write(contract_dir / ".openspec.yaml", "schema: spec-driven\n")
        write(contract_dir / "proposal.md", "# Proposal\n")
        write(contract_dir / "design.md", "# Design\n")
        write(contract_dir / "tasks.md", "- [ ] 1.1 Freeze candidate\n")
        write(contract_dir / "specs" / "fixture" / "spec.md", "# Requirement\n")
        contract_identity = manifest_module.openspec_contract_identity(
            "repair", contract_dir
        )
        contract_manifest = json.loads(json.dumps(manifest))
        contract_manifest["candidate"]["openspec_contracts"] = [contract_identity]
        contract_manifest["candidate_digest"] = manifest_module.candidate_digest(
            contract_manifest["candidate"]
        )
        assert manifest_module.validate_manifest(
            contract_manifest,
            {"fixture": str(repo)},
            validation_configs,
            {},
            {"signing-key": str(secret_input)},
            REDACTION_KEY,
            openspec_contracts={"repair": str(contract_dir)},
        ) == []
        write(contract_dir / "tasks.md", "- [x] 1.1 Freeze candidate\n")
        assert manifest_module.openspec_contract_identity(
            "repair", contract_dir
        ) == contract_identity
        archived_contract = temp / "archive" / "2026-09-13-active-change"
        archived_contract.parent.mkdir()
        contract_dir.rename(archived_contract)
        assert manifest_module.openspec_contract_identity(
            "repair", archived_contract
        ) == contract_identity
        write(archived_contract / "design.md", "# Changed design\n")
        assert manifest_module.openspec_contract_identity(
            "repair", archived_contract
        ) != contract_identity
        assert manifest_module.validate_manifest(
            contract_manifest,
            {"fixture": str(repo)},
            validation_configs,
            {},
            {"signing-key": str(secret_input)},
            REDACTION_KEY,
            openspec_contracts={"repair": str(archived_contract)},
        ) == ["OpenSpec contract changed after manifest capture: repair"]
        input_manifest = temp / "build-input.json"
        input_manifest.write_text(json.dumps(manifest))
        build_log = temp / "build.log"
        build_spec = temp / "build-spec.json"
        build_spec.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "inherit_environment": ["PATH"],
                    "commands": [
                        {
                            "label": "synthetic-build",
                            "cwd": str(temp),
                            "argv": [
                                os.sys.executable,
                                "-c",
                                (
                                    "from pathlib import Path; import sys; "
                                    "Path(sys.argv[1]).write_text('binary-v1'); "
                                    "Path(sys.argv[1]).chmod(0o755); "
                                    "print('synthetic build completed')"
                                ),
                                str(artifact),
                            ],
                            "environment": {},
                            "log": str(build_log),
                        }
                    ],
                }
            )
        )
        attestation = manifest_module.create_attestation(
            argparse.Namespace(
                input_manifest=str(input_manifest),
                build_spec=str(build_spec),
                repo=[f"fixture={repo}"],
                effective_config=[f"compose={effective_config}"],
                lock=[],
                fixture=[],
                openspec_contract=[],
                artifact=[f"aso-web-server={artifact}"],
                secret_input=[f"signing-key={secret_input}"],
                redaction_key=str(redaction_key_path),
                image=[],
            )
        )
        assert artifact.read_text() == "binary-v1"
        assert build_log.read_text() == "synthetic build completed\n"
        assert attestation["commands"][0]["return_code"] == 0
        assert attestation["pre_build_validation_errors"] == []
        assert attestation["post_build_validation_errors"] == []
        manifest["candidate"]["artifacts"] = [
            manifest_module.path_identity("aso-web-server", artifact)
        ]
        embedded_attestation = {"label": "synthetic-build", **attestation}
        manifest["candidate"]["build_attestations"] = [embedded_attestation]
        manifest["candidate_digest"] = manifest_module.candidate_digest(
            manifest["candidate"]
        )
        assert manifest_module.validate_manifest(
            manifest,
            {"fixture": str(repo)},
            validation_configs,
            {"aso-web-server": str(artifact)},
            {"signing-key": str(secret_input)},
            REDACTION_KEY,
        ) == []
        effective_config.write_text(
            json.dumps({"database_url": "postgres://flint:second@db/flint", "mode": "shape"})
        )
        assert manifest_module.validate_manifest(
            manifest,
            {"fixture": str(repo)},
            validation_configs,
            {"aso-web-server": str(artifact)},
            {"signing-key": str(secret_input)},
            REDACTION_KEY,
        ) == ["effective configuration changed after manifest capture: compose"]
        effective_config.write_text(
            json.dumps({"database_url": "postgres://flint:first@db/flint", "mode": "shape"})
        )
        secret_input.write_text("private-key-two")
        assert manifest_module.validate_manifest(
            manifest,
            {"fixture": str(repo)},
            validation_configs,
            {"aso-web-server": str(artifact)},
            {"signing-key": str(secret_input)},
            REDACTION_KEY,
        ) == ["secret input changed after manifest capture: signing-key"]
        secret_input.write_text("private-key-one")
        embedded_attestation["input_digest"] = "sha256:wrong"
        manifest["candidate_digest"] = manifest_module.candidate_digest(
            manifest["candidate"]
        )
        assert "build attestation input digest mismatch: synthetic-build" in (
            manifest_module.validate_manifest(
                manifest,
                {"fixture": str(repo)},
                validation_configs,
                {"aso-web-server": str(artifact)},
                {"signing-key": str(secret_input)},
                REDACTION_KEY,
            )
        )
        embedded_attestation["input_digest"] = manifest_module.build_input_digest(
            manifest["candidate"]
        )
        manifest["candidate_digest"] = manifest_module.candidate_digest(
            manifest["candidate"]
        )
        write(repo / "evidence" / "mutable.log", "later evidence\n")
        write(repo / "evidence" / "new.log", "new evidence\n")
        assert manifest_module.validate_manifest(
            manifest,
            {"fixture": str(repo)},
            validation_configs,
            {"aso-web-server": str(artifact)},
            {"signing-key": str(secret_input)},
            REDACTION_KEY,
        ) == []
        effective_config.write_text(
            json.dumps({"database_url": "postgres://flint:second@db/flint", "mode": "full"})
        )
        assert manifest_module.validate_manifest(
            manifest,
            {"fixture": str(repo)},
            validation_configs,
            {"aso-web-server": str(artifact)},
            {"signing-key": str(secret_input)},
            REDACTION_KEY,
        ) == ["effective configuration changed after manifest capture: compose"]
        effective_config.write_text(
            json.dumps({"database_url": "postgres://flint:first@db/flint", "mode": "shape"})
        )
        refused_spec = temp / "refused-build-spec.json"
        refused_spec.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "inherit_environment": ["UNCONTROLLED_VALUE"],
                    "commands": [
                        {
                            "label": "refused",
                            "cwd": str(temp),
                            "argv": [os.sys.executable, "-c", "print('no')"],
                            "environment": {},
                            "log": str(temp / "refused.log"),
                        }
                    ],
                }
            )
        )
        try:
            manifest_module.load_build_spec(refused_spec)
        except manifest_module.ManifestError as error:
            assert "non-allowlisted environment" in str(error)
        else:
            raise AssertionError("non-allowlisted inherited environment was accepted")

        mutating_spec = temp / "mutating-build-spec.json"
        mutating_spec.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "inherit_environment": ["PATH"],
                    "commands": [
                        {
                            "label": "mutating-build",
                            "cwd": str(temp),
                            "argv": [
                                os.sys.executable,
                                "-c",
                                "from pathlib import Path; Path('repo/tracked.txt').write_text('mutated\\n')",
                            ],
                            "environment": {},
                            "log": str(temp / "mutating-build.log"),
                        }
                    ],
                }
            )
        )
        try:
            manifest_module.create_attestation(
                argparse.Namespace(
                    input_manifest=str(input_manifest),
                    build_spec=str(mutating_spec),
                    repo=[f"fixture={repo}"],
                    effective_config=[f"compose={effective_config}"],
                    lock=[],
                    fixture=[],
                    openspec_contract=[],
                    artifact=[],
                    secret_input=[f"signing-key={secret_input}"],
                    redaction_key=str(redaction_key_path),
                    image=[],
                )
            )
        except manifest_module.ManifestError as error:
            assert "build changed frozen inputs" in str(error)
        else:
            raise AssertionError("build-time source mutation was accepted")
        write(repo / "tracked.txt", "tracked\n")

        write(repo / "tracked.txt", "changed\n")
        assert manifest_module.validate_manifest(
            manifest,
            {"fixture": str(repo)},
            validation_configs,
            {"aso-web-server": str(artifact)},
            {"signing-key": str(secret_input)},
            REDACTION_KEY,
        ) == [
            "repository changed after manifest capture: fixture"
        ]
        write(repo / "tracked.txt", "tracked\n")
        write(artifact, "binary-v2", 0o755)
        assert manifest_module.validate_manifest(
            manifest,
            {"fixture": str(repo)},
            validation_configs,
            {"aso-web-server": str(artifact)},
            {"signing-key": str(secret_input)},
            REDACTION_KEY,
        ) == ["artifact changed after manifest capture: aso-web-server"]
        manifest["candidate"]["toolchains"][0]["sha256"] = "0" * 64
        manifest["candidate_digest"] = manifest_module.candidate_digest(
            manifest["candidate"]
        )
        assert "toolchain identities changed after manifest capture" in (
            manifest_module.validate_manifest(
                manifest,
                {"fixture": str(repo)},
                validation_configs,
                {"aso-web-server": str(artifact)},
                {"signing-key": str(secret_input)},
                REDACTION_KEY,
            )
        )
        manifest["candidate"]["toolchains"][0]["sha256"] = toolchains[0]["sha256"]
        manifest["candidate"]["host_build_inputs"]["environment"][0][
            "exact_hmac_sha256"
        ] = "0" * 64
        manifest["candidate_digest"] = manifest_module.candidate_digest(
            manifest["candidate"]
        )
        assert "host build inputs changed after manifest capture" in (
            manifest_module.validate_manifest(
                manifest,
                {"fixture": str(repo)},
                validation_configs,
                {"aso-web-server": str(artifact)},
                {"signing-key": str(secret_input)},
                REDACTION_KEY,
            )
        )
    print(
        "Passed: candidate source identity, exact keyed configuration, locks, fixtures, "
        "secret inputs, exclusions, modes, and symlinks"
    )


if __name__ == "__main__":
    main()
