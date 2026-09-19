#!/usr/bin/env python3
"""RA05 T1: prove clients reach Gate and cannot bypass it to FRF or Electric."""

import argparse
import datetime
import json
from pathlib import Path
import shutil
import subprocess
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-05-authorized-shape-facade/task-4-topology.json"
)
STACK = ROOT / "scripts/ra05-stack.sh"


def command(*args, check=True):
    return subprocess.run(
        [str(args[0]), *args[1:]],
        cwd=ROOT,
        check=check,
        capture_output=True,
        text=True,
    )


class TopologyProbe:
    def __init__(self, output):
        self.output = output
        try:
            output_label = output.resolve().relative_to(ROOT).as_posix()
        except ValueError:
            output_label = str(output)
        self.report = {
            "result": "Failed",
            "verification_tier": 1,
            "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": "RA05 client segment, Gate, FRF facade, Electric backend, and loopback diagnostic",
            "command": (
                "python3 scripts/test-authorized-shape-topology.py --output "
                + output_label
            ),
            "checks": {},
            "prerequisites": {},
            "certification": {},
        }

    def check(self, name, condition, **details):
        self.report["checks"][name] = {
            "result": "Passed" if condition else "Failed",
            **details,
        }
        if not condition:
            raise AssertionError(name)

    def compose_model(self):
        resolved = command(
            STACK,
            "--profile",
            "ra05-topology",
            "config",
            "--format",
            "json",
        )
        return json.loads(resolved.stdout)

    def container_networks(self, container):
        inspected = command(
            "docker",
            "inspect",
            container,
            "--format",
            "{{json .NetworkSettings.Networks}}",
        )
        return sorted(json.loads(inspected.stdout))

    def container_state(self, container):
        inspected = command(
            "docker",
            "inspect",
            container,
            "--format",
            "{{json .State}}",
        )
        return json.loads(inspected.stdout)

    def client_curl(self, url):
        return command(
            STACK,
            "--profile",
            "ra05-topology",
            "run",
            "--rm",
            "--no-deps",
            "topology-probe",
            "--fail",
            "--silent",
            "--show-error",
            "--connect-timeout",
            "2",
            "--max-time",
            "5",
            url,
            check=False,
        )

    def client_status(self, url):
        return command(
            STACK,
            "--profile",
            "ra05-topology",
            "run",
            "--rm",
            "--no-deps",
            "topology-probe",
            "--silent",
            "--show-error",
            "--output",
            "/dev/null",
            "--write-out",
            "%{http_code}",
            "--connect-timeout",
            "2",
            "--max-time",
            "5",
            url,
            check=False,
        )

    def run_checks(self):
        model = self.compose_model()
        services = model["services"]
        electric_state = self.container_state("aso-prior-auth-electric-1")
        gate_state = self.container_state("aso-prior-auth-flint-gate-1")
        facade_state = self.container_state("aso-prior-auth-realtime-fabric-1")
        self.report["prerequisites"] = {
            "docker_cli": {"available": shutil.which("docker") is not None},
            "stack_script": {"available": STACK.is_file()},
            "resolved_compose_model": {"available": bool(services)},
            "topology_probe_image": {
                "available": bool(services.get("topology-probe", {}).get("image")),
                "image": services.get("topology-probe", {}).get("image"),
            },
            "electric_container": {
                "running": electric_state.get("Running") is True,
                "health": electric_state.get("Health", {}).get("Status"),
            },
            "gate_container": {
                "running": gate_state.get("Running") is True,
            },
            "frf_container": {
                "running": facade_state.get("Running") is True,
                "health": facade_state.get("Health", {}).get("Status"),
            },
        }
        self.check(
            "required_topology_prerequisites_are_available",
            shutil.which("docker") is not None
            and STACK.is_file()
            and bool(services)
            and bool(services.get("topology-probe", {}).get("image"))
            and electric_state.get("Running") is True
            and electric_state.get("Health", {}).get("Status") == "healthy"
            and gate_state.get("Running") is True
            and facade_state.get("Running") is True
            and facade_state.get("Health", {}).get("Status") == "healthy",
            electric_health=electric_state.get("Health", {}).get("Status"),
            frf_health=facade_state.get("Health", {}).get("Status"),
            topology_probe_image=services.get("topology-probe", {}).get("image"),
        )
        electric_networks = sorted(services["electric"]["networks"])
        gate_networks = sorted(services["flint-gate"]["networks"])
        facade_networks = sorted(services["realtime-fabric"]["networks"])
        client_networks = sorted(services["topology-probe"]["networks"])
        aliases = services["flint-gate"]["networks"]["ra05-client"].get(
            "aliases", []
        )
        self.check(
            "resolved_topology_requires_gate_before_frf_and_electric",
            electric_networks == ["ra05-backend"]
            and gate_networks == ["ra05-backend", "ra05-client"]
            and facade_networks == ["ra05-backend"]
            and client_networks == ["ra05-client"]
            and "shape-gateway" in aliases
            and model["networks"]["ra05-client"].get("internal") is True,
            electric_networks=electric_networks,
            gate_networks=gate_networks,
            facade_networks=facade_networks,
            client_networks=client_networks,
            client_network_internal=model["networks"]["ra05-client"].get(
                "internal"
            ),
        )

        electric_ports = services["electric"].get("ports", [])
        facade_ports = services["realtime-fabric"].get("ports", [])
        self.check(
            "electric_and_facade_have_no_host_ports",
            facade_ports == [] and electric_ports == [],
            facade_host_ports=len(facade_ports),
            electric_host_ports=len(electric_ports),
        )

        live_electric_networks = self.container_networks(
            "aso-prior-auth-electric-1"
        )
        live_gate_networks = self.container_networks("aso-prior-auth-flint-gate-1")
        live_facade_networks = self.container_networks(
            "aso-prior-auth-realtime-fabric-1"
        )
        self.check(
            "running_containers_match_resolved_network_membership",
            any(name.endswith("_ra05-backend") for name in live_electric_networks)
            and not any(
                name.endswith("_ra05-client") for name in live_electric_networks
            )
            and any(name.endswith("_ra05-backend") for name in live_gate_networks)
            and any(name.endswith("_ra05-client") for name in live_gate_networks)
            and any(name.endswith("_ra05-backend") for name in live_facade_networks)
            and not any(name.endswith("_ra05-client") for name in live_facade_networks),
            electric_networks=live_electric_networks,
            gate_networks=live_gate_networks,
            facade_networks=live_facade_networks,
        )

        gateway = self.client_status("http://shape-gateway:4456/v1/shape")
        self.check(
            "client_segment_reaches_gate_and_is_challenged_for_a_session",
            gateway.returncode == 0 and gateway.stdout == "401",
            exit_code=gateway.returncode,
            status=gateway.stdout,
        )

        direct_facade = self.client_curl("http://realtime-fabric:8080/healthz")
        self.check(
            "client_segment_cannot_resolve_or_reach_frf_directly",
            direct_facade.returncode != 0,
            exit_code=direct_facade.returncode,
        )

        direct_service = self.client_curl(
            "http://electric:3000/v1/shape?table=aso.evidence_states&offset=-1"
        )
        self.check(
            "client_segment_cannot_resolve_or_reach_electric",
            direct_service.returncode != 0,
            exit_code=direct_service.returncode,
        )

        direct_host = self.client_curl(
            "http://host.docker.internal:3000/v1/shape?table=aso.evidence_states&offset=-1"
        )
        self.check(
            "client_segment_cannot_reach_the_operator_loopback_diagnostic",
            direct_host.returncode != 0,
            exit_code=direct_host.returncode,
        )

        request = urllib.request.Request(
            "http://127.0.0.1:3000/v1/shape?table=aso.evidence_states&offset=-1"
        )
        diagnostic_error = None
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                diagnostic_status = response.status
                response.read()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
            diagnostic_status = None
            diagnostic_error = type(error).__name__
        self.check(
            "host_browser_position_cannot_reach_electric_directly",
            diagnostic_status is None,
            status=diagnostic_status,
            error=diagnostic_error,
            host="127.0.0.1",
        )
        self.report["certification"] = {
            "scope": "bounded-local-compose-client-segment",
            "client_to_gate_status": gateway.stdout,
            "client_to_frf_exit": direct_facade.returncode,
            "client_to_electric_exit": direct_service.returncode,
            "client_to_operator_diagnostic_exit": direct_host.returncode,
            "operator_to_diagnostic_status": diagnostic_status,
            "electric_on_client_network": False,
            "frf_on_client_network": False,
            "facade_host_port_count": len(facade_ports),
            "electric_host_port_count": len(electric_ports),
        }

    def run(self):
        failure = None
        try:
            self.run_checks()
            self.report["result"] = "Passed"
        except Exception as error:
            failure = error
            self.report["failure"] = type(error).__name__ + ": " + str(error)
        self.output.parent.mkdir(parents=True, exist_ok=True)
        self.output.write_text(json.dumps(self.report, indent=2) + "\n")
        print(
            json.dumps(
                {
                    "result": self.report["result"],
                    "checks": len(self.report["checks"]),
                },
                indent=2,
            )
        )
        return 1 if failure is not None else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    return TopologyProbe(args.output).run()


if __name__ == "__main__":
    raise SystemExit(main())
