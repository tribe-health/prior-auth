#!/usr/bin/env python3
"""Record the synthetic web case-to-letter demo against the local Compose stack."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import time
import uuid
from pathlib import Path
from typing import Callable

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
CASE_ID = "10000000-0000-4000-8000-000000000005"
DEFAULT_OUTPUT = ROOT / ".runtime" / "web-case-to-letter-video-proof"


def load_demo_credentials() -> tuple[str, str]:
    values: dict[str, str] = {}
    env_file = ROOT / ".env"
    if env_file.exists():
        for raw in env_file.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key] = value.strip().strip('"').strip("'")
    email = os.environ.get("ASO_DEMO_EMAIL") or values.get("ASO_DEMO_EMAIL")
    password = os.environ.get("ASO_DEMO_PASSWORD") or values.get("ASO_DEMO_PASSWORD")
    if not email or not password:
        configured = subprocess.run(
            ["docker", "compose", "config", "--format", "json"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        services = json.loads(configured.stdout).get("services", {})
        environment = services.get("aso-demo-init", {}).get("environment", {})
        email = email or environment.get("ASO_DEMO_EMAIL")
        password = password or environment.get("ASO_DEMO_PASSWORD")
    if not email or not password:
        raise RuntimeError("ASO_DEMO_EMAIL and ASO_DEMO_PASSWORD are required")
    return email, password


def psql(sql: str) -> None:
    completed = subprocess.run(
        [
            "docker",
            "compose",
            "exec",
            "-T",
            "db",
            "psql",
            "-U",
            "flint",
            "-d",
            "flint",
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
        ],
        cwd=ROOT,
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"synthetic fixture setup failed: {completed.stderr.strip()}")


def prepare_initial_request() -> None:
    psql(
        f"""
        SET search_path=aso,public;
        UPDATE aso.cases SET status='drafting' WHERE id='{CASE_ID}';
        """
    )


def prepare_determination(reason: str, day_offset: int) -> None:
    determination_id = str(uuid.uuid4())
    safe_reason = reason.replace("'", "''")
    psql(
        f"""
        SET search_path=aso,public;
        INSERT INTO aso.determinations(
          id,case_id,outcome,decided_on,reason_code,reason_text,
          appeal_deadline,document_id,created_at
        )
        SELECT '{determination_id}','{CASE_ID}','denied',CURRENT_DATE+{day_offset},
          'medical-necessity','{safe_reason}',CURRENT_DATE+{day_offset + 30},
          determination.document_id,clock_timestamp()
        FROM aso.determinations determination
        WHERE determination.case_id='{CASE_ID}'
        ORDER BY determination.decided_on DESC,determination.created_at DESC,determination.id DESC
        LIMIT 1;
        """
    )


def pause(page: Page, milliseconds: int = 550) -> None:
    page.wait_for_timeout(milliseconds)


def sign_in(page: Page, base_url: str, email: str, password: str) -> None:
    page.goto(f"{base_url}/login", wait_until="domcontentloaded")
    start = page.get_by_role("link", name="Start sign-in")
    if start.count() and start.is_visible():
        start.click()
    page.locator('input[name="identifier"]').wait_for(state="visible", timeout=30_000)
    page.locator('input[name="identifier"]').fill(email)
    page.locator('input[name="password"]').fill(password)
    pause(page)
    page.get_by_role("button", name="Sign in").click()
    page.get_by_role("heading", name="Cases").wait_for(state="visible", timeout=30_000)
    pause(page, 900)


def generate_and_sign(page: Page) -> None:
    for attempt in range(2):
        generate = page.get_by_role("button", name="Generate cited draft")
        generate.wait_for(state="visible", timeout=30_000)
        if generate.is_disabled():
            raise RuntimeError("generation remained blocked after the browser loaded committed state")
        pause(page)
        generate.click()
        source_review = page.get_by_role("button", name="Confirm source review")
        retry = page.get_by_role("button", name="Review case for a new request")
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            if source_review.count() and source_review.is_visible():
                break
            if retry.count() and retry.is_visible():
                break
            page.wait_for_timeout(500)
        if source_review.count() and source_review.is_visible():
            break
        if attempt == 1:
            raise RuntimeError("document generation did not produce a saved cited draft")
        retry.click()
        pause(page, 900)
    source_review.click()
    approve = page.get_by_role("button", name="Approve current revision")
    approve.wait_for(state="visible", timeout=30_000)
    pause(page)
    approve.click()
    sign = page.get_by_role("button", name="Sign letter")
    sign.wait_for(state="visible", timeout=30_000)
    pause(page)
    sign.click()
    page.get_by_role("button", name="Signed").wait_for(state="visible", timeout=30_000)
    pause(page, 900)


def submit_and_acknowledge(page: Page, base_url: str, reference: str) -> None:
    page.goto(f"{base_url}/cases/{CASE_ID}/packet", wait_until="domcontentloaded")
    submit = page.get_by_role("button", name="Submit signed packet")
    submit.wait_for(state="visible", timeout=30_000)
    if submit.is_disabled():
        raise RuntimeError("the signed packet was not ready for submission")
    pause(page)
    submit.click()
    page.get_by_text("Packet sent. Payer acknowledgement is separate.").wait_for(
        state="visible", timeout=30_000
    )
    pause(page, 900)
    page.get_by_role("link", name="Track receipt and custody").click()
    reference_field = page.get_by_role("textbox", name="Payer reference")
    reference_field.wait_for(state="visible", timeout=30_000)
    reference_field.fill(reference)
    acknowledged = page.get_by_role("textbox", name="Acknowledged at")
    acknowledged.fill(dt.datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M"))
    pause(page)
    page.get_by_role("button", name="Record acknowledgement").click()
    page.get_by_text("Payer acknowledgement recorded.").wait_for(
        state="visible", timeout=30_000
    )
    page.get_by_text("Acknowledged in full").wait_for(state="visible", timeout=30_000)
    pause(page, 1_200)


def initial_request(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/cases/{CASE_ID}/letter", wait_until="domcontentloaded")
    page.get_by_role("heading", name="Generate the prior-authorization letter").wait_for(
        state="visible", timeout=30_000
    )
    generate_and_sign(page)
    submit_and_acknowledge(page, base_url, "DEMO-INITIAL-ACK")


def corrected_resubmission(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/cases/{CASE_ID}/denial-response", wait_until="domcontentloaded")
    choose = page.get_by_role("button", name="Correct and resubmit the request")
    choose.wait_for(state="visible", timeout=30_000)
    pause(page)
    choose.click()
    page.get_by_role("heading", name="Generate the corrected resubmission").wait_for(
        state="visible", timeout=30_000
    )
    generate_and_sign(page)
    submit_and_acknowledge(page, base_url, "DEMO-CORRECTED-ACK")


def clinical_appeal(page: Page, base_url: str) -> None:
    denial_url = f"{base_url}/cases/{CASE_ID}/denial-response"
    page.goto(denial_url, wait_until="domcontentloaded")
    choose = page.get_by_role("button", name="Prepare a clinical appeal")
    choose.wait_for(state="visible", timeout=30_000)
    pause(page)
    choose.click()
    page.get_by_text("Fresh surgeon affirmation required").wait_for(
        state="visible", timeout=30_000
    )
    pause(page)
    page.get_by_role("link", name="Open surgeon review").click()
    page.get_by_role("heading", name="Surgeon review").wait_for(state="visible", timeout=30_000)
    for name in (
        "Affirm controlling policy",
        "Affirm criterion section",
        "Affirm surgical pathway",
        "Affirm operative plan",
    ):
        button = page.get_by_role("button", name=name)
        button.wait_for(state="visible", timeout=30_000)
        pause(page, 450)
        button.click()
    page.get_by_text("4 of 4 affirmed for this case.").wait_for(state="visible", timeout=30_000)
    pause(page, 900)
    page.goto(denial_url, wait_until="domcontentloaded")
    page.get_by_role("heading", name="Generate the clinical appeal").wait_for(
        state="visible", timeout=30_000
    )
    generate_and_sign(page)
    submit_and_acknowledge(page, base_url, "DEMO-APPEAL-ACK")


def cucumber_feature(results: list[dict[str, object]]) -> list[dict[str, object]]:
    elements = []
    for result in results:
        status = "passed" if result["status"] == "Passed" else "failed"
        elements.append(
            {
                "id": f"web-case-to-letter;{result['slug']}",
                "keyword": "Scenario",
                "name": result["name"],
                "type": "scenario",
                "steps": [
                    {
                        "keyword": "When ",
                        "name": "the clinician completes the workflow in the browser",
                        "result": {
                            "status": status,
                            "duration": int(float(result["duration_seconds"]) * 1_000_000_000),
                            **(
                                {"error_message": result["error"]}
                                if result.get("error")
                                else {}
                            ),
                        },
                    }
                ],
            }
        )
    return [
        {
            "id": "web-case-to-letter",
            "keyword": "Feature",
            "name": "Web case-to-letter customer demo",
            "uri": "scripts/record-web-case-to-letter-demo.py",
            "elements": elements,
        }
    ]


def record_scenario(
    browser: Browser,
    output: Path,
    base_url: str,
    email: str,
    password: str,
    slug: str,
    name: str,
    action: Callable[[Page, str], None],
) -> dict[str, object]:
    raw = output / "videos" / "raw"
    shots = output / "screenshots"
    raw.mkdir(parents=True, exist_ok=True)
    shots.mkdir(parents=True, exist_ok=True)
    context: BrowserContext = browser.new_context(
        viewport={"width": 1440, "height": 900},
        record_video_dir=str(raw),
        record_video_size={"width": 1440, "height": 900},
        color_scheme="light",
    )
    page = context.new_page()
    video = page.video
    console_errors: list[str] = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    started = time.monotonic()
    status = "Passed"
    error: str | None = None
    try:
        sign_in(page, base_url, email, password)
        action(page, base_url)
        page.screenshot(path=str(shots / f"{slug}-complete.png"), full_page=True)
    except Exception as cause:  # noqa: BLE001 - evidence must preserve the browser failure
        status = "Failed"
        error = str(cause)
        page.screenshot(path=str(shots / f"{slug}-failed.png"), full_page=True)
    duration = time.monotonic() - started
    context.close()
    video_path = output / "videos" / f"{slug}.webm"
    if video is not None:
        video.save_as(str(video_path))
    return {
        "slug": slug,
        "name": name,
        "status": status,
        "duration_seconds": round(duration, 3),
        "video": str(video_path.relative_to(output)),
        "console_errors": console_errors,
        "error": error,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:5173")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    email, password = load_demo_credentials()
    results: list[dict[str, object]] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True, slow_mo=80)
        try:
            prepare_initial_request()
            results.append(
                record_scenario(
                    browser,
                    output,
                    args.base_url,
                    email,
                    password,
                    "01-initial-request",
                    "Initial request through payer acknowledgement",
                    initial_request,
                )
            )
            if results[-1]["status"] == "Passed":
                prepare_determination(
                    "Coverage denied because the submitted record requires a corrected request.",
                    40,
                )
                results.append(
                    record_scenario(
                        browser,
                        output,
                        args.base_url,
                        email,
                        password,
                        "02-corrected-resubmission",
                        "Corrected resubmission through payer acknowledgement",
                        corrected_resubmission,
                    )
                )
            if results[-1]["status"] == "Passed" and len(results) == 2:
                prepare_determination(
                    "Coverage denied after correction; the plan requests a surgeon-authored clinical appeal.",
                    41,
                )
                results.append(
                    record_scenario(
                        browser,
                        output,
                        args.base_url,
                        email,
                        password,
                        "03-clinical-appeal",
                        "Clinical appeal with fresh surgeon affirmation through payer acknowledgement",
                        clinical_appeal,
                    )
                )
        finally:
            browser.close()
    report = {
        "result": "Passed" if len(results) == 3 and all(item["status"] == "Passed" for item in results) else "Failed",
        "observed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "base_url": args.base_url,
        "case_id": CASE_ID,
        "scenarios": results,
    }
    (output / "run-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (output / "cucumber-report.json").write_text(
        json.dumps(cucumber_feature(results), indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2))
    return 0 if report["result"] == "Passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
