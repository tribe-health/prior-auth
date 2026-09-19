"""Reject query-cache ownership in direct declarations and the pnpm lock graph."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys


FIELDS = ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies")
FORBIDDEN = re.compile(r"^(swr|react-query|@tanstack/[^/]*query[^/]*|@apollo/client|apollo-client|apollo-cache-inmemory)$")


def package_name(name):
    # pnpm reports the actual name in `from`; manifests may use npm aliases.
    value = name.removeprefix("npm:")
    if value.startswith("@"):
        return "@" + value[1:].split("@", 1)[0]
    return value.split("@", 1)[0]


def inspect(node, chain, violations):
    for field in FIELDS:
        for alias, dependency in node.get(field, {}).items():
            if not isinstance(dependency, dict):
                raise ValueError(f"Invalid resolved dependency: {alias}")
            actual = package_name(dependency.get("from", alias))
            path = chain + [f"{actual}@{dependency.get('version', '?')}"]
            if FORBIDDEN.fullmatch(actual) or FORBIDDEN.fullmatch(alias):
                violations.add(" -> ".join(path))
            inspect(dependency, path, violations)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parent.parent / "web")
    project = parser.parse_args().project.resolve()
    manifest = json.loads((project / "package.json").read_text())
    if not (project / "pnpm-lock.yaml").is_file():
        raise ValueError("pnpm-lock.yaml is required to verify transitive dependencies")
    violations = set()
    for field in FIELDS:
        for name, specifier in manifest.get(field, {}).items():
            actual = package_name(specifier) if specifier.startswith("npm:") else name
            if FORBIDDEN.fullmatch(name) or FORBIDDEN.fullmatch(actual):
                violations.add(f"manifest {field}: {name} ({specifier})")
    result = subprocess.run(
        ["pnpm", "--dir", str(project), "list", "--depth", "Infinity", "--json", "--lockfile-only"],
        check=True, capture_output=True, text=True,
    )
    projects = json.loads(result.stdout)
    if not isinstance(projects, list) or len(projects) != 1 or Path(projects[0]["path"]).resolve() != project:
        raise ValueError("pnpm did not return the requested project dependency graph")
    inspect(projects[0], [manifest.get("name", project.name)], violations)
    if violations:
        print("query-cache audit: Failed", file=sys.stderr)
        for path in sorted(violations):
            print(f"  {path}", file=sys.stderr)
        return 1
    print("query-cache audit: Passed (manifest and transitive pnpm lock graph)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        print(f"query-cache audit: Failed ({error})", file=sys.stderr)
        sys.exit(1)
