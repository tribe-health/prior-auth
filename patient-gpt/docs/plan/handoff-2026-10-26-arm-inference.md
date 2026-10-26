# Handoff — get local inference working on the ARM MacBook Pro

Date: 2026-10-26 · From: Intel Mac Pro (x86_64) · To: Apple Silicon MacBook Pro

**Goal of the next session:** a streamed reply from the on-device chat model and
an on-device embedding, on macOS desktop first, then iOS and Android, with UAR
absent. Everything else in the phase (UAR wiring, onboarding screens, final
evidence) comes after.

**Why the move:** the macOS chat engine (`mlex`/MLX) runs only on Apple Silicon,
ort ships no Intel macOS runtime for the embedder, and the iOS "Designed for iPad"
destination and arm64 Android emulators need Apple Silicon. This Intel machine
cannot run any of it (decision D-018).

## 1. Bring the work across

All of this session's work is uncommitted on `main` in this checkout. It must be
committed and pushed from the Intel Mac, then pulled on the MacBook Pro. It
includes the twelve OpenSpec changes under `patient-gpt/openspec/changes/`, the
phase records under `.kbd-orchestrator/phases/local-inference-and-uar-wiring/`
(decision log D-016 to D-020, `spec.md`, `plan.md`, contract), the changed
`.claude/launch.json` and `mobile/pubspec.lock`.

On the MacBook Pro, after pulling:

```bash
cd patient-gpt && prometheus kbd status
```

The KBD runtime keeps its event history per machine. If the MacBook Pro shows no
history for this phase, replay position the same way this session did: enter and
complete stages `assess`, `analyze`, `spec`, then `plan` (in progress), with
`prometheus kbd stage enter|transition`. Never hand-edit the waypoint files.

## 2. Check the machine before coding

| Item | Expected | Notes |
|---|---|---|
| `uname -m` | `arm64` | The whole point of the move |
| rustc / cargo | 1.99.1 | Same as the Intel Mac |
| Flutter | the SDK at `/Users/gqadonis/development/flutter` | Intel Mac had master 3.50.0-1.0.pre-8; old handoff named beta 3.48 |
| Xcode | 26.x or newer, iOS simulator runtime installed | Needed for MLX-Swift and the iPhone 17 simulator |
| Node / pnpm | Node 24+, pnpm 10.33+ | If `~/package.json` pins yarn, pnpm needs `COREPACK_ENABLE_STRICT=0` (launch.json already does this) |
| Android | an **arm64 API 36 AVD with at least 4 GiB RAM** | Create one if none exists |
| UAR repo | `/Users/gqadonis/Projects/prometheus/universal-agent-runtime`, tag `v1.3.0` = `774469746fee4de99be41dc1cd231857067e4487` | Only needed later, for the spike |
| KnowMe repo | `/Users/gqadonis/Projects/know-me/know-me-system` | Reference for the engine and download pattern |
| Network | `huggingface.co` reachable | First model download is 0.3–1 GB |
| Apple signing | your development team in Xcode | Needed for "My Mac (Designed for iPad)" and a physical iPhone |

Missing on the Intel Mac and still unresolved:
`/Users/gqadonis/Projects/hybrid-mobile-architecture-src`. Two candidates exist
(`~/Projects/know-me/hybrid-mobile-architecture-skill`,
`~/Projects/references/hybrid-mobile-architecture-skill`); the operator has not
said which, and none was substituted.

## 3. The shortest path to working inference

Work these OpenSpec changes in this order. Each has `proposal.md`, `design.md`,
`specs/` and `tasks.md` in `openspec/changes/<change>/`.

| Step | Change | What you get | Machine-specific notes |
|---|---|---|---|
| 1 | `inference-contract` | `lane` on runs (`local` / `uar`), the `onboarding` scope, `model_status`, `prepare_models`, `embed`, `cancel_operation`, UAR mode `none` | Pure Rust/TS/Dart contract; touches every shell |
| 2 | `model-acquisition` | New crate `crates/patient-gpt-inference`: pinned catalog, verified resumable downloads, RAM preflight, `PATIENTGPT_DATA_DIR` | Catalog pins (revisions, sizes, SHA-256) are in its `design.md` |
| 3 | `desktop-local-chat` | **First streamed local reply** in the Tauri window via `mlex` 0.1.3 | Apple Silicon only |
| 4 | `local-embedder-and-mobile-store` (tasks 1.x) | **First embedding**: fastembed 7.5.0 + ort `=2.0.0-rc.15`, arctic-embed-xs int8 | Desktop embedder is gated to Apple Silicon |
| 5 | `ios-local-chat` | MLX-Swift reply on "My Mac (Designed for iPad)" and a physical iPhone; the simulator says it has no engine | MLX cannot run in the iOS simulator (vendor docs) |
| 6 | `android-local-chat` | LiteRT-LM 0.18.1 CPU reply on the arm64 emulator | The AAR also ships x86_64 |
| 7 | rest of `local-embedder-and-mobile-store` | Embeddings on iOS simulator and Android emulator; SurrealDB store on mobile | Writes ADR `docs/architecture/adr-pgpt-001-mobile-surrealdb.md` |

After step 3, a quick manual check (debug, not a test):

```bash
cd desktop && PATIENTGPT_UAR_MODE=none PATIENTGPT_DATA_DIR="$(mktemp -d)" cargo tauri dev
```

Then, from the webview devtools console, call `prepare_models`, then `start_run`
with `lane: "local"` and scope `onboarding`. The onboarding screen does not exist
until the `local-onboarding` change.

## 4. Decisions already made (do not reopen)

From `decision-log.md` (D-016, D-018, D-020), verbatim answers recorded there:

- Chat model: Qwen3-0.6B by default, Qwen3-1.7B on devices with at least 7 GiB
  physical RAM. Embedder: snowflake-arctic-embed-xs (384 dims).
- Engines: `mlex` on macOS, MLX-Swift (`mlx-swift` 0.32.3 + `mlx-swift-lm` 3.32.3)
  on iOS, LiteRT-LM 0.18.1 AAR on Android. No candle simulator lane.
- iOS chat evidence: "Mac (Designed for iPad)" plus a physical iPhone.
- "UAR absent": iOS links UAR but runs with mode `none`; Android has no UAR this phase.
- Desktop scope: macOS only.
- Mobile store: SurrealDB embedded, with an ADR for the doctrine departure.
- The local model is for onboarding only; the `local` lane is refused outside the
  `onboarding` scope.
- No delivery cadence this phase (D-020).

## 5. Rules that bite

- Tests run only at the end of the phase, locally. Build checks during work are
  `cargo check`, `pnpm -C web typecheck`, `flutter analyze` and debug runs.
- No release builds and no `tauri build`/`flutter build` during implementation:
  `.claude/hooks/tier-guard.sh` blocks any command line that even contains those
  strings. Put such text in a script file if a command must quote it.
- One Cargo build at a time. No cross-target `cargo check` mid-task; cross-builds
  happen through `flutter run` at each change's boundary.
- Never edit `versions.toml`. New pins go in `docs/plan/local-inference-pins.md`
  for the operator.
- Commit messages carry no attribution lines. Use `gh pr create --body-file`.
- `python3` may be a hanging shim; use `/usr/bin/python3`.

## 6. Where KBD stands

- Stages: assess, analyze and spec are complete. Plan has a draft
  (`.kbd-orchestrator/phases/local-inference-and-uar-wiring/plan.md`) that the
  first independent review rejected for task-level scheduling across two machines.
  On a single ARM machine most of those findings fall away: run the changes in the
  order of section 3.
- The phase contract `adopted-contract.json` is authored, schema-valid and **not
  adopted**. Its `timeMinutes` budget was raised to 4800 after the plan review.
- Open later (not needed for inference): UAR embedding spike and decision 3
  (desktop topology), embedded UAR, onboarding screens (need a `docs/design`
  addition first), final evidence run.

## 7. The uncomfortable thing

Nobody has yet seen MLX-Swift produce an iOS reply, or LiteRT-LM run on an
emulator, in KnowMe or anywhere else checked. Steps 5 and 6 may end Blocked even
when the code is right. macOS desktop (step 3) is the most likely first success.
