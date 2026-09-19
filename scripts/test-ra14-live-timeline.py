#!/usr/bin/env python3
"""RA14 local browser campaign for the authorized live evidence timeline.

Run only after the RA14 implementation tasks are complete:

    RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-ra14-live-timeline.py

The campaign reuses the established RA05 disposable fixture and its real
Kratos, Gate, FRF, Electric and Postgres services. It adds a Vite browser,
PGlite, the committed PEM graph and two React subscribers. Every identity,
practice, case and clinical row is synthetic and removed during cleanup.
"""

import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import urllib.error
import urllib.parse
import uuid

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
TRANSITION_PROBE = ROOT / "scripts/test-authorized-shape-transition.py"
EVIDENCE = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/evidence/"
    "ra-14-live-evidence-timeline"
)
DEFAULT_OUTPUT = EVIDENCE / "task-4-browser-campaign.json"
DEFAULT_SCREENSHOTS = EVIDENCE / "browser"
APP_HOST = "localhost"
EXPECTED_COLUMNS = {
    "cases": {
        "id", "practice_id", "case_number", "patient_id", "surgeon_id",
        "coordinator_id", "payer_id", "status", "date_of_service",
        "gate_affirmed_at", "updated_at", "revision",
    },
    "case_evidence": {
        "id", "practice_id", "case_id", "policy_criterion_id", "state",
        "assessed_at", "created_at", "updated_at",
    },
    "evidence_states": {"key", "label", "meaning"},
    "evidence_citations": {
        "id", "practice_id", "case_evidence_id", "document_id", "page_number",
        "relevance", "created_at",
    },
    "document_statuses": {
        "id", "case_id", "document_type_id", "name", "effective_date",
        "content_sha256_text", "page_count", "processing_status",
        "processing_error_code", "updated_at", "revision",
    },
}
EXCLUDED_COLUMNS = {
    "rationale", "quote", "author_name", "author_npi",
    "storage_uri", "data",
}


def load_transition_probe():
    spec = importlib.util.spec_from_file_location(
        "ra14_authorized_shape_transition", TRANSITION_PROBE
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the RA05 transition probe")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


transition = load_transition_probe()


class BrowserTimelineProbe(transition.TransitionProbe):
    def __init__(self, args):
        super().__init__(args)
        self.credentials = {}
        self.vite = None
        self.vite_log = None
        self.playwright = None
        self.browser: Browser | None = None
        self.context: BrowserContext | None = None
        self.pages: list[Page] = []
        self.network = []
        self.shape_cursors = {}
        self.fixture.update(
            {
                "evidence": str(uuid.uuid4()),
                "citation": str(uuid.uuid4()),
                "document": str(uuid.uuid4()),
            }
        )
        self.document_name = "Synthetic RA14 MRI evidence"
        self.report.update(
            {
                "result": "Failed",
                "verification_tier": 1,
                "observed_at": datetime.datetime.now(
                    datetime.timezone.utc
                ).isoformat(),
                "scope": (
                    "Synthetic Postgres through Gate, FRF, Electric, PGlite, "
                    "committed PEM graph and two real Chromium subscribers"
                ),
                "command": (
                    "RUSTUP_TOOLCHAIN=1.97.1 python3 "
                    "scripts/test-ra14-live-timeline.py"
                ),
                "checks": {},
                "cleanup": {},
                "network": [],
                "session_network": [],
                "browser_errors": [],
                "screenshots": [],
                "unverified": [
                    "The materializer remains an experimental qualification path because "
                    "the recorded RA11c memory threshold blocks production adoption.",
                    "Chromium automation is browser evidence, not a physical mobile device "
                    "or Tauri-window certification.",
                    "Evidence deletion has no clinical product command; the synthetic fixture "
                    "uses its owned Postgres cleanup path to exercise replica deletion.",
                ],
            }
        )

    def create_identity_session(self, label):
        email = f"ra14-{label}-{uuid.uuid4()}@example.invalid"
        password = secrets.token_urlsafe(36) + "Aa1!"
        status, _, identity = self.json_http(
            transition.composition.KRATOS_ADMIN + "/admin/identities",
            "POST",
            {
                "schema_id": "clinician",
                "state": "active",
                "traits": {
                    "email": email,
                    "name": {"first": "Synthetic", "last": "RA14 Probe"},
                },
                "credentials": {"password": {"config": {"password": password}}},
            },
        )
        self.check(f"{label}_identity_created", status == 201, status=status)
        identity_id = identity["id"]
        self.identities.append(identity_id)

        status, _, flow = self.json_http(
            transition.composition.KRATOS_PUBLIC + "/self-service/login/api"
        )
        self.check(f"{label}_login_flow_created", status == 200, status=status)
        status, _, login = self.json_http(
            self.public_action(flow["ui"]["action"]),
            "POST",
            {"method": "password", "identifier": email, "password": password},
        )
        self.check(f"{label}_api_login_completed", status == 200, status=status)
        token = login["session_token"]
        status, _, session = self.json_http(
            transition.composition.KRATOS_PUBLIC + "/sessions/whoami",
            headers={"Authorization": "Bearer " + token},
        )
        self.check(
            f"{label}_session_is_authoritative",
            status == 200 and session["identity"]["id"] == identity_id,
            status=status,
            identity_match=session.get("identity", {}).get("id") == identity_id,
        )
        self.sessions[identity_id] = {"id": session["id"], "token": token}
        self.practices[identity_id] = str(uuid.uuid4())
        self.credentials[identity_id] = {"email": email, "password": password}
        return identity_id

    def seed_timeline(self):
        criterion = self.sql(
            "SELECT id FROM aso.policy_criteria ORDER BY id LIMIT 1;"
        )
        document_type = self.sql(
            "SELECT id FROM aso.document_types WHERE key='mri-report';"
        )
        if not criterion or not document_type:
            raise RuntimeError("seeded policy criterion and document type are required")
        f = self.fixture
        practice = self.practices[self.identity_a]
        seeded = self.sql(
            f"""
            BEGIN;
            SET LOCAL search_path=aso,public;
            INSERT INTO aso.documents(
              id, document_type_id, patient_id, case_id, name,
              effective_date, page_count, ingest_method, data
            ) VALUES (
              '{f['document']}', '{document_type}', '{f['patient_a']}',
              '{f['case_a']}', '{self.document_name}', DATE '2026-01-15', 2,
              'manual_upload',
              '{{"modality":"MRI","body_region":"spine","impression":"synthetic"}}'::jsonb
            );
            INSERT INTO aso.case_evidence(
              id, case_id, policy_criterion_id, state, assessed_by, assessed_at
            ) VALUES (
              '{f['evidence']}', '{f['case_a']}', '{criterion}', 'met',
              '{f['user_a']}', TIMESTAMPTZ '2026-01-16T12:00:00Z'
            );
            INSERT INTO aso.evidence_citations(
              id, case_evidence_id, document_id, page_number, relevance
            ) VALUES (
              '{f['citation']}', '{f['evidence']}', '{f['document']}', 1, 'supports'
            );
            COMMIT;
            SELECT count(*) FROM aso.case_evidence
             WHERE id='{f['evidence']}' AND practice_id='{practice}';
            """
        )
        self.check(
            "synthetic_timeline_fixture_is_scoped_to_identity_a",
            seeded.splitlines()[-1] == "1",
            row_count=int(seeded.splitlines()[-1]),
        )

    def start_vite(self):
        if self.args.vite_port != 5173:
            raise RuntimeError(
                "Kratos local return URLs are pinned to localhost:5173; "
                "the RA14 browser fixture must use that port"
            )
        env = os.environ.copy()
        env.update(
            {
                "ASO_KRATOS_PROXY_TARGET": transition.composition.KRATOS_PUBLIC,
                "ASO_API_PROXY_TARGET": f"http://127.0.0.1:{self.args.aso_port}",
                "ASO_GATE_PROXY_TARGET": transition.composition.GATE,
                "VITE_ASO_SHAPE_GATEWAY": "/",
                "VITE_ASO_ENABLE_RA11C_MATERIALIZER": "experimental",
                "VITE_ASO_REPLICA_PERSISTENCE": "memory",
                "VITE_ASO_DEPLOYMENT_ID": "ra14-browser-campaign",
            }
        )
        log_path = ROOT / ".runtime/ra14-vite.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        self.vite_log = log_path.open("w")
        self.vite = subprocess.Popen(
            [
                str(ROOT / "web/node_modules/.bin/vite"), "--host", APP_HOST,
                "--port", str(self.args.vite_port), "--strictPort",
            ],
            cwd=ROOT / "web",
            env=env,
            stdout=self.vite_log,
            stderr=subprocess.STDOUT,
        )
        url = self.application_url + "/login"
        for _ in range(300):
            if self.vite.poll() is not None:
                break
            try:
                status, _, _ = self.http(url, timeout=1)
                if status == 200:
                    return
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(0.1)
        raise RuntimeError("Vite browser server did not become ready")

    @property
    def application_url(self):
        return f"http://{APP_HOST}:{self.args.vite_port}"

    def observe_response(self, response):
        parsed = urllib.parse.urlsplit(response.url)
        if parsed.path == "/api/session":
            self.report["session_network"].append(
                {"method": response.request.method, "status": response.status}
            )
        if parsed.path != "/v1/shape":
            return
        query = urllib.parse.parse_qs(parsed.query)
        observation = {
            "shape": (query.get("shape") or [None])[0],
            "request_parameters": sorted(query),
            "status": response.status,
            "handle_present": bool(response.headers.get("electric-handle")),
            "offset_present": response.headers.get("electric-offset") is not None,
            "row_column_sets": [],
            "operations": [],
            "reference_state_keys": [],
        }
        handle = response.headers.get("electric-handle")
        offset = response.headers.get("electric-offset")
        shape = observation["shape"]
        if isinstance(shape, str) and handle and offset is not None:
            self.shape_cursors.setdefault(shape, (handle, offset))
        try:
            body = response.json()
        except Exception:
            body = None
        if isinstance(body, list):
            for message in body:
                if not isinstance(message, dict):
                    continue
                headers = message.get("headers")
                value = message.get("value")
                if isinstance(headers, dict) and isinstance(headers.get("operation"), str):
                    observation["operations"].append(headers["operation"])
                if isinstance(value, dict):
                    observation["row_column_sets"].append(sorted(value))
                    if observation["shape"] == "evidence_states":
                        key = value.get("key")
                        if isinstance(key, str):
                            observation["reference_state_keys"].append(key)
        observation["operations"] = sorted(set(observation["operations"]))
        observation["reference_state_keys"] = sorted(
            set(observation["reference_state_keys"])
        )
        self.network.append(observation)

    def start_browser(self):
        self.args.screenshot_dir.mkdir(parents=True, exist_ok=True)
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(
            channel="chrome", headless=self.args.headless
        )
        self.context = self.new_browser_context()
        return self.new_page()

    def new_browser_context(self):
        assert self.browser is not None
        context = self.browser.new_context(
            viewport={"width": 1200, "height": 900},
            reduced_motion="reduce",
        )
        context.add_init_script(
            """
            window.__ra14ViewTransitionCalls = 0;
            if (document.startViewTransition) {
              const original = document.startViewTransition.bind(document);
              document.startViewTransition = (...args) => {
                window.__ra14ViewTransitionCalls += 1;
                return original(...args);
              };
            }
            """
        )
        return context

    def new_page(self):
        assert self.context is not None
        page = self.context.new_page()
        page.on("response", self.observe_response)
        page.on(
            "pageerror",
            lambda error: self.report["browser_errors"].append(str(error)),
        )
        self.pages.append(page)
        return page

    def screenshot(self, page, name, *, full_page=True):
        path = self.args.screenshot_dir / f"{name}.png"
        page.screenshot(path=str(path), full_page=full_page)
        self.report["screenshots"].append(str(path.relative_to(ROOT)))

    def login(self, page, identity_id):
        credential = self.credentials[identity_id]
        page.goto(self.application_url + "/login", wait_until="domcontentloaded")
        page.get_by_role("heading", name="Sign in").wait_for()
        page.get_by_role("link", name="Start sign-in").click()
        page.locator('input[name="identifier"]').wait_for()
        page.locator('input[name="identifier"]').fill(credential["email"])
        page.locator('input[name="password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        page.wait_for_url(self.application_url + "/", wait_until="domcontentloaded")

    def open_timeline(self, page, *, expect_document=True):
        page.goto(
            self.application_url + f"/cases/{self.fixture['case_a']}/evidence",
            wait_until="domcontentloaded",
        )
        try:
            page.get_by_role("heading", name="Evidence timeline").wait_for(
                timeout=self.args.browser_timeout_ms
            )
        except Exception:
            self.report["last_browser_state"] = {
                "url": page.url,
                "body": page.locator("body").inner_text()[:2000],
            }
            self.screenshot(page, "failure-timeline")
            raise
        if expect_document:
            page.get_by_text(self.document_name, exact=False).wait_for(
                timeout=self.args.browser_timeout_ms
            )
        else:
            page.get_by_text("No evidence has been recorded for this case.").wait_for(
                timeout=self.args.browser_timeout_ms
            )

    def denied_shape(self, query):
        assert self.context is not None
        response = self.context.request.get(
            self.application_url + "/v1/shape?" + urllib.parse.urlencode(query)
        )
        return {
            "status": response.status,
            "shape_headers_absent": not any(
                name.lower().startswith("electric-") for name in response.headers
            ),
            "body_byte_count": len(response.body()),
        }

    def assert_initial_network_boundary(self):
        initial_sets = {shape: [] for shape in EXPECTED_COLUMNS}
        references = set()
        for observation in self.network:
            shape = observation["shape"]
            if shape not in initial_sets:
                continue
            initial_sets[shape].extend(observation["row_column_sets"])
            references.update(observation["reference_state_keys"])
        observed = {
            shape: sorted({column for columns in sets for column in columns})
            for shape, sets in initial_sets.items()
        }
        expected = {shape: sorted(columns) for shape, columns in EXPECTED_COLUMNS.items()}
        self.check(
            "initial_browser_payload_uses_only_approved_columns",
            observed == expected
            and not EXCLUDED_COLUMNS.intersection(
                column for columns in observed.values() for column in columns
            ),
            observed=observed,
            expected=expected,
        )
        self.check(
            "browser_preserves_three_reference_state_identities",
            references == {"met", "gap", "void"},
            observed=sorted(references),
        )

    def exercise(self):
        status, _, version = self.json_http(
            transition.composition.KRATOS_ADMIN + "/version"
        )
        self.check(
            "kratos_version_is_pinned",
            status == 200 and version.get("version") == "v26.2.0",
            status=status,
            version=version.get("version"),
        )
        status, _, jwks = self.json_http(
            transition.composition.GATE + "/.well-known/jwks.json"
        )
        self.check(
            "gate_signing_key_is_available",
            status == 200 and len(jwks.get("keys", [])) == 1,
            status=status,
            key_count=len(jwks.get("keys", [])),
        )

        self.identity_a = self.create_identity_session("browser-a")
        self.identity_b = self.create_identity_session("browser-b")
        self.seed_fixture(self.identity_a, self.identity_b)
        self.start_vite()
        first = self.start_browser()

        first.goto(self.application_url + "/login", wait_until="domcontentloaded")
        first.get_by_role("heading", name="Sign in").wait_for()
        self.check(
            "logged_out_start_keeps_public_account_access_usable",
            first.get_by_role("link", name="Start sign-in").is_visible(),
        )
        self.screenshot(first, "01-logged-out")

        self.login(first, self.identity_a)
        self.open_timeline(first, expect_document=False)
        second = self.new_page()
        self.open_timeline(second, expect_document=False)
        self.seed_timeline()
        first.get_by_text(self.document_name, exact=False).wait_for(
            timeout=self.args.browser_timeout_ms
        )
        second.get_by_text(self.document_name, exact=False).wait_for(
            timeout=self.args.browser_timeout_ms
        )
        self.check(
            "two_mounted_browser_subscribers_render_the_live_insert",
            first.get_by_text(self.document_name, exact=False).is_visible()
            and second.get_by_text(self.document_name, exact=False).is_visible(),
        )
        first.wait_for_timeout(250)
        self.assert_initial_network_boundary()
        initial_case_response = self.shape_cursors.get("cases")
        self.check(
            "shape_continuation_metadata_was_observed",
            initial_case_response is not None,
        )
        if initial_case_response is None:
            raise AssertionError("cases shape cursor unavailable")
        self.screenshot(first, "02-desktop-met")

        wrong_practice = self.denied_shape(
            {"shape": "cases", "practiceId": self.practices[self.identity_b]}
        )
        broadened = self.denied_shape(
            {"shape": "case_evidence", "columns": "id,rationale"}
        )
        self.check(
            "wrong_practice_shape_request_is_private",
            wrong_practice["status"] in (400, 403)
            and wrong_practice["shape_headers_absent"],
            **wrong_practice,
        )
        self.check(
            "broadened_column_shape_request_is_private",
            broadened["status"] in (400, 403)
            and broadened["shape_headers_absent"],
            **broadened,
        )

        first.get_by_role("button", name="Reassess evidence").click()
        first.get_by_label("Not met").check()
        first.get_by_role("button", name="Save assessment").click()
        first_gap = first.locator(
            'section[aria-labelledby="evidence-timeline-heading"] > ul > li'
        ).filter(has_text=self.document_name).locator('[data-evidence-state="gap"]')
        second_gap = second.locator(
            'section[aria-labelledby="evidence-timeline-heading"] > ul > li'
        ).filter(has_text=self.document_name).locator('[data-evidence-state="gap"]')
        first_gap.wait_for(
            timeout=self.args.browser_timeout_ms
        )
        second_gap.wait_for(
            timeout=self.args.browser_timeout_ms
        )
        self.check(
            "authorized_reassessment_updates_both_graph_subscribers",
            first_gap.is_visible() and second_gap.is_visible(),
        )

        first.get_by_role("button", name="Not met").first.click()
        first.set_viewport_size({"width": 320, "height": 780})
        first.wait_for_timeout(100)
        first.mouse.move(310, 700)
        first.mouse.wheel(1000, 0)
        first.wait_for_timeout(50)
        layout_widths = first.evaluate(
            "() => { const pipeline = document.querySelector('[aria-label=\"Case pipeline\"]'); "
            "const main = document.querySelector('main'); "
            "if (!(pipeline instanceof HTMLElement) || !(main instanceof HTMLElement)) "
            "throw new Error('responsive shell region missing'); "
            "const pageScrollLeft = window.scrollX; "
            "pipeline.scrollLeft = 100; const pipelineScrollLeft = pipeline.scrollLeft; "
            "const result = { viewport: window.innerWidth, body: document.body.scrollWidth, "
            "pageScrollLeft, mainScrollLeft: main.scrollLeft, "
            "pipelineClientWidth: pipeline.clientWidth, "
            "pipelineScrollWidth: pipeline.scrollWidth, pipelineScrollLeft }; "
            "pipeline.scrollLeft = 0; return result; }"
        )
        self.check(
            "mobile_resize_contains_horizontal_scrolling_inside_the_shell",
            layout_widths["body"] <= layout_widths["viewport"]
            and layout_widths["pageScrollLeft"] == 0
            and layout_widths["mainScrollLeft"] == 0
            and layout_widths["pipelineClientWidth"] <= layout_widths["viewport"]
            and layout_widths["pipelineScrollWidth"]
            > layout_widths["pipelineClientWidth"]
            and layout_widths["pipelineScrollLeft"] > 0,
            **layout_widths,
        )
        citation_box = first.get_by_text(
            self.document_name, exact=False
        ).last.bounding_box()
        self.check(
            "mobile_citation_wraps_inside_the_viewport",
            citation_box is not None
            and citation_box["x"] >= 0
            and citation_box["x"] + citation_box["width"] <= 321,
            box=citation_box,
            viewport_width=320,
        )
        active_filter = first.get_by_role(
            "group", name="Filter by evidence state"
        ).locator('button[aria-pressed="true"]')
        try:
            active_filter.wait_for(timeout=self.args.browser_timeout_ms)
        except Exception:
            self.report["last_browser_state"] = {
                "url": first.url,
                "body": first.locator("body").inner_text()[:2000],
            }
            self.screenshot(first, "failure-filter-after-resize", full_page=False)
            raise
        self.check(
            "ordinary_resize_preserves_per_view_filter_state",
            active_filter.text_content().strip() == "Not met",
            width=320,
            active_filter=active_filter.text_content().strip(),
        )
        transition_style = first.get_by_role(
            "button", name="Reassess evidence"
        ).evaluate(
            "node => ({ property: getComputedStyle(node).transitionProperty, "
            "duration: getComputedStyle(node).transitionDuration })"
        )
        self.check(
            "reduced_motion_disables_evidence_action_transition",
            transition_style["property"] == "none"
            or set(transition_style["duration"].split(", ")) <= {"0s", "0ms"},
            **transition_style,
        )
        first.get_by_role("button", name="Not met").first.click()
        self.screenshot(first, "03-mobile-gap", full_page=False)

        first.goto(
            self.application_url + f"/cases/{self.fixture['case_a']}/letter",
            wait_until="domcontentloaded",
        )
        first.get_by_role("heading", name="Letter & QA").wait_for(
            timeout=self.args.browser_timeout_ms
        )
        removal = self.remove_affirmation(self.identity_a)
        first.get_by_role("alert").filter(
            has_text="Awaiting surgeon affirmation"
        ).wait_for(timeout=self.args.browser_timeout_ms)
        self.check(
            "remote_gate_revocation_unmounts_the_active_gated_route",
            first.get_by_role("heading", name="Letter & QA").count() == 0
            and removal["read_status"] == 200
            and removal["gate_affirmed_at_is_null"]
            and removal["gate_affirmed_by_is_null"],
            **removal,
        )
        self.open_timeline(first)

        self.sql(
            f"""
            BEGIN;
            SET LOCAL session_replication_role = replica;
            DELETE FROM aso.evidence_reassessment_commands
             WHERE evidence_id='{self.fixture['evidence']}';
            DELETE FROM aso.evidence_citations
             WHERE id='{self.fixture['citation']}';
            DELETE FROM aso.case_evidence WHERE id='{self.fixture['evidence']}';
            COMMIT;
            """
        )
        remaining = self.sql(
            f"SELECT (SELECT count(*) FROM aso.case_evidence "
            f"WHERE id='{self.fixture['evidence']}') + "
            f"(SELECT count(*) FROM aso.evidence_citations "
            f"WHERE id='{self.fixture['citation']}');"
        )
        self.check(
            "synthetic_delete_committed_in_postgres",
            remaining.splitlines()[-1] == "0",
            row_count=int(remaining.splitlines()[-1]),
        )
        try:
            first.get_by_text("No evidence has been recorded for this case.").wait_for(
                timeout=self.args.browser_timeout_ms
            )
        except Exception:
            self.report["last_browser_state"] = {
                "url": first.url,
                "body": first.locator("body").inner_text()[:2000],
            }
            self.screenshot(first, "failure-delete")
            raise
        second.get_by_text("No evidence has been recorded for this case.").wait_for(
            timeout=self.args.browser_timeout_ms
        )
        self.check(
            "synthetic_delete_reaches_both_graph_subscribers",
            first.get_by_text(
                "No evidence has been recorded for this case."
            ).is_visible()
            and second.get_by_text(
                "No evidence has been recorded for this case."
            ).is_visible(),
        )
        self.screenshot(first, "04-after-delete", full_page=False)

        first.get_by_role("button", name="Sign out", exact=False).click()
        first.get_by_role("heading", name="Sign in").wait_for(
            timeout=self.args.browser_timeout_ms
        )
        second.get_by_role("heading", name="Sign in").wait_for(
            timeout=self.args.browser_timeout_ms
        )
        self.check(
            "logout_removes_old_protected_state_from_all_tabs",
            self.document_name not in first.locator("body").inner_text()
            and self.document_name not in second.locator("body").inner_text()
            and "Evidence timeline" not in first.locator("body").inner_text()
            and "Evidence timeline" not in second.locator("body").inner_text(),
        )
        self.check(
            "logout_retains_no_protected_document_transition",
            first.evaluate("window.__ra14ViewTransitionCalls") == 0
            and self.document_name not in first.locator("body").inner_text(),
            transition_calls=first.evaluate("window.__ra14ViewTransitionCalls"),
        )
        self.screenshot(first, "05-after-logout", full_page=False)
        second.close()

        self.login(first, self.identity_b)
        first.goto(
            self.application_url + f"/cases/{self.fixture['case_a']}/evidence",
            wait_until="domcontentloaded",
        )
        try:
            first.get_by_role("heading", name="Evidence timeline").wait_for(
                timeout=self.args.browser_timeout_ms
            )
        except Exception:
            self.report["last_browser_state"] = {
                "url": first.url,
                "body": first.locator("body").inner_text()[:2000],
            }
            self.screenshot(first, "failure-account-change", full_page=False)
            raise
        self.check(
            "account_change_never_exposes_the_prior_practice_row",
            self.document_name not in first.locator("body").inner_text()
            and first.get_by_text(
                "This case is not available in the current authorized data.",
                exact=False,
            ).first.is_visible(),
        )
        foreign_continuation = self.denied_shape(
            {
                "shape": "cases",
                "handle": initial_case_response[0],
                "offset": initial_case_response[1],
            }
        )
        self.check(
            "account_change_cannot_continue_the_prior_session_handle",
            foreign_continuation["status"] == 403
            and foreign_continuation["shape_headers_absent"],
            **foreign_continuation,
        )
        self.report["network"] = self.network

    def cleanup(self):
        self.report["network"] = self.network
        for page in reversed(self.pages):
            try:
                if not page.is_closed():
                    page.close()
            except Exception:
                pass
        if self.context is not None:
            self.context.close()
        if self.browser is not None:
            self.browser.close()
        if self.playwright is not None:
            self.playwright.stop()
        if self.vite is not None:
            self.vite.terminate()
            try:
                self.vite.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.vite.kill()
                self.vite.wait(timeout=5)
            self.report["cleanup"]["vite"] = "Passed"
        if self.vite_log is not None:
            self.vite_log.close()
        super().cleanup()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--callback-port", type=int, default=8787)
    parser.add_argument("--aso-port", type=int, default=8788)
    parser.add_argument("--vite-port", type=int, default=5173)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--screenshot-dir", type=Path, default=DEFAULT_SCREENSHOTS)
    parser.add_argument("--replication-attempts", type=int, default=60)
    parser.add_argument("--replication-interval-seconds", type=float, default=0.25)
    parser.add_argument("--browser-timeout-ms", type=int, default=60000)
    parser.add_argument("--headed", dest="headless", action="store_false")
    parser.set_defaults(headless=True)
    args = parser.parse_args()
    return BrowserTimelineProbe(args).run()


if __name__ == "__main__":
    raise SystemExit(main())
