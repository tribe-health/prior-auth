## 1. Child implementation boundary

- [x] 1.1 Confirm `ra06d-01-repair-completion-ownership` and `ra06d-02-refreeze-and-replay` are archived and no child implementation task remains. Record every earlier candidate and receipt set, including `sha256:280353f94999e118c0f58ecb068a6a4067d945cf709433e0781e841c724e72ff`, as stale or premature and prohibited from certification.
- [x] 1.2 Freeze and validate one final candidate after the implementation boundary. Bind exact source, configuration, toolchain, dependencies, fixtures, build artifacts, images and contracts before any Tier 2 or full-integration command executes.

## 2. Phase-completion integration and review

- [x] 2.1 Run the 12-role local campaign once as the child phase-completion integration matrix. Its T0/T1 roles supply parent Tier 2 for sequential `cargo test --workspace`, `cargo build --workspace`, `pnpm --dir web build`, `flutter analyze mobile`, `flutter test` from `mobile`, and `bash scripts/audit.sh`; retain raw output and do not duplicate equivalent commands.
- [x] 2.2 Close the evidence index, build the corrected parent packet with tracked and non-ignored untracked source, dependency plan, Tier 2 logs, candidate receipts, RA06/RA11c/RA17 contracts and claim limits, then run child c1–c8 and parent c1–c7 deterministic refinement plus fresh isolated critic and judge review. Complete parent RA06 task 3.1 only when the corrected scope passes with no critical finding; leave RA11c and RA17 unchecked.

## 3. Completion evidence

- [x] 3.1 Validate and archive this change only after the phase-completion campaign and reviews pass, write the detailed child handoff with hashes and exact commands, prepare Reflect, and verify the handoff survives child exit or restore it with a recovery receipt.
