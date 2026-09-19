## Context

The repaired completion contract allows RA06 to close its implemented server and synchronous
consumer boundaries while keeping the missing RA11c producer visible. `ra06d-01` and `ra06d-02`
finish the child implementation. This change owns the single local Tier 2 and full-integration
campaign at the child phase-completion boundary.

## Decisions

- Confirm both implementation changes are archived before freezing the final candidate or running
  any Tier 2 or full-integration command.
- Preserve stale, partial, or premature candidate receipts but prohibit their use in the final
  evidence index and review packet.
- Freeze and validate the final candidate, then execute all 12 receipt roles locally.
- Run Rust commands sequentially in the shared target directory.
- Run `flutter test` from the `mobile` directory. Record that this is the executable equivalent of
  the invalid root-level constraint spelling `flutter test mobile`.
- Treat the T0/T1 receipt commands as the parent Tier 2 command set and record each check using
  exactly Passed, Build-only, Blocked or Failed. Do not rerun an equivalent command merely to give
  it a second label.
- Build the parent packet with tracked and non-ignored untracked source from the start, plus the
  dependency plan, child handoff, Tier 2 logs, receipts/index, contracts and claim limits.
- Run parent c1–c7 deterministic refinement before isolated adversarial review.
- Complete RA06 only with no critical finding. Keep RA11c and RA17 unchecked and explicit.
- After child exit, verify that the detailed handoff content and hash survived the KBD transition.
  If KBD replaced it with a template, restore the reviewed content and write a recovery receipt.

## Limits

Passing RA06 does not certify the Electric/PGLite materializer caller, native Tauri clinical
commands, WebView/device rendering, or final runtime publication. Those remain required by later
phases and RA22. A command run before both implementation changes are archived cannot contribute
to this change's certification.
