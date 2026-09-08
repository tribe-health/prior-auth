## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (ra-15-attributed-annotations), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Implement document-level authorization and bounded source delivery with HTTP/native parity and no private service-worker cache. Verification: An authorized citation opens its source at a known page/date must produce this observed outcome: The preview uses the audited byte service, presents provenance and keyboard/focus controls, and respects bounded fetch behavior.
- [ ] 1.3 Add source-preview model/actions and accessible adaptive composition using current shadcn primitives and generated layout tokens. Verification: A forbidden document is requested or logout occurs during fetch/render must produce this observed outcome: Access is denied or aborted; bytes/handles/object URLs are released and old content never appears in a new scope.
- [ ] 1.4 Verify forbidden source access, logout during fetch, URL cleanup, 320/600/1200/1440px resize, focus and reduced-motion interruption. Verification: The viewport crosses mobile/desktop thresholds or reduced motion changes must produce this observed outcome: Dialog/sheet adapts without duplicating editors; focus returns correctly, navigation remains reachable, safe areas and 44px touch targets hold.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when An authorized citation opens its source at a known page/date, then The preview uses the audited byte service, presents provenance and keyboard/focus controls, and respects bounded fetch behavior. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when A forbidden document is requested or logout occurs during fetch/render, then Access is denied or aborted; bytes/handles/object URLs are released and old content never appears in a new scope. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when The viewport crosses mobile/desktop thresholds or reduced motion changes, then Dialog/sheet adapts without duplicating editors; focus returns correctly, navigation remains reachable, safe areas and 44px touch targets hold. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
