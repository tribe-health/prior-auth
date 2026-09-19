# web-00 task 6 completion evidence

Date: 2026-09-17
Phase: `runtime-architecture › web-case-to-letter`
Change: `web-00-workflow-contract`
Task: `3.1`
Result: **Passed**

## Delivered boundary

`web-00` delivers the normative browser-first workflow contract, compatible
design schema and reversible criteria cutover, capability reconciliation,
focused PostgreSQL probes, three standalone positive workflows, four isolated
negative controls, locked expected outputs, and the deterministic verifier.
Every downstream `web-01` through `web-17` change has named inputs and outputs.

This is intentionally a contract boundary. A focused search for its fixture,
contract, migration, selected-practice helper, and same-case claim constraint
under `crates`, `web`, `desktop`, `migrations`, and `docker` returned exit 1
with no matches. No product runtime caller exists yet, and no mounted browser
behavior is claimed. The executable consumers at this boundary are the fixture
verifier, artifact rebuild, OpenSpec validation, and disposable PostgreSQL 18
schema/probe runs. `web-01` through `web-16` must implement and mount the
contract; `web-17` must run the unchanged actual-browser campaign.

## Files changed

- `docs/architecture/web-case-to-letter-contract.md` freezes lifecycle,
  provenance, selected-practice, command, privacy, invalidation, fixture, and
  downstream contracts.
- `docs/architecture/fixtures/web-case-to-letter/*` freezes synthetic inputs,
  outputs, hashes, signatures, generation seams, UUID transforms, and the
  executable verifier.
- `docs/design/schema/schema.sql` supplies compatible selected-practice and
  same-case provenance constraints used by the focused contract probes.
- `docs/design/schema/schema-web-case-to-letter.sql` and its rollback define
  the reversible criteria cutover.
- `docs/design/schema/schema-web-capabilities.sql` reconciles named workflow
  capabilities and removes administrator submission authority.
- `docs/design/schema/schema-web-authority-checks.sql` and
  `schema-web-letter-flow-checks.sql` prove the new authority and identity
  constraints.
- `docs/design/schema/schema-ai-checks.sql` now uses the canonical seeded policy
  type and supplies the required claim `case_id`.
- Architecture and ADR references state the browser-first execution order.
- `openspec/changes/web-00-workflow-contract/*` records the accepted capability
  and task boundary.

## Added work outside the request

None. The SQL changes directly support the frozen workflow and close observed
review defects. No Tauri runtime, Flutter/mobile, dependency version, payer
transport, external inference, or production deployment work was added.

## Guards and observed failures

- Signature, client-generated-claim, and UUIDv5 guards each failed under a
  controlled mutation and passed after restoration.
- Selected-practice authority was tested with one surgeon holding membership
  in both practices while only practice A was selected; acts against practice B
  were refused.
- Same-case provenance attempted to attach a practice-local document from a
  different case and observed a foreign-key refusal.
- Existing clinical, PHI, immutable-criteria, audit, and three-evidence-state
  guards retain their named failure scenarios.

## Remaining unverified

The browser product workflow remains unimplemented and unverified. Case
commands, responsive case views, uploads, processing, payer/entity resolution,
criteria selection, evidence assembly, request-letter generation, denial
ingest/classification, response-letter generation, and browser certification
belong to `web-01` through `web-17`. Safe browser update handling belongs to
`ra-20`, and assembled browser certification belongs to `ra-22`.
