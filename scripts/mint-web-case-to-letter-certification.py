#!/usr/bin/env python3
"""Mint a reviewable certification bundle from the web case-to-letter recording."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import importlib.metadata
import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / ".runtime" / "web-case-to-letter-video-proof"
EXPECTED_SCENARIOS = (
    "01-initial-request",
    "02-corrected-resubmission",
    "03-clinical-appeal",
)
MODULE_PATHS = (
    "crates/aso-document-assembly",
    "crates/aso-host",
    "crates/aso-web-server",
    "crates/clinical-docs",
    "docker-compose.yaml",
    "migrations/server",
    "web/package.json",
    "web/src",
)


def run(*command: str) -> str:
    completed = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    return completed.stdout.strip()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as artifact:
        for block in iter(lambda: artifact.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def module_fingerprint(git_sha: str) -> str:
    tree = run(
        "git",
        "ls-tree",
        "-r",
        "--full-tree",
        git_sha,
        "--",
        *MODULE_PATHS,
    )
    entries: list[tuple[str, str]] = []
    for line in tree.splitlines():
        metadata, path = line.split("\t", 1)
        blob_sha = metadata.rsplit(" ", 1)[1]
        entries.append((path, blob_sha))
    if not entries:
        raise RuntimeError("module fingerprint has no tracked source files")
    canonical = "".join(f"{path}\0{blob_sha}\n" for path, blob_sha in sorted(entries))
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def transcode(source: Path, destination: Path) -> None:
    subprocess.run(
        (
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(source),
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-an",
            str(destination),
        ),
        cwd=ROOT,
        check=True,
    )
    codec = run(
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(destination),
    )
    if codec != "h264":
        raise RuntimeError(f"expected H.264 output for {destination.name}, observed {codec!r}")


def render_report(run_report: dict[str, object], git_sha: str) -> str:
    scenario_cards = []
    for scenario in run_report["scenarios"]:
        slug = str(scenario["slug"])
        name = html.escape(str(scenario["name"]))
        duration = float(scenario["duration_seconds"])
        scenario_cards.append(
            f"""
      <article>
        <p class="eyebrow">Passed · {duration:.1f} seconds</p>
        <h2>{name}</h2>
        <video controls preload="metadata" src="videos/{slug}.mp4"></video>
        <a href="screenshots/{slug}-complete.png">Open completion screenshot</a>
      </article>"""
        )
    cards = "\n".join(scenario_cards)
    observed_at = html.escape(str(run_report["observed_at"]))
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ASO web case-to-letter certification</title>
  <style>
    :root {{ color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }}
    body {{ margin: 0; background: #f5f1eb; color: #1f1b18; }}
    main {{ width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 72px; }}
    header {{ margin-bottom: 32px; }}
    h1 {{ max-width: 780px; font-family: Georgia, serif; font-size: clamp(2rem, 5vw, 4rem); line-height: 1.02; }}
    .meta {{ color: #625b55; line-height: 1.6; }}
    article {{ margin: 24px 0; padding: clamp(18px, 3vw, 32px); border: 1px solid #d7cec3; border-radius: 18px; background: #fff; box-shadow: 0 18px 44px rgb(51 42 34 / 8%); }}
    .eyebrow {{ color: #a85417; font-size: .78rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }}
    h2 {{ font-family: Georgia, serif; font-size: clamp(1.35rem, 3vw, 2rem); }}
    video {{ display: block; width: 100%; margin: 18px 0; border-radius: 12px; background: #111; }}
    a {{ color: #184f68; font-weight: 700; }}
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">Advanced Spine &amp; Orthopedics · browser evidence</p>
      <h1>Web case-to-letter customer demo</h1>
      <p class="meta">All three synthetic workflows reached payer acknowledgement in the real browser against the local Compose stack.<br>
      Implementation commit <code>{git_sha}</code> · observed {observed_at}</p>
    </header>
{cards}
  </main>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output-root", type=Path, default=ROOT / "docs" / "certifications")
    args = parser.parse_args()
    source = args.source.resolve()
    run_report = json.loads((source / "run-report.json").read_text(encoding="utf-8"))
    scenarios = run_report.get("scenarios", [])
    observed_slugs = tuple(str(item.get("slug")) for item in scenarios)
    if run_report.get("result") != "Passed" or observed_slugs != EXPECTED_SCENARIOS:
        raise RuntimeError("recording report must contain all three passing scenarios in order")
    if any(item.get("status") != "Passed" for item in scenarios):
        raise RuntimeError("recording report contains a failed scenario")

    git_sha = run("git", "rev-parse", "HEAD")
    destination = args.output_root.resolve() / "web-case-to-letter" / git_sha[:12]
    if destination.exists():
        shutil.rmtree(destination)
    videos = destination / "videos"
    screenshots = destination / "screenshots"
    videos.mkdir(parents=True)
    screenshots.mkdir(parents=True)

    shutil.copy2(source / "run-report.json", destination / "run-report.json")
    shutil.copy2(source / "cucumber-report.json", destination / "cucumber-report.json")
    for slug in EXPECTED_SCENARIOS:
        transcode(source / "videos" / f"{slug}.webm", videos / f"{slug}.mp4")
        shutil.copy2(
            source / "screenshots" / f"{slug}-complete.png",
            screenshots / f"{slug}-complete.png",
        )

    (destination / "report.html").write_text(
        render_report(run_report, git_sha), encoding="utf-8"
    )
    artifact_paths = sorted(
        path for path in destination.rglob("*") if path.is_file() and path.name != "manifest.json"
    )
    artifacts = [
        {
            "path": str(path.relative_to(destination)),
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
        }
        for path in artifact_paths
    ]
    manifest = {
        "schema_version": 1,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "git_sha": git_sha,
        "module": "web-case-to-letter",
        "module_fingerprint": module_fingerprint(git_sha),
        "module_paths": MODULE_PATHS,
        "result": "Passed",
        "artifacts": artifacts,
        "runtime": {
            "playwright_version": importlib.metadata.version("playwright"),
            "ffmpeg_version": run("ffmpeg", "-version").splitlines()[0],
            "video_codec": "h264",
        },
    }
    (destination / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
