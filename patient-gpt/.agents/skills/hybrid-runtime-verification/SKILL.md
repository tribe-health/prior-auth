---
name: hybrid-runtime-verification
description: ALWAYS invoke before calling any Flutter, Tauri, React, Rust, web, desktop, or mobile application or change working, complete, done, ready, shippable, or verified — "working" is a runtime claim, and compiling is not evidence. Local-inference lanes in particular pass every host check and then fail at model load on a real device, so a baseline or engine change needs a PHYSICAL-device run recorded in docs/platform-support.md. Triggers on working, it works, complete, done, ready, shippable, verified, ship it, tested, launch, smoke test, release build, production build, clean checkout, device verification, physical device, on-device, emulator, simulator, does it run.
---

# Hybrid Runtime Verification

"Working" is a runtime claim, not a synonym for type-checking or passing unit tests. Apply this gate to every surface included in the claim and preserve the evidence.

## Verification contract

Before starting, list the claimed surfaces: Tauri desktop, production web, Flutter iOS, Flutter Android, or another explicitly named target. A surface passes only when all applicable rows below pass:

| Gate | Required proof |
|---|---|
| Reproducibility | Fresh clone or clean detached worktree; no ignored `dist`, build output, downloaded model, or tool cache from the development tree |
| Dependencies | Frozen/locked install and required code generation complete successfully |
| Static quality | Formatter, analyzer/type-checker, architecture audit, and compiler/clippy succeed |
| Production artifact | Release/production build succeeds from tracked sources |
| Real launch | Built artifact starts under a bounded timeout and reaches its documented ready state |
| Persistence | Expected app-data directories/files are created and readable after launch |
| Public workflow | One real user-visible workflow crosses the public boundary and returns a valid result |
| Physical device | Required when the change touches a platform baseline or a local-inference lane — see below |

Do not substitute mocked tests, source inspection, a dev server response, or a successful compile for a real launch.

## Physical-device verification

A simulator is not a device for this purpose. Two classes of failure are
invisible everywhere else:

- **Local-inference lanes fail at model load**, after every host check has
  passed. On iOS an over-budget load is a jetsam process kill — no exception, no
  log. On Android a missing or mismatched native library surfaces as a
  `dlopen`/`UnsatisfiedLinkError` only when the JNI bridge is first touched.
- **Native bridges bind by symbol name.** A renamed JNI class path or an
  `@_silgen_name` mismatch compiles clean on both sides and fails to resolve at
  runtime. A Swift file absent from `project.pbxproj` is never compiled at all.

Required whenever a change touches: a platform baseline (Dart, Flutter, Android
`minSdk`, iOS deployment target), an inference engine or its native bridge, or a
native dependency.

```bash
node scripts/android/build.mjs
node scripts/android/verify-native-inference-gates.mjs   # arm64-only APK, required .so present
node scripts/android/verify-device-runtime-gates.mjs     # no fatal/JNI/dlopen failure in logcat
```

Record the result in `docs/platform-support.md` under **Latest physical-device
verification**:

```markdown
- Date: 2026-07-18
- Device: Samsung SM-S936U, Android API 36, arm64-v8a
- Toolchain: Flutter 3.47.0-0.1.pre (beta), Dart 3.13.0-282.1.beta
- Result: debug APK built, installed, and launched; local model downloaded,
  verified, and produced streamed output; theme persisted across cold restart.
```

Name the device, the API level, and what was actually observed. "Tested on
Android" is not a record — it cannot be reproduced or falsified.

A generated project starts **UNVERIFIED** on purpose. That is not a gap to paper
over; it is an accurate statement until someone runs it on hardware.

## Workflow

### 1. Define evidence and time limits

- Record the commit, platform, tool versions, commands, expected ready signal, app-data location, and workflow before running anything.
- Put a timeout around installs, builds, launches, model downloads, network calls, and test processes. On timeout, terminate the full process tree and report the phase.
- Use one Rust compilation flow per profile. Do not start duplicate workspace test or clippy processes.

### 2. Verify the development tree

- Run the locked dependency install, code generators, static checks, behavior tests, production builds, and architecture audit required by the project. Invoke Dart code generators through `flutter pub run` when a separate system Dart SDK could shadow Flutter's bundled beta SDK.
- Launch each claimed surface. Inspect persistent diagnostics as well as terminal output.
- Verify startup creates the documented configuration, memory/database, and model-cache locations.
- Exercise a public boundary. Prove seeded memory search returns ranked results and prove a chat prompt produces streamed `ContentBlock` output through the real UI. Use `GEN_UI_DEV_OLLAMA_MODEL=llama3.2:1b` when that local model is the declared development backend.
- Serve the production web bundle separately from the source dev server and inspect browser console errors.
- For mobile, launch the built app in a simulator/emulator and prove the Rust core reaches ready before accepting a rendered shell as success.

### 3. Verify clean-checkout packaging

- Repeat dependency installation, code generation, tests, and production builds in a fresh clone or detached worktree with caches and ignored package outputs absent.
- Generate a new scratch hybrid project with the repository scaffold scripts. Verify toolchain versions, local package exports, browser target, iOS archive/simulator configuration, architecture audit, and production builds.
- A repair is incomplete if the example app passes but the responsible scaffold/template still emits the defect.

### 4. Report truthfully

Produce an evidence table with one row per gate and surface containing the exact command, result, artifact/log path, and observed behavior. Distinguish:

- **Passed** — production artifact launched and the workflow completed.
- **Build-only** — compiled but was not launched; never call this working.
- **Blocked** — an external dependency or unavailable target prevented proof.
- **Failed** — launched or ran and produced incorrect behavior.

Do not call the application or change working, complete, ready, verified, or shippable while any claimed surface is build-only, blocked, or failed. Preserve diagnostic logs and the commands needed to reproduce every non-pass.

## Completion checklist

- [ ] Claimed surfaces and ready signals were declared.
- [ ] Commands ran with bounded timeouts and left no orphan processes.
- [ ] Development-tree static checks, tests, audits, and production builds passed.
- [ ] Every claimed surface was launched from its built artifact.
- [ ] Persistence locations and one public-boundary workflow were proven.
- [ ] Fresh-checkout build proof passed without ignored local artifacts.
- [ ] A newly scaffolded scratch project passed parity checks.
- [ ] If a platform baseline or inference lane changed: a physical-device run was
      performed and recorded in `docs/platform-support.md`.
- [ ] Evidence identifies exact commands, artifacts, logs, and remaining blockers.
