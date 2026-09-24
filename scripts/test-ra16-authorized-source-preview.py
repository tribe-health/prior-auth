#!/usr/bin/env python3
"""RA16 local mounted campaign for the authorized adaptive source preview."""

import argparse
import datetime
from hashlib import sha256
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.parse
import uuid

from ra06c_campaign_config import DEFAULT_SECRETS, campaign_environment, load_secrets


ROOT = Path(__file__).resolve().parents[1]
RA14_PROBE = ROOT / "scripts/test-ra14-live-timeline.py"
EVIDENCE = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/evidence/"
    "ra-16-authorized-source-preview"
)
DEFAULT_OUTPUT = EVIDENCE / "task-4-browser-campaign.json"
DEFAULT_SCREENSHOTS = EVIDENCE / "browser-task-4"


def load_ra14_probe():
    spec = importlib.util.spec_from_file_location("ra16_ra14_probe", RA14_PROBE)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the RA14 browser probe")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ra14 = load_ra14_probe()


def synthetic_pdf() -> bytes:
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length 55 >>\nstream\nBT /F1 18 Tf 72 720 Td "
        b"(Synthetic RA16 page 1) Tj ET\nendstream",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
        b"<< /Length 55 >>\nstream\nBT /F1 18 Tf 72 720 Td "
        b"(Synthetic RA16 page 2) Tj ET\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, body in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode())
        output.extend(body)
        output.extend(b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n".encode()
    )
    return bytes(output)


class SourcePreviewProbe(ra14.BrowserTimelineProbe):
    def __init__(self, args):
        super().__init__(args)
        self.source_root = ROOT / ".runtime" / ("ra16-source-" + uuid.uuid4().hex)
        self.source_key = f"documents/{self.fixture['document']}.pdf"
        self.source_bytes = synthetic_pdf()
        self.source_responses = []
        self.document_name = "Synthetic RA16 MRI source"
        self.source_boundary_installed = False
        self.report.update({
            "result": "Failed",
            "verification_tier": 1,
            "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": (
                "Synthetic Kratos, ASO/Postgres audited bytes, Gate/FRF/Electric, "
                "PGlite, PEM and real Chromium adaptive source preview"
            ),
            "command": (
                "RUSTUP_TOOLCHAIN=1.98.1 python3 "
                "scripts/test-ra16-authorized-source-preview.py"
            ),
            "source_responses": self.source_responses,
            "unverified": [
                "Chromium automation is not physical mobile-device or Tauri-window evidence.",
                "The native credential transport remains fail closed until RA17.",
                "Chromium's built-in PDF renderer is exercised through an iframe; this campaign "
                "does not certify every operating-system PDF renderer.",
            ],
        })
        self.source_root.mkdir(parents=True, mode=0o700)
        source_path = self.source_root / self.source_key
        source_path.parent.mkdir(parents=True)
        source_path.write_bytes(self.source_bytes)
        os.environ["ASO_DOCUMENT_STORE_ROOT"] = str(self.source_root)

    def run_stack(self, *arguments, timeout=300):
        process = subprocess.run(
            [
                os.environ.get("RA06_TOOL_BASH", "bash"),
                str(ROOT / "scripts/ra05-stack.sh"),
                *arguments,
            ],
            cwd=ROOT,
            env=os.environ.copy(),
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        if process.returncode:
            raise RuntimeError(
                "RA16 stack command failed: "
                + (process.stdout + process.stderr)[-2000:]
            )
        return process

    def ensure_local_stack(self):
        self.run_stack("up", "-d")
        for _ in range(120):
            try:
                if self.sql("SELECT 1;") == "1":
                    break
            except Exception:
                pass
            time.sleep(0.25)
        else:
            raise RuntimeError("local PostgreSQL stack did not become ready")

        secrets = load_secrets(DEFAULT_SECRETS)
        role = secrets["gate_authority_role"]
        password = secrets["gate_authority_password"]
        if not role.replace("_", "").isalnum():
            raise RuntimeError("campaign Gate authority role is not a SQL identifier")
        self.sql(
            f"DO $$ BEGIN CREATE ROLE {role} LOGIN PASSWORD '{password}' "
            "NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; "
            "EXCEPTION WHEN duplicate_object THEN NULL; END $$; "
            f"ALTER ROLE {role} LOGIN PASSWORD '{password}'; "
            f"GRANT aso_authority_event_reader TO {role};"
        )
        self.run_stack("up", "-d", "--force-recreate", "flint-gate")
        for _ in range(160):
            try:
                status, _, jwks = self.json_http(
                    ra14.transition.composition.GATE + "/.well-known/jwks.json"
                )
                if status == 200 and jwks.get("keys"):
                    self.check(
                        "local_integration_stack_is_running",
                        True,
                        gate_status=status,
                    )
                    break
            except Exception:
                pass
            time.sleep(0.25)
        else:
            raise RuntimeError("clinical Gate did not become ready after recreation")

    def build_server(self):
        process = subprocess.run(
            ["cargo", "build", "-p", "aso-web-server"],
            cwd=ROOT,
            env={**os.environ, "RUSTUP_TOOLCHAIN": "1.98.1"},
            text=True,
            capture_output=True,
            timeout=600,
            check=False,
        )
        self.check(
            "current_source_aso_server_builds",
            process.returncode == 0,
            output=(process.stdout + process.stderr)[-1200:],
        )
        if process.returncode:
            raise RuntimeError("current ASO server build failed")

    def install_source_boundary(self):
        present = self.sql(
            "SELECT to_regprocedure('aso.read_document_source_grant(uuid,uuid,integer)') "
            "IS NOT NULL;"
        )
        if present != "t":
            self.sql(
                (ROOT / "migrations/server/2026090616_authorized_document_source.sql")
                .read_text()
            )
            self.source_boundary_installed = True
        installed = self.sql(
            "SELECT to_regprocedure('aso.read_document_source_grant(uuid,uuid,integer)') "
            "IS NOT NULL AND has_function_privilege('aso_gate_executor', "
            "'aso.read_document_source_grant(uuid,uuid,integer)', 'EXECUTE');"
        )
        self.check(
            "mounted_fixture_has_current_source_boundary",
            installed == "t",
            installed_for_campaign=self.source_boundary_installed,
        )

    def new_browser_context(self):
        context = super().new_browser_context()
        context.add_init_script(
            """
            window.__ra16ObjectUrls = { created: [], revoked: [] };
            const create = URL.createObjectURL.bind(URL);
            const revoke = URL.revokeObjectURL.bind(URL);
            URL.createObjectURL = blob => {
              const value = create(blob);
              window.__ra16ObjectUrls.created.push(value);
              return value;
            };
            URL.revokeObjectURL = value => {
              window.__ra16ObjectUrls.revoked.push(value);
              return revoke(value);
            };
            """
        )
        return context

    def observe_response(self, response):
        super().observe_response(response)
        parsed = urllib.parse.urlsplit(response.url)
        if not parsed.path.endswith("/source"):
            return
        self.source_responses.append({
            "status": response.status,
            "path": parsed.path,
            "query_keys": sorted(urllib.parse.parse_qs(parsed.query)),
            "cache_control": response.headers.get("cache-control"),
            "content_length": response.headers.get("content-length"),
            "document_id": response.headers.get("x-aso-source-document-id"),
            "effective_date": response.headers.get("x-aso-source-effective-date"),
            "page": response.headers.get("x-aso-source-page"),
            "page_count": response.headers.get("x-aso-source-page-count"),
            "location_present": "location" in response.headers,
        })

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
        content_hash = sha256(self.source_bytes).hexdigest()
        seeded = self.sql(
            f"""
            BEGIN;
            SET LOCAL search_path=aso,public;
            INSERT INTO aso.documents(
              id, document_type_id, patient_id, case_id, name,
              effective_date, page_count, ingest_method, storage_uri,
              content_sha256, data
            ) VALUES (
              '{f['document']}', '{document_type}', '{f['patient_a']}',
              '{f['case_a']}', '{self.document_name}', DATE '2026-03-14', 2,
              'manual_upload', '{self.source_key}', decode('{content_hash}','hex'),
              '{{"modality":"MRI","body_region":"spine","impression":"synthetic"}}'::jsonb
            );
            INSERT INTO aso.case_evidence(
              id, case_id, criterion_id, state, assessed_by, assessed_at
            ) VALUES (
              '{f['evidence']}', '{f['case_a']}', '{criterion}', 'met',
              '{f['user_a']}', TIMESTAMPTZ '2026-03-15T12:00:00Z'
            );
            INSERT INTO aso.evidence_citations(
              id, case_evidence_id, document_id, page_number, relevance
            ) VALUES (
              '{f['citation']}', '{f['evidence']}', '{f['document']}', 1, 'supports'
            );
            COMMIT;
            SELECT count(*) FROM aso.documents
             WHERE id='{f['document']}' AND practice_id='{practice}'
               AND content_sha256=decode('{content_hash}','hex');
            """
        )
        self.check(
            "synthetic_source_is_scoped_and_hash_bound",
            seeded.splitlines()[-1] == "1",
            source_byte_count=len(self.source_bytes),
            content_sha256=content_hash,
        )

    def forbidden_source(self):
        practice = self.practices[self.identity_b]
        token = self.sessions[self.identity_b]["token"]
        url = (
            f"http://127.0.0.1:{self.args.aso_port}/api/cases/"
            f"{self.fixture['case_a']}/documents/{self.fixture['document']}"
            f"/source?page=1&practiceId={practice}"
        )
        status, headers, body = self.http(
            url, headers={"Authorization": "Bearer " + token}
        )
        database_diagnostic = None
        if status != 403:
            expires_at = (
                datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
            ).isoformat()
            statement = f"""
            BEGIN;
            SET LOCAL ROLE aso_gate_executor;
            SET LOCAL search_path = pg_catalog, aso, pg_temp;
            SELECT set_config('aso.kratos_identity_id','{self.identity_b}',true),
                   set_config('aso.actor_id','{self.fixture['user_b']}',true),
                   set_config('aso.practice_id','{practice}',true),
                   set_config('aso.principal','user',true),
                   set_config('aso.session_expires_at','{expires_at}',true);
            SELECT aso.read_document_source_grant(
              '{self.fixture['case_a']}', '{self.fixture['document']}', 1);
            ROLLBACK;
            """
            process = subprocess.run(
                [
                    ra14.transition.BASH_TOOL,
                    str(ROOT / "scripts/ra05-stack.sh"),
                    "exec", "-T", "-e", f"PGPASSWORD={self.runtime_password}",
                    "db", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
                    "-U", self.runtime_role, "-d", "flint", "-Atq",
                ],
                cwd=ROOT,
                input=statement,
                text=True,
                capture_output=True,
                timeout=30,
                check=False,
            )
            database_diagnostic = {
                "return_code": process.returncode,
                "stderr": process.stderr.strip()[-1200:],
            }
        return {
            "status": status,
            "body_byte_count": len(body),
            "body": body.decode("utf-8", errors="replace"),
            "cache_control": headers.get("cache-control"),
            "location_present": "location" in headers,
            "storage_key_exposed": self.source_key.encode() in body,
            "database_diagnostic": database_diagnostic,
        }

    def layout_observation(self, page, width, height):
        page.set_viewport_size({"width": width, "height": height})
        page.wait_for_timeout(100)
        return page.evaluate(
            """([width, height]) => {
              const dialogs = [...document.querySelectorAll('[data-slot="dialog-content"]')];
              const frames = [...document.querySelectorAll('iframe[title*="Synthetic RA16"]')];
              if (dialogs.length !== 1 || frames.length !== 1) {
                return { width, height, dialogCount: dialogs.length, frameCount: frames.length };
              }
              const dialog = dialogs[0];
              const box = dialog.getBoundingClientRect();
              const controls = [...dialog.querySelectorAll('button')].map(button => {
                const rect = button.getBoundingClientRect();
                return { name: button.getAttribute('aria-label') || button.textContent.trim(),
                         width: rect.width, height: rect.height };
              });
              const footer = dialog.querySelector('footer');
              return {
                width, height,
                dialogCount: dialogs.length,
                frameCount: frames.length,
                frameMarker: frames[0].dataset.ra16Mount,
                bodyWidth: document.body.scrollWidth,
                dialog: { x: box.x, y: box.y, width: box.width, height: box.height,
                          right: box.right, bottom: box.bottom },
                controls,
                footerPaddingBottom: footer ? parseFloat(getComputedStyle(footer).paddingBottom) : 0,
                dialogTransitionProperty: getComputedStyle(dialog).transitionProperty,
                dialogTransitionDuration: getComputedStyle(dialog).transitionDuration,
                controlTransitionProperties: controls.length
                  ? [...dialog.querySelectorAll('button')].map(button => getComputedStyle(button).transitionProperty)
                  : [],
                controlTransitionDurations: controls.length
                  ? [...dialog.querySelectorAll('button')].map(button => getComputedStyle(button).transitionDuration)
                  : [],
              };
            }""",
            [width, height],
        )

    @staticmethod
    def responsive_layout_is_valid(observation):
        width = observation["width"]
        height = observation["height"]
        dialog = observation.get("dialog", {})
        if observation.get("dialogCount") != 1 or observation.get("frameCount") != 1:
            return False
        contained = (
            observation.get("bodyWidth", width) <= width
            and dialog.get("x", -2) >= -1
            and dialog.get("y", -2) >= -1
            and dialog.get("right", width + 2) <= width + 1
            and dialog.get("bottom", height + 2) <= height + 1
        )
        targets = all(control["height"] >= 44 for control in observation.get("controls", []))
        if width < 600:
            geometry = (
                abs(dialog.get("x", -10)) <= 1
                and abs(dialog.get("y", -10)) <= 1
                and abs(dialog.get("width", 0) - width) <= 1
                and abs(dialog.get("height", 0) - height) <= 1
            )
        else:
            geometry = dialog.get("x", 0) > 0 and dialog.get("y", 0) > 0
        return contained and targets and geometry and observation.get("footerPaddingBottom", 0) >= 8

    def exercise(self):
        self.build_server()
        self.ensure_local_stack()
        self.install_source_boundary()
        status, _, version = self.json_http(ra14.transition.composition.KRATOS_ADMIN + "/version")
        self.check(
            "kratos_version_is_pinned",
            status == 200 and version.get("version") == "v26.2.0",
            status=status,
            version=version.get("version"),
        )
        status, _, jwks = self.json_http(
            ra14.transition.composition.GATE + "/.well-known/jwks.json"
        )
        self.check(
            "gate_signing_key_is_available",
            status == 200 and bool(jwks.get("keys")),
            status=status,
            key_count=len(jwks.get("keys", [])),
        )

        self.identity_a = self.create_identity_session("ra16-browser-a")
        self.identity_b = self.create_identity_session("ra16-browser-b")
        self.seed_fixture(self.identity_a, self.identity_b)
        self.seed_timeline()
        self.start_vite()
        first = self.start_browser()
        self.login(first, self.identity_a)
        self.open_timeline(first)
        second = self.new_page()
        self.open_timeline(second)

        denied = self.forbidden_source()
        self.check(
            "foreign_practice_source_request_is_private",
            denied["status"] == 403
            and denied["cache_control"] == "no-store"
            and not denied["location_present"]
            and not denied["storage_key_exposed"],
            **denied,
        )

        action_name = re.compile(r"^Open source Synthetic RA16 MRI source")
        action = first.get_by_role("button", name=action_name)
        trigger_label = action.get_attribute("aria-label")
        action_box = action.bounding_box()
        self.check(
            "citation_action_is_a_44px_target",
            action_box is not None and action_box["height"] >= 44,
            box=action_box,
        )
        with first.expect_response(lambda response: response.url.endswith(
            f"source?page=1&practiceId={self.practices[self.identity_a]}"
        )) as response_info:
            action.click()
        response = response_info.value
        first.get_by_role("dialog").wait_for(timeout=self.args.browser_timeout_ms)
        first.get_by_title(f"{self.document_name}, page 1").wait_for(
            timeout=self.args.browser_timeout_ms
        )
        self.check(
            "authorized_preview_uses_the_audited_private_byte_route",
            response.status == 200
            and response.headers.get("cache-control") == "no-store"
            and response.headers.get("accept-ranges") == "none"
            and response.headers.get("x-aso-source-document-id") == self.fixture["document"]
            and response.headers.get("x-aso-source-effective-date") == "2026-03-14"
            and response.headers.get("x-aso-source-page") == "1"
            and response.headers.get("content-length") == str(len(self.source_bytes))
            and "location" not in response.headers,
            status=response.status,
            headers={name: response.headers.get(name) for name in (
                "cache-control", "accept-ranges", "x-aso-source-document-id",
                "x-aso-source-effective-date", "x-aso-source-page", "content-length",
            )},
        )
        audit_count = self.sql(
            "SELECT count(*) FROM aso.audit_events "
            f"WHERE action='document.source.read' AND entity_id='{self.fixture['document']}' "
            "AND data->>'pageNumber'='1';"
        )
        self.check(
            "browser_byte_response_has_a_committed_source_read_audit",
            audit_count.splitlines()[-1] == "1",
            audit_count=int(audit_count.splitlines()[-1]),
        )
        first.get_by_title(f"{self.document_name}, page 1").evaluate(
            "node => { node.dataset.ra16Mount = 'stable-through-resize'; }"
        )

        observations = []
        for width, height in ((1440, 900), (1200, 900), (600, 800), (320, 780)):
            observation = self.layout_observation(first, width, height)
            observations.append(observation)
            self.check(
                f"preview_layout_{width}px_is_single_contained_and_touch_safe",
                self.responsive_layout_is_valid(observation)
                and observation.get("frameMarker") == "stable-through-resize",
                observation=observation,
            )
            self.screenshot(first, f"preview-{width}px", full_page=False)
        first.emulate_media(reduced_motion="reduce")
        reduced = self.layout_observation(first, 320, 780)
        durations = [reduced.get("dialogTransitionDuration", "")]
        durations.extend(reduced.get("controlTransitionDurations", []))
        properties = [reduced.get("dialogTransitionProperty", "")]
        properties.extend(reduced.get("controlTransitionProperties", []))
        self.check(
            "reduced_motion_removes_preview_and_control_transitions",
            first.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
            and all(
                duration in ("0s", "0ms") or property_name == "none"
                for duration, property_name in zip(durations, properties)
            ),
            durations=durations,
            properties=properties,
        )
        private_cache = first.evaluate(
            "async () => ({ controller: Boolean(navigator.serviceWorker.controller), "
            "cacheKeys: await caches.keys() })"
        )
        self.check(
            "preview_uses_no_private_service_worker_cache",
            not private_cache["controller"] and private_cache["cacheKeys"] == [],
            **private_cache,
        )

        with first.expect_response(lambda response: "source?page=2" in response.url):
            first.get_by_role("button", name="Next").click()
        first.get_by_text("Page 2 of 2", exact=True).wait_for(
            timeout=self.args.browser_timeout_ms
        )
        page_two_audit = self.sql(
            "SELECT count(*) FROM aso.audit_events "
            f"WHERE action='document.source.read' AND entity_id='{self.fixture['document']}' "
            "AND data->>'pageNumber'='2';"
        )
        self.check(
            "page_navigation_is_visible_keyboard_reachable_and_audited",
            page_two_audit.splitlines()[-1] == "1"
            and first.get_by_role("button", name="Previous").is_enabled()
            and first.get_by_role("button", name="Next").is_disabled(),
            page_two_audit=int(page_two_audit.splitlines()[-1]),
        )

        first.get_by_role("button", name="Close source preview").click()
        first.get_by_role("dialog").wait_for(state="detached")
        first.wait_for_timeout(50)
        close_state = first.evaluate(
            "() => ({ active: document.activeElement?.getAttribute('aria-label'), "
            "urls: window.__ra16ObjectUrls })"
        )
        self.check(
            "close_releases_the_object_url_and_returns_focus_to_the_citation",
            close_state["active"] == trigger_label
            and len(close_state["urls"]["created"]) == 2
            and len(close_state["urls"]["revoked"]) == 2,
            **close_state,
        )

        denied_created = len(close_state["urls"]["created"])
        first.route(
            "**/api/cases/**/documents/**/source?*",
            lambda route: route.fulfill(
                status=403,
                content_type="application/json",
                headers={"cache-control": "no-store"},
                body=json.dumps({"error": "document_source_denied"}),
            ),
        )
        action.click()
        first.get_by_role("alert").filter(has_text="Source access refused").wait_for(
            timeout=self.args.browser_timeout_ms
        )
        denied_ui = first.evaluate(
            "() => ({ frames: document.querySelectorAll('iframe').length, "
            "created: window.__ra16ObjectUrls.created.length })"
        )
        self.check(
            "forbidden_preview_renders_no_document_handle",
            denied_ui["frames"] == 0 and denied_ui["created"] == denied_created,
            **denied_ui,
        )
        first.get_by_role("button", name="Close source preview").click()
        first.unroute("**/api/cases/**/documents/**/source?*")

        with first.expect_response(lambda response: "source?page=1" in response.url):
            action.click()
        first.get_by_title(f"{self.document_name}, page 1").wait_for(
            timeout=self.args.browser_timeout_ms
        )
        second.get_by_role("button", name="Sign out", exact=False).click()
        first.get_by_role("heading", name="Sign in").wait_for(
            timeout=self.args.browser_timeout_ms
        )
        second.get_by_role("heading", name="Sign in").wait_for(
            timeout=self.args.browser_timeout_ms
        )
        logout_state = first.evaluate(
            "() => ({ urls: window.__ra16ObjectUrls, dialogs: "
            "document.querySelectorAll('[data-slot=dialog-content]').length, "
            "body: document.body.innerText })"
        )
        self.check(
            "actual_logout_releases_rendered_bytes_and_removes_old_scope_content",
            logout_state["dialogs"] == 0
            and self.document_name not in logout_state["body"]
            and len(logout_state["urls"]["created"])
                == len(logout_state["urls"]["revoked"]),
            created=len(logout_state["urls"]["created"]),
            revoked=len(logout_state["urls"]["revoked"]),
            dialog_count=logout_state["dialogs"],
        )
        self.screenshot(first, "after-logout", full_page=False)
        self.report["source_responses"] = self.source_responses

    def cleanup(self):
        if self.fixture_seeded:
            try:
                f = self.fixture
                remaining = self.sql(
                    f"""
                    BEGIN;
                    SET LOCAL search_path=aso,public;
                    SET LOCAL session_replication_role = replica;
                    DELETE FROM aso.audit_events
                     WHERE action='document.source.read' AND entity_id='{f['document']}';
                    DELETE FROM aso.evidence_citations WHERE id='{f['citation']}';
                    DELETE FROM aso.case_evidence WHERE id='{f['evidence']}';
                    DELETE FROM aso.documents WHERE id='{f['document']}';
                    COMMIT;
                    SELECT
                      (SELECT count(*) FROM aso.evidence_citations WHERE id='{f['citation']}')
                      + (SELECT count(*) FROM aso.case_evidence WHERE id='{f['evidence']}')
                      + (SELECT count(*) FROM aso.documents WHERE id='{f['document']}')
                      + (SELECT count(*) FROM aso.audit_events
                          WHERE action='document.source.read' AND entity_id='{f['document']}');
                    """
                )
                self.report["cleanup"]["ra16_rows"] = (
                    "Passed" if remaining.splitlines()[-1] == "0" else "Failed"
                )
                self.report["cleanup"]["ra16_remaining_row_count"] = int(
                    remaining.splitlines()[-1]
                )
            except Exception as error:
                self.report["cleanup"]["ra16_rows"] = "Failed"
                self.report["cleanup"]["ra16_cleanup_error"] = str(error)
        super().cleanup()
        if self.source_boundary_installed:
            try:
                self.sql(
                    "DROP FUNCTION aso.record_document_source_read(uuid,uuid,integer,bytea,bigint); "
                    "DROP FUNCTION aso.read_document_source_grant(uuid,uuid,integer); "
                    "DROP FUNCTION aso.require_document_source(uuid,uuid,integer);"
                )
                absent = self.sql(
                    "SELECT to_regprocedure("
                    "'aso.read_document_source_grant(uuid,uuid,integer)') IS NULL;"
                )
                self.report["cleanup"]["source_boundary"] = (
                    "Passed" if absent == "t" else "Failed"
                )
            except Exception as error:
                self.report["cleanup"]["source_boundary"] = "Failed"
                self.report["cleanup"]["source_boundary_error"] = str(error)
        try:
            if self.source_root.exists():
                shutil.rmtree(self.source_root)
            self.report["cleanup"]["source_root"] = (
                "Passed" if not self.source_root.exists() else "Failed"
            )
        except Exception as error:
            self.report["cleanup"]["source_root"] = "Failed"
            self.report["cleanup"]["source_root_error"] = str(error)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--callback-port", type=int, default=8787)
    parser.add_argument("--aso-port", type=int, default=8788)
    parser.add_argument("--vite-port", type=int, default=5173)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--screenshot-dir", type=Path, default=DEFAULT_SCREENSHOTS)
    parser.add_argument("--replication-attempts", type=int, default=60)
    parser.add_argument("--replication-interval-seconds", type=float, default=0.25)
    parser.add_argument("--browser-timeout-ms", type=int, default=120000)
    parser.add_argument("--headed", dest="headless", action="store_false")
    parser.set_defaults(headless=True)
    args = parser.parse_args()
    os.environ.update(campaign_environment(DEFAULT_SECRETS, "http://electric:3000"))
    return SourcePreviewProbe(args).run()


if __name__ == "__main__":
    raise SystemExit(main())
