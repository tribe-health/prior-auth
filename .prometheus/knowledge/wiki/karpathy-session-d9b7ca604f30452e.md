---
type: SessionRecord
id: karpathy-session-d9b7ca604f30452e
title: Karpathy session d9b7ca604f30
tags:
- karpathy
- session-learning
sources:
- session:31d3eb3b-e2a1-49c4-a7bf-1f2e644d130e
timestamp: 2026-09-05T14:41:29.701279+00:00
created_at: 2026-09-05T14:41:29.701279+00:00
updated_at: 2026-09-05T14:41:29.701279+00:00
revision: 0
---

## Delta

Everything's built and verified. Here's what landed in `/Users/gqadonis/Projects/TribeHealth/kevin/prior-auth`.

## The system

**Rust workspace** — three crates plus the Tauri shell. The architecture is the dependency direction: `aso-host` names no shell at all, which is what lets one core serve Axum, Tauri, and Flutter. The audit fails the build if that ever stops being true.

**React** — feature-based clean architecture, every filename kebab-case, enforced mechanically. `Component → feature hook → feature api → shared http client` — no component touches the network.

**Flutter** — Riverpod, same contracts, bottom bar on every platform switching to a rail by *window width*, never by OS.

**One token source** — `tokens.toml` generates both `web/src/theme.css` and `mobile/lib/core/theme/tokens.dart`. Verified: 22 roles × 2 themes, identical values across surfaces, regeneration idempotent.

**`docs/`** — the full design system copied in: 18 screens, the shared CSS/JS, 4 SQL files, both PDF addenda, plus 3 ADRs and a build-order plan. Your existing brand docs are untouched.

## Verified, not assumed

| | |
|---|---|
| `cargo build --workspace` | 4 crates compile |
| `cargo test --workspace` | 5 invariant tests pass |
| Server on `:8791` | **admin refused, surgeon's four affirmations flip the gate** |
| `flutter analyze` | no issues |
| `flutter test` | 7 pass |
| `scripts/audit.sh` | 6 boundary checks pass |

The server run is the one I'd point at: `{"error":"actor 00000000-… does not hold the AffirmGate capability"}` came from a live HTTP call, not a unit test.

## Three things worth flagging

**My Flutter pins were invented.** I wrote `riverpod_lint: 3.3.2` — a version that has never been published. `flutter pub get` caught it; a caret range would have resolved to something arbitrary and hidden the mistake. I looked up the real versions and re-pinned.

**`custom_lint` had to be dropped.** It caps `analyzer_plugin` at `^0.13` while `riverpod_lint` needs `^0.14`, and `riverpod_generator` needs a `riverpod_analyzer_utils` that `custom_lint` also refuses. You cannot satisfy all of them today. Codegen matters more than extra lint rules, so the generator won — with a comment saying to re-add both together, never one alone.

**The audit had three bugs of its own**, including reporting `PASS` while a check failed, because `FAIL=1` was set inside a pipeline subshell. Fixed and negative-tested: I planted a component calling `fetch()` and confirmed it gets caught.

## What is *not* done

No physical-device run, no production web build, no Tauri window launched. Per the verification contract those surfaces are **build-only** — real, but not "working". I've recorded that honestly in the README rather than letting a green test suite imply more than it proves.

`docs/plan/build-order.md` has the phase status. Phases 1 and 2 are the irreversible ones — lane and privacy class per table, and the gateway wiring — and both are still partial.

## Root Cause

No explicit root-cause section was captured; preserve this as a session record, not an inferred diagnosis.

## Corrective Actions

Review and promote only reusable findings.

## Session Metadata

- Harness: claude-code
- Session: 31d3eb3b-e2a1-49c4-a7bf-1f2e644d130e
- Captured: 2026-09-04T11:09:40.155167Z
- Project: /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth

## Changed Paths

- No changed paths detected.
