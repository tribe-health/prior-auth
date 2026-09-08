# RA-03 task 1.2 — verified-context signing

2026-09-06. Runtime-architecture / Execute. Driver task 2 of 8.
Result: **Passed** for this implementation unit. RA-03 remains in progress.

## Delivered behavior

The HTTP signing body now contains only `commandId`,
`expectedLetterVersion`, `expectedQaRevision`, and
`expectedSignatureVersion`. Unknown fields are rejected, so a submitted actor,
identity, practice, principal or signature ID cannot grant authority. The route
resolves the raw credential and optional practice into a fresh
`ClinicalContext` and returns typed, sanitized, `no-store` responses.

`AppServices::execute_sign_letter` independently requires an unexpired human
principal, current `sign_letter` authority, matching letter/QA/signature
revisions, the current approved revision approved by that actor, a complete
surgeon gate, complete QA with every blocking check passed, and complete
sources. It rechecks context and authority before the repository write.

The checksummed `2026090602_durable_signing.sql` migration adds QA revision
binding, an immutable signing command ledger, least-privilege command functions,
approved-letter body/QA/source immutability, and an independent signing trigger.
The PostgreSQL transaction locks case, letter and current signature state,
selects the signature from verified actor state, and writes one signed letter,
one audit event and one command result. Signable claims require a scoped patient
document, page, effective date, content hash and valid page count. An
annotation-only claim is refused until the schema distinguishes generated
assertions from surgeon-authored prose.

Gate configuration applies `aso_clinical_authorize` to
`POST /api/letters/*/sign`. The read-only callback freshly requires the
session's `sign_letter` capability and verified letter scope without invoking
the mutation. The desktop wrapper accepts the same actor-free mutation and
returns `NativeAuthenticationUnavailable` until RA-17 supplies a trusted native
credential owner.

ADR-002, ADR-009 and the application runtime architecture now describe this
bounded delivery. They leave service replay and explicit result lookup to task
1.3 and rollback injection/removal of remaining production memory paths to task
1.4.

## Verification and observed output

Tier 0 passed for the touched Rust crates:

- `RUSTUP_TOOLCHAIN=1.97.1 cargo check -p aso-host` and
  `cargo clippy -p aso-host --no-deps`: exit 0.
- `cargo check -p aso-server-axum` and
  `cargo clippy -p aso-server-axum --no-deps`: exit 0.
- `cargo check -p aso-web-server` and
  `cargo clippy -p aso-web-server --no-deps`: exit 0. Clippy retained two
  pre-existing `default_constructed_unit_structs` warnings in unchanged memory
  repository composition at `main.rs:82-83`.
- `cargo check -p aso-desktop` and
  `cargo clippy -p aso-desktop --no-deps`: exit 0.
- `python3 -m py_compile scripts/test-signing-transaction.py`, Gate YAML
  parsing, architecture local-link/fence validation and scoped
  `git diff --check`: exit 0.

Focused Tier 1 results:

| Command | Observed result |
| --- | --- |
| `cargo test -p aso-host signing::tests` | 3 passed, 0 failed |
| `cargo test -p aso-server-axum routes::letters::tests` | 4 passed, 0 failed |
| `cargo test -p aso-desktop signing_refuses_even_when_injected_ports_accept` | 1 passed, 0 failed |
| `cargo test -p aso-web-server deployment_tests` | 1 passed, 0 failed |
| `python3 scripts/test-signing-transaction.py --install-mode fresh` | Passed; 8 signing markers; 1 Rust test passed; checksum refusal and cleanup passed |
| `python3 scripts/test-signing-transaction.py --install-mode upgrade` | Passed; legacy gate summaries/rows preserved; 8 signing markers; 1 Rust test passed; checksum refusal and cleanup passed |

The final fresh and upgrade receipts are
`signing-transaction-fresh-final-2.json` and
`signing-transaction-upgrade-final.json`. Both record source hashes matching the
restored migration and PostgreSQL test.

## Negative controls and defects found

Four relied-on guards were deliberately broken and restored:

- Removing the service letter-version comparison made the focused host test
  fail: 0 passed, 1 failed; the stale target returned `Ok` instead of
  `RevisionConflict`.
- Removing the database clinical-capability predicate made the PostgreSQL test
  fail: `SignatureConflict` appeared where independent authority required
  `Denied`. The receipt is `signing-transaction-sabotage-db.json`.
- Checking only the destination of a moved claim made the PostgreSQL test fail
  at `move_result.is_err()`. The receipt is
  `signing-transaction-sabotage-source-immutability.json`.
- Allowing annotation-only sources made the PostgreSQL test fail because
  `sources_complete` became true. The receipt is
  `signing-transaction-sabotage-document-citation.json`.

Disposable fixture failures also exposed and fixed a broken migration backfill,
a missing QA-revision update grant, a missing signature row-lock grant, and
incorrect typed synthetic document data. All failed fixtures cleaned up their
owned database/login/roles; the final fresh and upgrade fixtures passed.

## Independent review

The artifact-only critic initially returned FAIL for unreachable service replay,
the approved-source move hole, the annotation-only citation hole, and an
overstated atomicity marker. The two task 1.2 defects were fixed and tested. The
out-of-scope replay and rollback claims were removed and left on their registered
tasks. The critic's remediation verdict is **PASS** with no remaining task 1.2
finding. See `review/ra-03-task-2/critic.md`.

## Scope and remaining risk

No T2/T3, workspace test/build, release build, Tauri bundle, physical-device
run, live Kratos request or mounted Gate image was run. Source-level Gate policy
and YAML checks do not certify the deployed companion Gate binary. Desktop
signing remains intentionally unavailable. Signing service replay/result lookup
and injected transaction rollback are not delivered by this task.

No dependency version, PEM pin, production database or companion repository was
changed. `tokio` is reused from the existing workspace pin as a host test-only
dependency. No real patient data, deployment, commit or unrelated application
behavior was added. Every new guard traces to the explicit forged-identity,
stale-revision, QA/source, citation or clinical-authority requirement.
