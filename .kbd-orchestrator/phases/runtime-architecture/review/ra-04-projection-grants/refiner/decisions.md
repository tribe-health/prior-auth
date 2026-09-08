# Refinement decisions

- Treat synthetic mounted Gate execution as integration evidence, not proof of project deployment configuration.
- Assign live FRF/Electric delivery to RA05 and graph navigation consumption to RA14.
- Keep desktop IPC and browser rendering outside the Passed claim because no active native registration or rendered browser run was observed.
- Use the task-10 inventory as the current hash authority; earlier task receipts remain historical observations.

## Adversarial review resolution

- Added an independent human-principal check at the mounted ASO grant handler after a new negative test proved an injected non-human session received HTTP 200.
- Corrected RA04 outcome 4 to the producer/projection/route boundary actually proved; assigned the committed live transition to RA05 without adding a new canonical task.
- Required RA05 to pass a real Gate-minted asymmetric token through the configured FRF issuer and audience before live composition can be certified.
- Confirmed the removed cases router contained only the documented actor-less evidence-count endpoint.
- Confirmed production FRF config already rejects a missing issuer; the optional verifier constructor remains for explicit development/test use.
- Added the shared Gate clinical authorization module to the next review packet so credential and callback helpers are reviewable.

## Second adversarial review resolution

- Trimmed cookie keys and rejected wholly blank credential header values at the ASO boundary after a focused negative test failed.
- Restored optional/legacy token IDs for non-replica FRF lanes while requiring a UUID token ID whenever ASO replica claims are present. The compatibility test failed before the correction and the full identity suite passed afterward.
- Retained per-request fail-closed rejection for replica-hook auth/mint conflicts; startup configuration lint remains a non-blocking future hardening suggestion outside RA04 acceptance.

## Third adversarial review resolution

- Added the same independent expiry and human-principal checks to `/api/session`; the focused injected-port test failed at HTTP 200 before restoration.
- Documented `/api/session/replica-grant` as an internal Gate callback that is deliberately absent from the client-facing route table.
- Mapped Gate replica denial and unavailable outcomes to typed, no-store, credential-varying responses. The mounted fixture failed before the mapping and passed 19 checks after restoration.
- Retained startup lint for replica auth/mint conflicts as a future hardening suggestion; current request handling remains fail-closed and no project route enables the hook.

## Final convergence

- Accepted the final PASS verdict with two non-blocking suggestions. The malformed-practice 400 label remains a truthful HTTP failure but uses a broad denial code; guard extraction would refactor three currently tested call sites without changing behavior. Neither is required by RA04 acceptance.
