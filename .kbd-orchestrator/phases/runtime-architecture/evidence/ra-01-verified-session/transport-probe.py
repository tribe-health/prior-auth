#!/usr/bin/env python3
"""Probe localhost Kratos v26.2.0 using one disposable synthetic identity.

Run with Python's standard library. Writes transport-probe.json beside this file.
Credentials, cookies, identity IDs and full API responses remain in memory only.
The identity created by this run is deleted in finally, including on failures.
This verifies the HTTP transport, not a browser UI or physical native device.
"""

import datetime
import http.cookiejar
import json
from pathlib import Path
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request


PUBLIC = "http://localhost:4433"
ADMIN = "http://localhost:4434"
OUTPUT = Path(__file__).with_name("transport-probe.json")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def client(jar=None):
    handlers = [urllib.request.ProxyHandler({}), NoRedirect()]
    if jar is not None:
        handlers.append(urllib.request.HTTPCookieProcessor(jar))
    return urllib.request.build_opener(*handlers)


def request(opener, url, method="GET", body=None, headers=None):
    # A flow's action is external input. Do not send synthetic credentials
    # outside the two explicitly authorized local endpoints.
    parsed = urllib.parse.urlsplit(url)
    if f"{parsed.scheme}://{parsed.netloc}" not in (PUBLIC, ADMIN):
        raise ValueError("nonlocal_endpoint")
    values = {"Accept": "application/json"}
    if headers:
        values.update(headers)
    data = None
    if body is not None:
        values["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=values, method=method)
    try:
        response = opener.open(req, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read()
        payload = json.loads(raw) if raw else {}
        return response.status, payload


def summarize(status, session, expected_identity):
    expiry = session.get("expires_at")
    expiry_valid = False
    if isinstance(expiry, str):
        try:
            expiry_valid = datetime.datetime.fromisoformat(
                expiry.replace("Z", "+00:00")
            ) > datetime.datetime.now(datetime.timezone.utc)
        except ValueError:
            pass
    return {
        "status": status,
        "identity_matches_created": session.get("identity", {}).get("id")
        == expected_identity,
        "session_id_present": bool(session.get("id")),
        "active": session.get("active") is True,
        "expiry_present": bool(expiry),
        "expiry_in_future": expiry_valid,
    }


def main():
    result = {
        "result": "Failed",
        "verification_tier": 1,
        "scope": "Direct localhost Kratos HTTP transports; synthetic identity only",
        "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sources": [
            "https://github.com/ory/kratos/blob/v26.2.0/spec/api.json",
            "https://github.com/ory/kratos/blob/v26.2.0/session/handler.go",
            "https://github.com/ory/kratos/blob/v26.2.0/session/manager_http.go",
        ],
        "context7_library": "/ory/kratos-client-go/v26.2.0",
        "cleanup": {"identity_created": False, "identity_deleted": False},
    }
    direct = client()
    jar = http.cookiejar.CookieJar()
    browser = client(jar)
    identity_id = None
    token = None
    stage = "version"
    try:
        status, version = request(direct, ADMIN + "/version")
        result["version"] = version.get("version")
        assert status == 200 and version.get("version") == "v26.2.0"
        stage = "create_synthetic_identity"
        email = "synthetic-ra01-transport-" + secrets.token_hex(12) + "@example.invalid"
        password = secrets.token_urlsafe(36) + "Aa1!"
        status, identity = request(
            direct,
            ADMIN + "/admin/identities",
            "POST",
            {
                "schema_id": "clinician",
                "state": "active",
                "traits": {
                    "email": email,
                    "name": {"first": "Synthetic", "last": "Transport Probe"},
                },
                "credentials": {"password": {"config": {"password": password}}},
            },
        )
        identity_id = identity.get("id") if status == 201 else None
        result["cleanup"]["identity_created"] = bool(identity_id)
        result["identity_create_status"] = status
        assert identity_id
        login_body = {"method": "password", "identifier": email, "password": password}

        stage = "native_login"
        status, flow = request(direct, PUBLIC + "/self-service/login/api")
        result["native_flow_status"] = status
        assert status == 200 and flow.get("type") == "api"
        status, native_login = request(direct, flow["ui"]["action"], "POST", login_body)
        result["native_login_status"] = status
        token = native_login.get("session_token")
        assert status == 200 and token
        native_session_id = native_login["session"]["id"]

        stage = "native_whoami"
        status, bearer = request(
            direct, PUBLIC + "/sessions/whoami", headers={"Authorization": "Bearer " + token}
        )
        result["authorization_bearer"] = summarize(status, bearer, identity_id)
        status, session_token = request(
            direct, PUBLIC + "/sessions/whoami", headers={"X-Session-Token": token}
        )
        result["x_session_token"] = summarize(status, session_token, identity_id)
        result["native_transport_session_ids_equal"] = (
            bearer.get("id") == session_token.get("id") == native_session_id
        )

        stage = "browser_login"
        status, flow = request(browser, PUBLIC + "/self-service/login/browser")
        result["browser_flow_status"] = status
        assert status == 200 and flow.get("type") == "browser"
        csrf = next(
            node["attributes"]["value"]
            for node in flow["ui"]["nodes"]
            if node.get("attributes", {}).get("name") == "csrf_token"
        )
        status, _ = request(
            browser, flow["ui"]["action"], "POST", {**login_body, "csrf_token": csrf}
        )
        result["browser_login_status"] = status
        assert status in (200, 303, 422)
        stage = "browser_whoami"
        status, cookie_session = request(browser, PUBLIC + "/sessions/whoami")
        result["browser_cookie"] = summarize(status, cookie_session, identity_id)
        result["browser_and_native_identity_ids_equal"] = (
            cookie_session.get("identity", {}).get("id")
            == bearer.get("identity", {}).get("id")
            == identity_id
        )
        result["browser_and_native_session_ids_distinct"] = (
            bool(cookie_session.get("id")) and cookie_session.get("id") != native_session_id
        )

        stage = "negative_controls"
        controls = {}
        for label, headers in [
            ("missing_credential", {}),
            ("invalid_bearer", {"Authorization": "Bearer synthetic-invalid-session"}),
            ("invalid_session_token", {"X-Session-Token": "synthetic-invalid-session"}),
            ("invalid_cookie", {"Cookie": "ory_kratos_session=synthetic-invalid-session"}),
        ]:
            status, _ = request(direct, PUBLIC + "/sessions/whoami", headers=headers)
            controls[label] = status
        result["negative_controls"] = controls
        assert all(status == 401 for status in controls.values())
        for key in ("authorization_bearer", "x_session_token", "browser_cookie"):
            observation = result[key]
            assert observation["status"] == 200
            assert all(value is True for name, value in observation.items() if name != "status")
        assert result["native_transport_session_ids_equal"]
        assert result["browser_and_native_identity_ids_equal"]
        assert result["browser_and_native_session_ids_distinct"]
        result["result"] = "Passed"
    except Exception as error:
        # Never serialize exceptions: HTTP URLs and payloads may contain credentials.
        result["failure"] = {"stage": stage, "type": type(error).__name__}
    finally:
        if identity_id:
            try:
                status, _ = request(direct, ADMIN + "/admin/identities/" + identity_id, "DELETE")
                result["cleanup"]["delete_status"] = status
                status_after, _ = request(direct, ADMIN + "/admin/identities/" + identity_id)
                result["cleanup"]["lookup_after_delete_status"] = status_after
                result["cleanup"]["identity_deleted"] = status == 204 and status_after == 404
                if token:
                    status_token, _ = request(
                        direct, PUBLIC + "/sessions/whoami", headers={"X-Session-Token": token}
                    )
                    result["cleanup"]["native_session_after_delete_status"] = status_token
                status_cookie, _ = request(browser, PUBLIC + "/sessions/whoami")
                result["cleanup"]["browser_session_after_delete_status"] = status_cookie
            except Exception as error:
                result["cleanup"]["failure_type"] = type(error).__name__
        if not result["cleanup"]["identity_deleted"]:
            result["result"] = "Failed"
        if token and result["cleanup"].get("native_session_after_delete_status") != 401:
            result["result"] = "Failed"
        if identity_id and result["cleanup"].get("browser_session_after_delete_status") != 401:
            result["result"] = "Failed"
        OUTPUT.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    return 0 if result["result"] == "Passed" else 1


if __name__ == "__main__":
    sys.exit(main())
