#!/usr/bin/env python3
"""Measure the RA11c mounted materializer inside isolated Chromium."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright
from pri_c015_browser_lifecycle import install_revoke_binding, run_lifecycle_page
ROOT = Path(__file__).resolve().parents[1]
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
RSS_LIMIT = 512 * 1024 * 1024
HEAP_LIMIT = 256 * 1024 * 1024

def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def wait_for_http(url: str, timeout_seconds: int) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            pass
        time.sleep(0.1)
    raise RuntimeError(f"timed out waiting for {url}")


def wait_for_devtools(profile: Path, timeout_seconds: int) -> str:
    active_port = profile / "DevToolsActivePort"
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if active_port.exists():
            lines = active_port.read_text().splitlines()
            if lines:
                return f"http://127.0.0.1:{lines[0]}"
        time.sleep(0.05)
    raise RuntimeError("Chromium did not publish its DevTools endpoint")


def process_snapshot(root_pid: int) -> dict[str, object]:
    process = subprocess.run(
        ["ps", "-axo", "pid=,ppid=,rss=,command="],
        text=True,
        capture_output=True,
        check=True,
    )
    rows: dict[int, tuple[int, int, str]] = {}
    for line in process.stdout.splitlines():
        parts = line.strip().split(None, 3)
        if len(parts) != 4:
            continue
        try:
            pid, parent, rss_kib = map(int, parts[:3])
        except ValueError:
            continue
        rows[pid] = (parent, rss_kib, parts[3])
    selected = {root_pid}
    changed = True
    while changed:
        changed = False
        for pid, (parent, _, _) in rows.items():
            if parent in selected and pid not in selected:
                selected.add(pid)
                changed = True
    entries = [
        {
            "pid": pid,
            "parentPid": rows[pid][0],
            "rssBytes": rows[pid][1] * 1024,
            "kind": "renderer" if "--type=renderer" in rows[pid][2]
            else "gpu" if "--type=gpu-process" in rows[pid][2]
            else "utility" if "--type=utility" in rows[pid][2]
            else "browser",
        }
        for pid in sorted(selected)
        if pid in rows
    ]
    return {
        "processCount": len(entries),
        "rssBytes": sum(int(entry["rssBytes"]) for entry in entries),
        "processes": entries,
    }


def stable_baseline(root_pid: int) -> tuple[list[int], dict[str, object]]:
    samples: list[int] = []
    snapshot = process_snapshot(root_pid)
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        snapshot = process_snapshot(root_pid)
        samples.append(int(snapshot["rssBytes"]))
        if len(samples) >= 5 and max(samples[-5:]) - min(samples[-5:]) <= 16 * 1024 * 1024:
            return samples, snapshot
        time.sleep(0.1)
    return samples, snapshot


def process_map(snapshot: dict[str, object]) -> dict[int, dict[str, object]]:
    return {
        int(entry["pid"]): entry
        for entry in snapshot["processes"]
        if isinstance(entry, dict)
    }


def terminate(process: subprocess.Popen[str] | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def run(args: argparse.Namespace) -> dict[str, object]:
    token = os.environ.get("RA11C_SESSION_TOKEN")
    gate_url = os.environ.get("RA11C_GATE_URL")
    lifecycle_raw = os.environ.get("RA11C_LIFECYCLE_CONFIG")
    if not token or not gate_url or not lifecycle_raw:
        raise RuntimeError(
            "RA11C_SESSION_TOKEN, RA11C_GATE_URL, and RA11C_LIFECYCLE_CONFIG are required"
        )
    lifecycle = json.loads(lifecycle_raw)
    if not CHROME.exists():
        raise RuntimeError(f"Chromium executable is missing: {CHROME}")

    vite_port = free_port()
    vite_env = os.environ.copy()
    vite_env["ASO_GATE_PROXY_TARGET"] = gate_url
    vite_env.update({
        "VITE_ASO_REPLICA_PERSISTENCE": "memory",
        "VITE_ASO_ENABLE_RA11C_MATERIALIZER": "experimental",
        "VITE_ASO_SHAPE_GATEWAY": f"http://127.0.0.1:{vite_port}",
    })
    vite_process: subprocess.Popen[str] | None = None
    chrome_process: subprocess.Popen[str] | None = None
    profile = Path(tempfile.mkdtemp(prefix="ra11c-chrome-"))
    try:
        vite_process = subprocess.Popen(
            [
                "pnpm", "--dir", "web", "exec", "vite",
                "--host", "127.0.0.1", "--port", str(vite_port), "--strictPort",
            ],
            cwd=ROOT,
            env=vite_env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        page_url = f"http://127.0.0.1:{vite_port}/ra11c-browser-memory.html"
        wait_for_http(page_url, 30)
        chrome_process = subprocess.Popen(
            [
                str(CHROME),
                "--headless=new",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-background-networking",
                "--disable-component-update",
                "--disable-default-apps",
                "--disable-extensions",
                "--disable-sync",
                "--enable-precise-memory-info",
                "--metrics-recording-only",
                "--remote-debugging-port=0",
                f"--user-data-dir={profile}",
                "about:blank",
            ],
            text=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        endpoint = wait_for_devtools(profile, 30)
        with sync_playwright() as playwright:
            browser = playwright.chromium.connect_over_cdp(endpoint)
            context = browser.contexts[0]
            page = context.pages[0] if context.pages else context.new_page()
            install_revoke_binding(
                context,
                os.environ.get("RA11C_KRATOS_ADMIN_URL", "http://127.0.0.1:4434"),
            )
            network_requests: list[dict[str, str]] = []
            page.on("request", lambda request: network_requests.append({
                "method": request.method,
                "resourceType": request.resource_type,
                "url": request.url,
            }))
            context.add_init_script(
                script=(
                    "window.__RA11C_CONFIG__ = "
                    + json.dumps({"sessionToken": token, **lifecycle})
                    + ";"
                )
            )
            page.goto(page_url, wait_until="networkidle", timeout=30_000)
            page.wait_for_function("window.__RA11C_READY__ === true", timeout=30_000)
            direct_access = page.evaluate("""async () => {
              const status = async (url) => {
                try {
                  const response = await fetch(url, {
                    signal: AbortSignal.timeout(3000),
                    credentials: 'omit',
                  });
                  return response.status;
                } catch { return null; }
              };
              return {
                electric: await status('http://127.0.0.1:3000/v1/shape?table=aso.cases&offset=-1'),
                fabric: await status('http://127.0.0.1:8080/healthz'),
              };
            }""")
            time.sleep(1)
            baseline_samples, baseline_tree = stable_baseline(chrome_process.pid)
            baseline_rss = int(baseline_tree["rssBytes"])
            baseline_processes = process_map(baseline_tree)
            process_peaks = {
                pid: int(entry["rssBytes"])
                for pid, entry in baseline_processes.items()
            }
            page.evaluate("() => { window.__RA11C_START__(); }")
            peak_tree = baseline_tree
            peak_rss = baseline_rss
            peak_stage = "baseline"
            stage_peaks: dict[str, int] = {"baseline": baseline_rss}
            stage_process_peaks: dict[str, dict[int, int]] = {
                "baseline": {
                    pid: int(entry["rssBytes"])
                    for pid, entry in baseline_processes.items()
                }
            }
            deadline = time.monotonic() + args.timeout_seconds
            while time.monotonic() < deadline:
                status = page.evaluate(
                    "() => ({stage: window.__RA11C_STAGE__, "
                    "done: window.__RA11C_RESULT__ !== undefined, "
                    "error: window.__RA11C_ERROR__})"
                )
                snapshot = process_snapshot(chrome_process.pid)
                for pid, entry in process_map(snapshot).items():
                    process_peaks[pid] = max(
                        process_peaks.get(pid, 0), int(entry["rssBytes"])
                    )
                rss = int(snapshot["rssBytes"])
                stage = str(status.get("stage") or "unknown")
                stage_peaks[stage] = max(stage_peaks.get(stage, 0), rss)
                process_stage = stage_process_peaks.setdefault(stage, {})
                for pid, entry in process_map(snapshot).items():
                    process_stage[pid] = max(
                        process_stage.get(pid, 0), int(entry["rssBytes"])
                    )
                if rss >= peak_rss:
                    peak_rss = rss
                    peak_tree = snapshot
                    peak_stage = stage
                if status.get("error"):
                    raise RuntimeError(str(status["error"]))
                if status.get("done"):
                    break
                time.sleep(0.02)
            else:
                raise RuntimeError(
                    "browser materializer exceeded the campaign timeout: " + str(status)
                )
            browser_result = page.evaluate("() => window.__RA11C_RESULT__")
            lifecycle_result = run_lifecycle_page(
                context,
                page,
                f"http://127.0.0.1:{vite_port}",
                lambda request: network_requests.append({
                    "method": request.method,
                    "resourceType": request.resource_type,
                    "url": request.url,
                }),
                min(args.timeout_seconds, 180),
            )
            browser_result["mountedLifecycle"] = lifecycle_result
            if lifecycle_result.get("result") != "Passed":
                browser_result["result"] = "Failed"
            browser.close()
        renderer_deltas = [
            {
                "pid": pid,
                "baselineRssBytes": int(entry["rssBytes"]),
                "peakRssBytes": process_peaks.get(pid, int(entry["rssBytes"])),
                "incrementalRssBytes": (
                    process_peaks.get(pid, int(entry["rssBytes"]))
                    - int(entry["rssBytes"])
                ),
            }
            for pid, entry in baseline_processes.items()
            if entry["kind"] == "renderer"
        ]
        if not renderer_deltas:
            raise RuntimeError("isolated Chromium reported no renderer process")
        target_renderer = max(
            renderer_deltas, key=lambda entry: int(entry["incrementalRssBytes"])
        )
        target_pid = int(target_renderer["pid"])
        target_stage_rss = {
            stage: processes[target_pid]
            for stage, processes in stage_process_peaks.items()
            if target_pid in processes
        }
        rss_delta = int(target_renderer["incrementalRssBytes"])
        aggregate_rss_delta = peak_rss - baseline_rss
        heap_delta = int(browser_result["heap"]["deltaBytes"])
        target_renderer_rss_within_budget = rss_delta <= RSS_LIMIT
        aggregate_rss_within_budget = aggregate_rss_delta <= RSS_LIMIT
        rss_within_budget = (
            target_renderer_rss_within_budget and aggregate_rss_within_budget
        )
        heap_within_budget = heap_delta <= HEAP_LIMIT
        shape_requests = [
            entry for entry in network_requests
            if urllib.parse.urlsplit(entry["url"]).path == "/v1/shape"
        ]
        generic_requests = [
            entry for entry in network_requests
            if any(marker in entry["url"] for marker in (
                "WatchEntityType", "watchEntityType", "watch_entity_type", "/watch"
            ))
        ]
        direct_isolation = direct_access == {"electric": None, "fabric": None}
        sole_shape_writer = bool(shape_requests) and not generic_requests
        live_interruption = browser_result.get("liveBodyInterruption", {})
        live_interruption_passed = (
            live_interruption.get("injected") is True
            and live_interruption.get("bytes", 0) > 0
            and live_interruption.get("upstreamStatus") == 200
        )
        passed = (
            browser_result.get("result") == "Passed"
            and rss_within_budget
            and heap_within_budget
            and direct_isolation
            and sole_shape_writer
            and live_interruption_passed
        )
        return {
            "result": "Passed" if passed else "Failed",
            "runtime": {
                "browser": subprocess.run(
                    [str(CHROME), "--version"],
                    text=True,
                    capture_output=True,
                    check=True,
                ).stdout.strip(),
                "executable": str(CHROME),
                "page": "/ra11c-browser-memory.html",
            },
            "measurement": {
                "rssMethod": "RSS growth of the isolated Chromium renderer with the greatest campaign-time growth, sampled from macOS ps",
                "heapMethod": "Chromium performance.memory.usedJSHeapSize with --enable-precise-memory-info",
                "baselineRssBytes": baseline_rss,
                "peakRssBytes": peak_rss,
                "incrementalRssBytes": rss_delta,
                "aggregateIncrementalRssBytes": aggregate_rss_delta,
                "incrementalHeapBytes": heap_delta,
                "rssLimitBytes": RSS_LIMIT,
                "heapLimitBytes": HEAP_LIMIT,
                "rssWithinBudget": rss_within_budget,
                "targetRendererRssWithinBudget": target_renderer_rss_within_budget,
                "aggregateRssWithinBudget": aggregate_rss_within_budget,
                "heapWithinBudget": heap_within_budget,
                "peakStage": peak_stage,
                "stagePeakRssBytes": stage_peaks,
                "baselineSamplesBytes": baseline_samples,
                "baselineProcessTree": baseline_tree,
                "peakProcessTree": peak_tree,
                "rendererDeltas": renderer_deltas,
                "targetRenderer": target_renderer,
                "targetRendererStageRssBytes": target_stage_rss,
            },
            "networkBoundary": {
                "directAccess": direct_access,
                "directIsolationPassed": direct_isolation,
                "liveBodyInterruption": live_interruption,
                "liveBodyInterruptionPassed": live_interruption_passed,
                "genericWriterRequests": generic_requests,
                "shapeRequestCount": len(shape_requests),
                "shapeRequests": shape_requests,
                "soleShapeWriterPassed": sole_shape_writer,
            },
            "browserCampaign": browser_result,
        }
    finally:
        terminate(chrome_process)
        terminate(vite_process)
        shutil.rmtree(profile, ignore_errors=True)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--output", type=Path, required=True)
    result.add_argument("--timeout-seconds", type=int, default=180)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        report = run(args)
    except Exception as error:
        report = {"result": "Failed", "failure": f"{type(error).__name__}: {error}"}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "result": report["result"]}, indent=2))
    return 0 if report["result"] == "Passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
