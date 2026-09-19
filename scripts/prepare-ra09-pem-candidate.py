"""Package accepted PEM bytes as an isolated, uniquely identified local candidate."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--app", type=Path, required=True)
    parser.add_argument("--core", type=Path, required=True)
    parser.add_argument("--react", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source, app, output = args.source.resolve(), args.app.resolve(), args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
    paths = {
        "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc",
        "scripts/tsup-package-config.ts",
        "prometheus-entity-skills/_shared/references/core-library-exports.json",
        "prometheus-entity-skills/_shared/references/library-exports.json",
        "prometheus-entity-skills/_shared/references/library-api.md",
    }
    for package in ("core", "react"):
        base = source / f"packages/entity-graph-{package}"
        for name in ("package.json", "tsconfig.json", "tsup.config.ts", "README.md", "CHANGELOG.md"):
            if (base / name).is_file():
                paths.add(str((base / name).relative_to(source)))
        for folder in ("src", "fixtures"):
            paths.update(str(p.relative_to(source)) for p in (base / folder).rglob("*") if p.is_file())
    for folder in ("ra07-scoped-runtime-acceptance", "ra08-committed-projection-acceptance"):
        paths.update(str(p.relative_to(source)) for p in (source / "scripts" / folder).rglob("*") if p.is_file())
    inventory = [{"path": p, "sha256": sha((source / p).read_bytes())} for p in sorted(paths)]
    source_digest = sha(json.dumps(inventory, sort_keys=True, separators=(",", ":")).encode())
    version = f"4.0.3-ra09.0.g{revision[:7]}.s{source_digest[:12]}"
    accepted = []
    for change in ("ra-07-scoped-pem-runtime", "ra-08-committed-graph-projection"):
        evidence = app / ".kbd-orchestrator/phases/runtime-architecture/evidence" / change
        receipt = json.loads((evidence / "final-review-receipt.json").read_text())
        require(receipt["status"] == "Passed", f"{change} is not accepted")
        # RA08 supersedes the overlapping RA07 exports/API files. Compare all
        # remaining RA07 files and every final RA08 file with accepted snapshots.
        index = json.loads((evidence / "source-index.json").read_text())
        if change == "ra-07-scoped-pem-runtime":
            newer = json.loads((app / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-08-committed-graph-projection/source-index.json").read_text())
            superseded = {entry["path"] for entry in newer}
            index = [entry for entry in index if entry["path"] not in superseded]
        for entry in index:
            path = entry["path"]
            actual = app / path.removeprefix("prior-auth/") if path.startswith("prior-auth/") else source / path
            require(sha(actual.read_bytes()) == entry["sha256"], f"Accepted source changed: {path}")
        accepted.append({"change": change, "candidate_digest": receipt["candidate_digest"],
                         "receipt_sha256": sha((evidence / "final-review-receipt.json").read_bytes())})
    write_json(output / "source-inventory.json", inventory)
    (output / "source.diff").write_bytes(subprocess.check_output(["git", "diff", "--", *sorted(paths)], cwd=source))
    # Include new files in a portable source bundle; Git diff alone omits them.
    with tarfile.open(output / "source.tar.gz", "w:gz") as archive:
        for path in sorted(paths):
            archive.add(source / path, arcname=path, recursive=False)
    packages = []
    for package, original in (("core", args.core.resolve()), ("react", args.react.resolve())):
        content = {}
        with tarfile.open(original, "r:gz") as archive:
            for member in archive.getmembers():
                if member.isdir():
                    continue
                require(member.isfile() and member.name.startswith("package/"), "Unexpected package archive member")
                relative = member.name.removeprefix("package/")
                require(".." not in Path(relative).parts and not Path(relative).is_absolute(), "Unsafe package archive path")
                require(relative not in content, f"Duplicate package member: {relative}")
                content[relative] = archive.extractfile(member).read()
        original_manifest = json.loads(content["package.json"])
        manifest = json.loads(content["package.json"])
        name = f"@prometheus-ags/entity-graph-{package}"
        require(manifest["name"] == name, f"Unexpected package name: {manifest['name']}")
        package_root = source / f"packages/entity-graph-{package}"
        expected_manifest = json.loads((package_root / "package.json").read_text())
        if package == "react":
            # The accepted pnpm pack resolved workspace references and omitted
            # prepublishOnly. All other source manifest fields must be identical.
            core_version = json.loads((source / "packages/entity-graph-core/package.json").read_text())["version"]
            expected_manifest["peerDependencies"]["@prometheus-ags/entity-graph-core"] = "^" + core_version
            expected_manifest["devDependencies"]["@prometheus-ags/entity-graph-core"] = core_version
            expected_manifest["scripts"].pop("prepublishOnly", None)
        require(manifest == expected_manifest, f"Packed manifest differs from accepted source: {name}")
        expected_members = {"package.json", "LICENSE"}
        for entry in expected_manifest["files"]:
            selected = package_root / entry
            require(selected.exists(), f"Declared package input missing: {entry}")
            if selected.is_dir():
                expected_members.update(str(item.relative_to(package_root)) for item in selected.rglob("*") if item.is_file())
            else:
                expected_members.add(entry)
        require(set(content) == expected_members, f"Packed member set differs from source: {name}")
        for path, data in content.items():
            if path == "package.json":
                continue
            if path == "LICENSE":
                # pnpm inherits the repository license. Bind it to the full Git
                # revision already used by this candidate, not mutable worktree bytes.
                expected = subprocess.check_output(["git", "show", f"{revision}:LICENSE"], cwd=source)
            else:
                source_path = package_root / path
                require(path.startswith("dist/") or str(source_path.relative_to(source)) in paths,
                        f"Package member has no source identity: {path}")
                expected = source_path.read_bytes()
            require(data == expected, f"Packaged bytes differ from source: {path}")
        manifest["version"] = version
        if package == "react":
            manifest["peerDependencies"]["@prometheus-ags/entity-graph-core"] = version
            if "@prometheus-ags/entity-graph-core" in manifest.get("devDependencies", {}):
                manifest["devDependencies"]["@prometheus-ags/entity-graph-core"] = version
        content["package.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
        filename = output / f"prometheus-ags-entity-graph-{package}-{version}.tgz"
        with filename.open("wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", filename="", mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w") as archive:
                for path, data in sorted(content.items()):
                    member = tarfile.TarInfo("package/" + path)
                    member.size, member.mode, member.mtime = len(data), 0o644, 0
                    archive.addfile(member, io.BytesIO(data))
        packages.append({"name": name, "version": version, "tarball": str(filename),
                         "sha256": sha(filename.read_bytes()), "original_tarball": str(original),
                         "original_sha256": sha(original.read_bytes()),
                         "original_manifest": original_manifest, "staged_manifest": manifest,
                         "files": [{"path": path, "sha256": sha(data)} for path, data in sorted(content.items())]})
    write_json(output / "candidate.json", {
        "version": version, "source_revision": revision, "source_digest": source_digest,
        "source_bundle_sha256": sha((output / "source.tar.gz").read_bytes()),
        "packager_sha256": sha(Path(__file__).read_bytes()), "accepted_reviews": accepted,
        "packages": packages, "status": "Build-only",
        "scope": "Local candidate only; no publication or main-application adoption authorized",
    })
    print(json.dumps({"status": "Build-only", "version": version, "source_digest": source_digest,
                      "candidate": str(output / "candidate.json")}, indent=2))


if __name__ == "__main__":
    main()
