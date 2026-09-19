#!/usr/bin/env python3
"""RA15 local mounted campaign for attributed annotation behavior."""

import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid

from ra06c_campaign_config import DEFAULT_SECRETS, campaign_environment, load_secrets


ROOT = Path(__file__).resolve().parents[1]
RA14_PROBE = ROOT / "scripts/test-ra14-live-timeline.py"
EVIDENCE = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/evidence/"
    "ra-15-attributed-annotations"
)
DEFAULT_OUTPUT = EVIDENCE / "task-4-browser-campaign.json"
DEFAULT_SCREENSHOTS = EVIDENCE / "browser-task-4"
ANNOTATION_COLUMNS = {
    "id", "practice_id", "case_id", "annotation_type_id", "name", "body",
    "author_id", "author_label", "provenance", "is_included", "included_at",
    "target_evidence_id", "target_document_id", "revision", "created_at", "updated_at",
}


def load_ra14_probe():
    spec = importlib.util.spec_from_file_location("ra14_browser_probe", RA14_PROBE)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the RA14 browser probe")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ra14 = load_ra14_probe()


class AnnotationProbe(ra14.BrowserTimelineProbe):
    def __init__(self, args):
        super().__init__(args)
        self.fixture.update({
            "annotation": str(uuid.uuid4()),
            "other_user": str(uuid.uuid4()),
            "admin_user": str(uuid.uuid4()),
        })
        self.identity_other = None
        self.identity_admin = None
        self.annotation_type = None
        campaign_secrets = load_secrets(DEFAULT_SECRETS)
        self.gate_authority_role = campaign_secrets["gate_authority_role"]
        self.gate_authority_password = campaign_secrets["gate_authority_password"]
        self.report.update({
            "result": "Failed",
            "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": (
                "Synthetic Kratos, ASO Postgres command transaction, Gate/FRF/Electric, "
                "PGlite, committed PEM graph and Chromium annotation UI"
            ),
            "command": "python3 scripts/test-ra15-attributed-annotations.py",
            "unverified": [
                "Chromium automation is not physical mobile-device or Tauri-window evidence.",
                "OS-level IME composition across resize is covered by the React component "
                "test because Playwright cannot synthesize a trusted platform IME session.",
                "PGlite remains an experimental qualification path under the recorded RSS block.",
            ],
        })

    def prepare_gate_authority(self):
        if not self.gate_authority_role.replace("_", "").isalnum():
            raise RuntimeError("campaign Gate authority role is not a SQL identifier")
        self.sql(
            f"DO $$ BEGIN CREATE ROLE {self.gate_authority_role} LOGIN "
            f"PASSWORD '{self.gate_authority_password}' NOSUPERUSER NOCREATEDB "
            "NOCREATEROLE NOREPLICATION NOBYPASSRLS; "
            "EXCEPTION WHEN duplicate_object THEN NULL; END $$; "
            f"ALTER ROLE {self.gate_authority_role} LOGIN "
            f"PASSWORD '{self.gate_authority_password}'; "
            f"GRANT aso_authority_event_reader TO {self.gate_authority_role};"
        )
        process = subprocess.run(
            [
                os.environ.get("RA06_TOOL_BASH", "bash"),
                str(ROOT / "scripts/ra05-stack.sh"),
                "up",
                "-d",
                "--force-recreate",
                "flint-gate",
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=180,
            check=False,
        )
        self.check(
            "gate_uses_the_materialized_campaign_authority_role",
            process.returncode == 0,
            compose_output=(process.stdout + process.stderr)[-1000:],
        )
        for _ in range(80):
            try:
                status, _, jwks = self.json_http(
                    ra14.transition.composition.GATE + "/.well-known/jwks.json"
                )
                if status == 200 and jwks.get("keys"):
                    self.check("clinical_gate_is_ready", True, status=status)
                    break
            except Exception:
                pass
            time.sleep(0.25)
        else:
            raise RuntimeError("clinical Gate did not become ready")

    def install_annotation_policy_migration(self):
        installed = self.sql(
            "SELECT to_regprocedure('aso.read_annotation_target(uuid,uuid)') IS NOT NULL;"
        )
        if installed != "t":
            migration = (
                ROOT / "migrations/server/2026090615_annotation_gateway_policy.sql"
            ).read_text()
            self.sql(migration)
        installed = self.sql(
            "SELECT to_regprocedure('aso.read_annotation_target(uuid,uuid)') IS NOT NULL;"
        )
        self.check(
            "annotation_gate_policy_migration_is_installed_before_requests",
            installed == "t",
            observed=installed,
            migration="2026090615_annotation_gateway_policy.sql",
        )

    def start_vite(self):
        os.environ["ASO_CLINICAL_GATE_PROXY_TARGET"] = ra14.transition.composition.GATE
        os.environ["ASO_CLINICAL_GATE_HOST"] = "clinical-gateway:4456"
        super().start_vite()

    def provision_additional_members(self):
        practice = self.practices[self.identity_a]
        self.practices[self.identity_other] = practice
        self.practices[self.identity_admin] = practice
        self.sql(
            f"""
            BEGIN;
            SET LOCAL search_path=aso,public;
            INSERT INTO aso.users(id,kratos_identity_id,practice_id,email,full_name) VALUES
              ('{self.fixture['other_user']}','{self.identity_other}','{practice}',
               'ra15-other-{self.identity_other}@example.invalid','Synthetic RA15 Surgeon B'),
              ('{self.fixture['admin_user']}','{self.identity_admin}','{practice}',
               'ra15-admin-{self.identity_admin}@example.invalid','Synthetic RA15 Administrator');
            INSERT INTO aso.user_roles(user_id,role_id,practice_id)
            SELECT '{self.fixture['other_user']}',id,'{practice}' FROM aso.roles WHERE key='surgeon';
            INSERT INTO aso.user_roles(user_id,role_id,practice_id)
            SELECT '{self.fixture['admin_user']}',id,'{practice}' FROM aso.roles WHERE key='admin';
            COMMIT;
            """
        )

    def annotation_command(
        self,
        identity_id,
        *,
        body,
        disposition,
        expected_revision,
        command_id=None,
        through_gate=False,
    ):
        origin = (
            ra14.transition.composition.GATE
            if through_gate
            else f"http://127.0.0.1:{self.args.aso_port}"
        )
        url = (
            f"{origin}/api/cases/{self.fixture['case_a']}"
            f"/annotations/{self.fixture['annotation']}?practiceId="
            f"{self.practices[self.identity_a]}"
        )
        headers = {"Authorization": "Bearer " + self.sessions[identity_id]["token"]}
        if through_gate:
            headers["Host"] = "clinical-gateway:4456"
        return self.json_http(
            url,
            "POST",
            {
                "commandId": command_id or str(uuid.uuid4()),
                "annotationId": self.fixture["annotation"],
                "annotationTypeId": self.annotation_type,
                "name": "Clinical judgment",
                "data": {"assertion": body},
                "body": body,
                "targetEvidenceId": self.fixture["evidence"],
                "targetDocumentId": None,
                "disposition": disposition,
                "expectedRevision": expected_revision,
            },
            headers,
        )

    def load_annotation_type(self):
        self.annotation_type = self.sql(
            "SELECT id FROM aso.annotation_types WHERE key='clinical-judgment';"
        )
        if not self.annotation_type:
            raise RuntimeError("clinical-judgment annotation type is required")

    def verify_replica_grant_boundary(self):
        practice_id = self.practices[self.identity_a]
        token = self.sessions[self.identity_a]["token"]
        status, _, grant = self.json_http(
            f"http://127.0.0.1:{self.args.aso_port}/api/session/replica-grant"
            f"?practiceId={practice_id}",
            headers={"Authorization": "Bearer " + token},
        )
        self.check(
            "aso_returns_the_revision_four_replica_grant",
            status == 200
            and grant.get("projectionRevision") == 5
            and len(grant.get("projections", [])) == 7,
            status=status,
            response=grant,
        )
        status, headers, _ = self.gate_request(
            self.identity_a,
            {"shape": "cases"},
        )
        self.check(
            "browser_equivalent_shape_request_mints_a_replica_grant",
            status == 200 and bool(headers.get("electric-handle")),
            status=status,
            electric_handle_present=bool(headers.get("electric-handle")),
        )

    def create_initial_annotation_in_browser(self, page):
        lost_response = {}

        def commit_then_lose_response(route):
            if route.request.method != "POST" or lost_response:
                route.continue_()
                return
            request = route.request.post_data_json
            response = route.fetch()
            lost_response.update({
                "status": response.status,
                "request": request,
                "response": response.json(),
            })
            route.abort("failed")

        page.route("**/api/cases/**/annotations/**", commit_then_lose_response)
        page.get_by_text("No clinical annotations recorded", exact=True).wait_for(
            timeout=self.args.browser_timeout_ms
        )
        page.get_by_role("button", name="Create annotation").click()
        page.get_by_label("Clinical point").fill("Synthetic initial attributed opinion.")
        page.get_by_role("button", name="Save annotation").click()
        page.get_by_text(
            "The annotation result is unknown. Check the command before trying again.",
            exact=True,
        ).wait_for(timeout=self.args.browser_timeout_ms)
        request = lost_response.get("request", {})
        result = lost_response.get("response", {})
        self.fixture["annotation"] = request.get("annotationId")
        self.check(
            "first_annotation_is_committed_through_gate_by_the_projected_catalog_ui",
            lost_response.get("status") == 200
            and request.get("annotationTypeId") == self.annotation_type
            and request.get("expectedRevision") == 0
            and result.get("revision") == 1
            and result.get("authorId") == self.fixture["user_a"]
            and result.get("authorLabel") == "Synthetic RA05 Surgeon A"
            and result.get("provenance") == "surgeon"
            and result.get("disposition") == "held",
            status=lost_response.get("status"),
            annotation_id=self.fixture["annotation"],
            command_id=request.get("commandId"),
            requested_annotation_type_id=request.get("annotationTypeId"),
            projected_annotation_type_id=self.annotation_type,
            response=result,
        )
        counts_after_lost_response = self.sql(
            f"SELECT revision || '|' || "
            f"(SELECT count(*) FROM aso.annotation_revisions WHERE annotation_id='{self.fixture['annotation']}') || '|' || "
            f"(SELECT count(*) FROM aso.annotation_commands WHERE annotation_id='{self.fixture['annotation']}') || '|' || "
            f"(SELECT count(*) FROM aso.audit_events WHERE entity_id='{self.fixture['annotation']}') "
            f"FROM aso.annotations WHERE id='{self.fixture['annotation']}';"
        )
        self.check(
            "lost_response_commits_exactly_one_annotation_transaction",
            counts_after_lost_response == "1|1|1|1",
            observed=counts_after_lost_response,
        )
        with page.expect_response(
            lambda response: response.request.method == "GET"
            and "/commands/" in response.url,
            timeout=self.args.browser_timeout_ms,
        ) as lookup_info:
            page.get_by_role("button", name="Check annotation").click()
        lookup = lookup_info.value
        self.check(
            "uncertain_ui_command_reconciles_through_gate_lookup",
            lookup.status == 200 and lookup.json() == result,
            status=lookup.status,
            response=lookup.json(),
        )
        self.wait_for_annotation(page, "Synthetic initial attributed opinion.")
        page.get_by_text("Annotation saved and confirmed.", exact=True).wait_for(
            timeout=self.args.browser_timeout_ms
        )
        page.unroute("**/api/cases/**/annotations/**", commit_then_lose_response)

        gateway_url = (
            f"{ra14.transition.composition.GATE}/api/cases/{self.fixture['case_a']}"
            f"/annotations/{self.fixture['annotation']}?practiceId="
            f"{self.practices[self.identity_a]}"
        )
        headers = {
            "Authorization": "Bearer " + self.sessions[self.identity_a]["token"],
            "Host": "clinical-gateway:4456",
        }
        replay_status, _, replay = self.json_http(
            gateway_url, "POST", request, headers
        )
        changed = dict(request)
        changed["body"] = "Synthetic changed replay body."
        changed["data"] = {"assertion": changed["body"]}
        conflict_status, _, conflict = self.json_http(
            gateway_url, "POST", changed, headers
        )
        counts_after_replays = self.sql(
            f"SELECT revision || '|' || "
            f"(SELECT count(*) FROM aso.annotation_revisions WHERE annotation_id='{self.fixture['annotation']}') || '|' || "
            f"(SELECT count(*) FROM aso.annotation_commands WHERE annotation_id='{self.fixture['annotation']}') || '|' || "
            f"(SELECT count(*) FROM aso.audit_events WHERE entity_id='{self.fixture['annotation']}') "
            f"FROM aso.annotations WHERE id='{self.fixture['annotation']}';"
        )
        self.check(
            "same_command_replays_idempotently_and_changed_payload_conflicts",
            replay_status == 200
            and replay == result
            and conflict_status == 409
            and conflict.get("error") == "command_conflict"
            and counts_after_replays == "1|1|1|1",
            replay_status=replay_status,
            conflict_status=conflict_status,
            conflict=conflict,
            observed=counts_after_replays,
        )

    def wait_for_annotation(self, page, body):
        page.get_by_text(body, exact=True).wait_for(timeout=self.args.browser_timeout_ms)

    def clinical_gate_evidence(self):
        process = subprocess.run(
            [
                os.environ.get("RA06_TOOL_BASH", "bash"),
                str(ROOT / "scripts/ra05-stack.sh"),
                "logs",
                "--no-color",
                "flint-gate",
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        logs = re.sub(r"\x1b\[[0-9;]*m", "", process.stdout + process.stderr)
        annotation_path = (
            f"/api/cases/{self.fixture['case_a']}"
            f"/annotations/{self.fixture['annotation']}"
        )
        command_path = annotation_path + "/commands/"
        evidence = {
            "saveRouteMatched": any(
                annotation_path in line
                and command_path not in line
                and "route_id=aso-annotation-save" in line
                for line in logs.splitlines()
            ),
            "saveForwardedAfterAuthorization": any(
                annotation_path in line
                and command_path not in line
                and "proxying to upstream" in line
                for line in logs.splitlines()
            ),
            "commandRouteMatched": any(
                command_path in line and "route_id=aso-annotation-command" in line
                for line in logs.splitlines()
            ),
            "commandForwardedAfterAuthorization": any(
                command_path in line and "proxying to upstream" in line
                for line in logs.splitlines()
            ),
        }
        self.report["clinicalGateRouteEvidence"] = evidence
        return process.returncode == 0 and all(evidence.values())

    def exercise(self):
        status, _, version = self.json_http(ra14.transition.composition.KRATOS_ADMIN + "/version")
        self.check(
            "kratos_version_is_pinned",
            status == 200 and version.get("version") == "v26.2.0",
            status=status,
            version=version.get("version"),
        )
        schema = self.sql(
            "SELECT to_regclass('aso.annotation_commands') IS NOT NULL "
            "AND to_regclass('aso.annotation_revisions') IS NOT NULL;"
        )
        self.check(
            "ra15_annotation_schema_is_installed_before_fixture_creation",
            schema == "t",
            observed=schema,
        )
        self.install_annotation_policy_migration()
        self.prepare_gate_authority()
        self.identity_a = self.create_identity_session("ra15-a")
        self.identity_b = self.create_identity_session("ra15-unused")
        self.identity_other = self.create_identity_session("ra15-other")
        self.identity_admin = self.create_identity_session("ra15-admin")
        self.start_grant_callback()
        self.seed_fixture(self.identity_a, self.identity_b)
        self.provision_additional_members()
        self.seed_timeline()
        self.load_annotation_type()
        self.verify_replica_grant_boundary()
        self.start_vite()
        page = self.start_browser()
        self.login(page, self.identity_a)
        self.open_timeline(page)
        self.create_initial_annotation_in_browser(page)
        self.check(
            "held_annotation_projects_with_attribution",
            page.get_by_text("Held out of letter", exact=True).is_visible()
            and page.get_by_text(
                "Synthetic RA05 Surgeon A · surgeon · revision 1", exact=True
            ).is_visible(),
        )
        self.screenshot(page, "01-held-annotation")

        page.get_by_role("button", name="Edit annotation").click()
        editor = page.get_by_label("Clinical point")
        editor.fill("Synthetic local stale draft.")
        editor.evaluate(
            "node => { window.__ra15Editor = node; node.setSelectionRange(10, 15); }"
        )
        page.set_viewport_size({"width": 320, "height": 780})
        page.wait_for_timeout(100)
        continuity = editor.evaluate(
            "node => ({ sameNode: window.__ra15Editor === node, value: node.value, "
            "selectionStart: node.selectionStart, selectionEnd: node.selectionEnd, "
            "viewport: window.innerWidth, bodyWidth: document.body.scrollWidth })"
        )
        self.check(
            "mobile_resize_preserves_editor_identity_caret_and_width",
            continuity == {
                "sameNode": True,
                "value": "Synthetic local stale draft.",
                "selectionStart": 10,
                "selectionEnd": 15,
                "viewport": 320,
                "bodyWidth": 320,
            },
            **continuity,
        )
        self.screenshot(page, "02-mobile-editor", full_page=False)

        external_body = "Synthetic concurrent opinion at revision two."
        status, _, external = self.annotation_command(
            self.identity_a,
            body=external_body,
            disposition="held",
            expected_revision=1,
        )
        self.check(
            "concurrent_authoritative_annotation_reaches_revision_two",
            status == 200 and external.get("revision") == 2,
            status=status,
            response=external,
        )
        self.wait_for_annotation(page, external_body)
        with page.expect_response(
            lambda response: response.request.method == "POST"
            and "/api/cases/" in response.url
            and "/annotations/" in response.url,
            timeout=self.args.browser_timeout_ms,
        ) as stale_response_info:
            page.get_by_role("button", name="Save annotation").click()
        stale_response = stale_response_info.value
        stale_payload = stale_response.json()
        self.check(
            "stale_ui_submission_is_refused_by_api",
            stale_response.status == 409
            and stale_payload.get("error") == "revision_conflict",
            status=stale_response.status,
            response=stale_payload,
        )
        page.get_by_role("alert").filter(has_text="Annotation changed").wait_for(
            timeout=self.args.browser_timeout_ms
        )
        self.check(
            "stale_ui_submission_is_an_explicit_conflict",
            page.get_by_text("revision_conflict", exact=True).is_visible()
            and page.get_by_role("button", name="Save annotation").is_enabled(),
        )
        stale_counts = self.sql(
            f"SELECT revision || '|' || "
            f"(SELECT count(*) FROM aso.annotation_revisions WHERE annotation_id='{self.fixture['annotation']}') || '|' || "
            f"(SELECT count(*) FROM aso.annotation_commands WHERE annotation_id='{self.fixture['annotation']}') "
            f"FROM aso.annotations WHERE id='{self.fixture['annotation']}';"
        )
        self.check(
            "stale_submission_commits_no_record_or_audit",
            stale_counts == "2|2|2",
            observed=stale_counts,
        )
        self.screenshot(page, "03-stale-conflict", full_page=False)

        page.get_by_role("button", name="Close").click()
        page.get_by_role("button", name="Edit annotation").click()
        page.get_by_role("button", name="Discard draft").click()
        editor = page.get_by_label("Clinical point")
        editor.fill("Synthetic included opinion at revision three.")
        page.get_by_text("Include in the letter", exact=True).click()
        page.get_by_role("button", name="Save annotation").click()
        self.wait_for_annotation(page, "Synthetic included opinion at revision three.")
        page.get_by_text("Included in letter", exact=True).wait_for(
            timeout=self.args.browser_timeout_ms
        )
        page.get_by_text("Annotation saved and confirmed.", exact=True).wait_for(
            timeout=self.args.browser_timeout_ms
        )
        final_counts = self.sql(
            f"SELECT revision || '|' || is_included || '|' || author_label || '|' || "
            f"(SELECT count(*) FROM aso.annotation_revisions WHERE annotation_id='{self.fixture['annotation']}') || '|' || "
            f"(SELECT count(*) FROM aso.annotation_commands WHERE annotation_id='{self.fixture['annotation']}') || '|' || "
            f"(SELECT count(*) FROM aso.audit_events WHERE entity_id='{self.fixture['annotation']}') "
            f"FROM aso.annotations WHERE id='{self.fixture['annotation']}';"
        )
        self.check(
            "included_ui_save_commits_once_and_projects_back",
            final_counts == "3|true|Synthetic RA05 Surgeon A|3|3|3",
            observed=final_counts,
        )
        chart_facts = self.sql(
            f"SELECT evidence.state || '|' || evidence.assessed_by::text || '|' || document.name "
            f"FROM aso.case_evidence evidence "
            f"JOIN aso.evidence_citations citation ON citation.case_evidence_id=evidence.id "
            f"JOIN aso.documents document ON document.id=citation.document_id "
            f"WHERE evidence.id='{self.fixture['evidence']}';"
        )
        self.check(
            "annotation_changes_leave_chart_facts_unchanged",
            chart_facts
            == f"met|{self.fixture['user_a']}|{self.document_name}",
            observed=chart_facts,
        )
        self.screenshot(page, "04-included-confirmed")

        status, _, refusal = self.annotation_command(
            self.identity_admin,
            body="Synthetic administrator attempt.",
            disposition="held",
            expected_revision=3,
            through_gate=True,
        )
        self.check(
            "administrator_annotation_is_explicitly_refused",
            status == 403
            and refusal.get("error") == "clinical_authorization_denied",
            status=status,
            response=refusal,
        )
        after_refusal = self.sql(
            f"SELECT revision || '|' || "
            f"(SELECT count(*) FROM aso.annotation_commands WHERE annotation_id='{self.fixture['annotation']}') "
            f"FROM aso.annotations WHERE id='{self.fixture['annotation']}';"
        )
        self.check(
            "refused_annotation_commits_nothing",
            after_refusal == "3|3",
            observed=after_refusal,
        )
        self.check(
            "clinical_commands_traverse_the_named_gate_routes",
            self.clinical_gate_evidence(),
            **self.report.get("clinicalGateRouteEvidence", {}),
        )

        page.get_by_role("button", name="Edit annotation").click()
        page.get_by_label("Clinical point").fill("Synthetic draft owned by the first identity.")
        page.get_by_role("button", name="Sign out", exact=False).click()
        page.get_by_role("heading", name="Sign in").wait_for(timeout=self.args.browser_timeout_ms)
        try:
            self.login(page, self.identity_other)
        except Exception:
            self.report["account_change_login_state"] = {
                "url": page.url,
                "body": page.locator("body").inner_text()[:2000],
                "cookies": sorted(cookie["name"] for cookie in self.context.cookies()),
            }
            self.screenshot(page, "failure-account-change-login")
            raise
        self.open_timeline(page)
        self.wait_for_annotation(page, "Synthetic included opinion at revision three.")
        page.get_by_role("button", name="Edit annotation").click()
        other_editor = page.get_by_label("Clinical point")
        self.check(
            "another_identity_cannot_recover_the_prior_draft",
            other_editor.input_value() == "Synthetic included opinion at revision three."
            and page.get_by_text("Unsent annotation available", exact=True).count() == 0
            and "Synthetic draft owned by the first identity."
            not in page.locator("body").inner_text(),
            editor_value=other_editor.input_value(),
        )
        self.screenshot(page, "05-other-identity")

        annotation_payload_columns = set()
        for observation in self.network:
            if observation.get("shape") == "annotations":
                for columns in observation.get("row_column_sets", []):
                    annotation_payload_columns.update(columns)
        self.check(
            "annotation_shape_uses_only_the_approved_projection",
            annotation_payload_columns == ANNOTATION_COLUMNS,
            observed=sorted(annotation_payload_columns),
            expected=sorted(ANNOTATION_COLUMNS),
        )
        self.report["network"] = self.network

    def cleanup(self):
        if self.fixture_seeded:
            try:
                remaining = self.sql(
                    f"""
                    BEGIN;
                    SET LOCAL search_path=aso,public;
                    SET LOCAL session_replication_role = replica;
                    DELETE FROM aso.annotation_commands WHERE annotation_id='{self.fixture['annotation']}';
                    DELETE FROM aso.annotation_revisions WHERE annotation_id='{self.fixture['annotation']}';
                    DELETE FROM aso.audit_events WHERE entity_id='{self.fixture['annotation']}';
                    DELETE FROM aso.annotations WHERE id='{self.fixture['annotation']}';
                    DELETE FROM aso.evidence_citations WHERE id='{self.fixture['citation']}';
                    DELETE FROM aso.case_evidence WHERE id='{self.fixture['evidence']}';
                    DELETE FROM aso.documents WHERE id='{self.fixture['document']}';
                    DELETE FROM aso.user_roles WHERE user_id IN (
                      '{self.fixture['other_user']}','{self.fixture['admin_user']}'
                    );
                    DELETE FROM aso.users WHERE id IN (
                      '{self.fixture['other_user']}','{self.fixture['admin_user']}'
                    );
                    COMMIT;
                    SELECT
                      (SELECT count(*) FROM aso.annotations WHERE id='{self.fixture['annotation']}')
                      + (SELECT count(*) FROM aso.case_evidence WHERE id='{self.fixture['evidence']}')
                      + (SELECT count(*) FROM aso.documents WHERE id='{self.fixture['document']}')
                      + (SELECT count(*) FROM aso.users WHERE id IN (
                          '{self.fixture['other_user']}','{self.fixture['admin_user']}'
                        ));
                    """
                )
                self.report["cleanup"]["ra15_rows"] = (
                    "Passed" if remaining.splitlines()[-1] == "0" else "Failed"
                )
                self.report["cleanup"]["ra15_remaining_row_count"] = int(
                    remaining.splitlines()[-1]
                )
            except Exception as error:
                self.report["cleanup"]["ra15_rows"] = "Failed"
                self.report["cleanup"]["ra15_cleanup_error"] = str(error)
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
    os.environ.update(campaign_environment(DEFAULT_SECRETS, "http://electric:3000"))
    return AnnotationProbe(args).run()


if __name__ == "__main__":
    raise SystemExit(main())
