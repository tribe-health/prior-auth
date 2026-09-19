"""Fresh-renderer runner for the mounted PRI c015 lifecycle proof."""

from __future__ import annotations

import time
from typing import Any, Callable
import urllib.error
import urllib.request


def install_revoke_binding(context: Any, admin_url: str) -> None:
    def revoke_session(session_id: str) -> int:
        request = urllib.request.Request(
            admin_url.rstrip("/") + "/admin/sessions/" + session_id,
            method="DELETE",
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status
        except urllib.error.HTTPError as error:
            return error.code

    context.expose_function("__RA11C_REVOKE_SESSION__", revoke_session)


def run_lifecycle_page(
    context: Any,
    current_page: Any,
    origin: str,
    on_request: Callable[[Any], None],
    timeout_seconds: int,
) -> dict[str, object]:
    current_page.close()
    page = context.new_page()
    page.on("request", on_request)
    page.goto(
        origin + "/ra11c-browser-lifecycle.html",
        wait_until="networkidle",
        timeout=30_000,
    )
    page.wait_for_function("window.__RA11C_READY__ === true", timeout=30_000)
    page.evaluate("() => { window.__RA11C_START__(); }")
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        status = page.evaluate(
            "() => ({stage: window.__RA11C_STAGE__, "
            "done: window.__RA11C_LIFECYCLE_RESULT__ !== undefined, "
            "error: window.__RA11C_ERROR__})"
        )
        if status.get("error"):
            raise RuntimeError(str(status["error"]))
        if status.get("done"):
            result = page.evaluate("() => window.__RA11C_LIFECYCLE_RESULT__")
            page.close()
            return result
        time.sleep(0.05)
    raise RuntimeError("mounted session lifecycle exceeded its timeout")
