## Context

This change implements browser runtime order 7 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). `web-17` proves the complete browser product scenario before `ra-20` adds update safety. RA22 then freezes those artifacts and certifies the assembled browser deployment. Source inspection and earlier slice evidence cannot replace this composed run.

## Goals / Non-Goals

**Goals:** Run the complete browser startup, case-to-letter, denial-response, safe-update and security scenarios with observed service and actual-browser evidence. Recheck the standing invariants, including mandatory document/page/date provenance for every included generated assertion.

**Non-Goals:** Native SQLite parity, Tauri window qualification, native updater certification, mobile certification, unrelated placeholder views, a general dependency refresh, automatic clinical replay or another graph/query-cache owner.

## Decisions

Ownership: ASO owns the local acceptance runner, evidence and phase reflection. Companion repositories provide the pinned services and artifacts already required by the browser composition.

Dependencies: `web-case-to-letter/web-17-browser-scenario-certification` and `ra-20-safe-browser-updates`. Confirm their implementation evidence before applying this change. The root OpenSpec artifact coordinates the user-named repository workspace; companion implementation runs under each repository's rules and within explicitly assigned modules.

- Freeze one browser candidate and one synthetic scenario corpus.
- Run non-skipping service checks before the actual-browser campaign.
- Exercise case creation, upload and processing, administering-entity resolution, criteria selection, met/gap/void evidence, prior request generation/review/signing, local submission acknowledgement, denial classification, and corrected resubmission plus clinical appeal response generation/review/signing.
- Exercise startup, account/practice switching, revocation, safe browser updates and recovery against the same candidate.
- Run artifact-refiner followed by isolated adversarial review, then update only genuinely satisfied completion dimensions.

Keep G-PIN, G-REV, G-DATA, G-SYNC and browser portions of G-MEASURE. G-NATIVE remains visible and deferred; it does not block a browser-only Passed result. A missing browser prerequisite blocks certification and never authorizes a default or silent pin override.

## Risks / Trade-offs

The first projected row and individual feature tests are necessary and insufficient. A browser Passed result says nothing about a Tauri window, native storage engine, native updater or physical mobile device.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Every included generated assertion must resolve a source document, page and date. Annotation and criterion links are auxiliary attribution and cannot replace that provenance.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 checks when each unit completes. Freeze the candidate before the child and RA22 assembled campaigns. At browser phase completion, run sequential Rust workspace checks, the web production build, architecture audit, local stack and supported actual-browser scenarios. CI is not test evidence. Do not run or claim native/mobile gates in this change.

Demonstrate sensitive guards fail under controlled sabotage and restore them. Run artifact-refiner and isolated adversarial review before completion/archive. A failed prerequisite leaves this change Blocked and preserves the previous authorized browser generation.
