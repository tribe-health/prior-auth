## 1. Candidate freeze

- [x] 1.1 Confirm `ra06d-01-repair-completion-ownership` is archived, validate scope, enumerate dirty/untracked inputs, and record the prior digest as stale and prohibited for new evidence.
- [x] 1.2 Implement and repair the candidate freeze pipeline so it binds exact source, configuration, toolchain, lockfile, fixture, image, prebuilt executable and build-attestation identities. Cover it with focused syntax and unit checks; do not execute the phase acceptance campaign here.

## 2. Phase-boundary evidence tooling

- [x] 2.1 Implement the immutable replay pipeline for all 12 candidate-bound receipt roles: manifest precheck, T0, T1, strict OpenSpec, Gate build, ASO build, image build, live four-trigger, mounted two-Gate fault, recovery/lease, responsive UI fence and RA11c open obligation. Its execution belongs to the child phase-completion gate in `ra06d-03-parent-recertification`.
- [x] 2.2 Implement the evidence-index, packet, post-campaign validation and deterministic-refiner tooling so every prerequisite, log, output, effective configuration and transitive harness dependency is hash-covered. Reject partial, stale, premature and mixed-digest receipt sets.

## 3. Implementation closure

- [x] 3.1 Preserve candidate `sha256:280353f94999e118c0f58ecb068a6a4067d945cf709433e0781e841c724e72ff` and its seven completed receipts as premature and non-certifying. Reconcile the child plan and both changes so all Tier 2 and full-integration execution occurs once in `ra06d-03-parent-recertification` after implementation closes. Run only focused syntax/unit checks and strict OpenSpec validation, then archive this implementation change.
