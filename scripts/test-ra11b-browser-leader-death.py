#!/usr/bin/env python3
"""Prove Chromium releases a Web Lock when its owning worker terminates."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


HTML = b"<!doctype html><meta charset='utf-8'><title>RA11b Web Lock</title>"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(HTML)))
        self.end_headers()
        self.wfile.write(HTML)

    def log_message(self, _format: str, *_args: object) -> None:
        return


def main() -> int:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as playwright:
            candidates = [
                Path(playwright.chromium.executable_path),
                Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            ]
            executable = next((str(path) for path in candidates if path.is_file()), None)
            if executable is None:
                raise RuntimeError("No installed Chromium executable is available")
            browser = playwright.chromium.launch(
                executable_path=executable,
                headless=True,
            )
            page = browser.new_page()
            page.goto(f"http://127.0.0.1:{server.server_port}/")
            result = page.evaluate(
                """async () => {
                  if (!navigator.locks || typeof Worker === 'undefined') {
                    throw new Error('Web Locks or Worker unavailable');
                  }
                  const source = `
                    self.onmessage = async ({ data: name }) => {
                      await navigator.locks.request(
                        name,
                        { mode: 'exclusive', ifAvailable: true },
                        async (lock) => {
                          self.postMessage(lock ? 'owner' : 'follower');
                          if (lock) await new Promise(() => {});
                        },
                      );
                    };
                  `;
                  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
                  const start = () => {
                    const worker = new Worker(url);
                    const status = new Promise((resolve, reject) => {
                      worker.onmessage = ({ data }) => resolve(data);
                      worker.onerror = ({ message }) => reject(new Error(message));
                    });
                    worker.postMessage('aso:ra11b:leader-death');
                    return { worker, status };
                  };
                  const leader = start();
                  if (await leader.status !== 'owner') throw new Error('leader did not acquire');
                  const blocked = await navigator.locks.request(
                    'aso:ra11b:leader-death',
                    { mode: 'exclusive', ifAvailable: true },
                    async (lock) => Boolean(lock),
                  );
                  leader.worker.terminate();
                  let released = false;
                  for (let attempt = 0; attempt < 100 && !released; attempt += 1) {
                    released = await navigator.locks.request(
                      'aso:ra11b:leader-death',
                      { mode: 'exclusive', ifAvailable: true },
                      async (lock) => Boolean(lock),
                    );
                    if (!released) await new Promise((resolve) => setTimeout(resolve, 10));
                  }
                  const a = start();
                  const b = start();
                  const statuses = await Promise.all([a.status, b.status]);
                  a.worker.terminate();
                  b.worker.terminate();
                  URL.revokeObjectURL(url);
                  return { blockedBeforeTermination: blocked, released, statuses };
                }"""
            )
            browser.close()
        passed = (
            result["blockedBeforeTermination"] is False
            and result["released"] is True
            and sorted(result["statuses"]) == ["follower", "owner"]
        )
        receipt = {"result": "Passed" if passed else "Failed", **result}
        print(json.dumps(receipt, sort_keys=True))
        return 0 if passed else 1
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    raise SystemExit(main())
