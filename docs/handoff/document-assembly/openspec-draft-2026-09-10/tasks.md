## 0. Decisions

- [ ] 0.1 Resolve D-1 to D-8 in one sitting and record each in `.prometheus/decisions.md`
- [ ] 0.2 Hand-edit `versions.toml` for the engine pin (G-PIN)

## 1. Template package conformance (DA-1)

- [ ] 1.1 Replace `GAP`/`VOID` usage with ADR-003 semantics read from `case_evidence`
- [ ] 1.2 Convert threshold gates to QA findings; remove every evidence-state assignment
- [ ] 1.3 Replace free-text clinical fields with claim references
- [ ] 1.4 Render signatures only from a signing receipt bound to the content hash

## 2. Engine (DA-2)

- [ ] 2.1 Kind registry and class rules
- [ ] 2.2 `claim()` resolution, attribution for annotation claims, rendered-claims manifest
- [ ] 2.3 The seven schema QA checks as findings shaped for `letter_qa_results`
- [ ] 2.4 Content hash over kind version, template package digest and canonical bytes
- [ ] 2.5 Claim markers for model prose, only if D-2 selects hybrid

## 3. Schema (DA-3) — after G-DATA

- [ ] 3.1 Assign lane and privacy class for kinds, template packages and letter bodies
- [ ] 3.2 Additive `document_kinds` and template package tables; `letters` kind reference; backfill

## 4. Host integration (DA-4) — after ra-15 and ra-16

- [ ] 4.1 `aso-host` documents port and `draft_document` command
- [ ] 4.2 One transaction: letter, claims, QA results, audit event
- [ ] 4.3 HTTP route and Tauri command parity; actor-free bodies

## 5. Export (DA-5)

- [ ] 5.1 Backend per D-5; two-machine reproducibility measurement (G-MEASURE)
- [ ] 5.2 Submission attachment hash and page count at transmission

## 6. Extensibility proof (DA-6)

- [ ] 6.1 Peer-to-peer briefing kind (internal work product)
- [ ] 6.2 Patient task kind (patient-facing)

## 7. Governance (DA-7)

- [ ] 7.1 `publish_template` capability and two-person approval
- [ ] 7.2 Immutability of a template package once an approved letter uses it
