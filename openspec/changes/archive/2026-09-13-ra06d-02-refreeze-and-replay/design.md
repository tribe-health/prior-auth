## Context

The original stale candidate digest is
`sha256:5e8584e7dbb6922c6d6836af96d1188a7b65b579d3b6f2ddb6204ea8d247d664`.
Candidate `sha256:280353f94999e118c0f58ecb068a6a4067d945cf709433e0781e841c724e72ff`
was later started before the child implementation boundary and stopped after seven non-live
roles. Both evidence sets remain historical and cannot be relabelled or reused.

## Decisions

- Complete the freeze implementation before acceptance execution. It binds tracked and
  non-ignored untracked source, modes, symlink targets, lockfiles, toolchains, exact sanitized
  configuration identity, secret keyed identities, synthetic fixture identity, image IDs,
  prebuilt executables and build attestations.
- Complete the replay implementation for exactly 12 receipt roles: manifest precheck, T0, T1,
  strict OpenSpec, Gate build, ASO build, image build, live four-trigger campaign, mounted
  two-Gate faults, recovery/lease faults, responsive UI fencing, and RA11c open obligation.
- Defer execution of those roles until `ra06d-02-refreeze-and-replay` is archived and
  `ra06d-03-parent-recertification` reaches the child phase-completion gate. Validate the final
  manifest before replay and after the last acceptance command.
- Use one conservative outer monotonic deadline for each bounded scenario through correlated FRF
  terminal observation and denial of a subsequent protected request.
- The evidence-index and packet tooling refuses stale, premature, partial, or mixed-digest
  receipts. The phase-completion gate builds the index only after logs close.
- The complete review packet contract includes all source and untracked inputs, every transitive
  harness dependency, the parent dependency plan, RA06/RA11c/RA17 contracts, receipts, evidence
  index, build attestation and deterministic output.

## Limits

This change proves the tooling through focused syntax and unit checks. It makes no runtime,
integration, or certification claim. The later phase-completion candidate remains limited to
server-produced frame cancellation and synchronous React/Zustand DOM/store fencing; it does not
prove recall of network bytes, WebView paint timing, a working RA11c producer, or native
credential activation.
