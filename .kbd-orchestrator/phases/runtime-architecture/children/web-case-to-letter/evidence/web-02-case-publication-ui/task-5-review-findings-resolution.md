# Web-02 adversarial findings resolution

## Revision-6 migration on populated rows

Disposition: rejected as inapplicable to the mounted runtime.

Web-02 advances `graphStorageKey` from generation 3 to generation 4 at the same time it introduces the revision-6 case-summary migration. A populated generation-3 database therefore has a different IndexedDB namespace and is never opened by the revision-6 runtime. The generation-4 database begins empty; the migration ledger applies the complete checksummed plan transactionally before shape sync can populate it. `graph-storage-key.test.ts` now pins the expected `g4` namespace so a future schema edit cannot quietly turn this into an in-place migration. A test that inserts rows into a revision-3 database and directly runs revision 6 would exercise a path the application does not mount.

## Durable annotation bodies

Disposition: accepted and repaired.

The annotated projection and RA11c materializer are approved only for memory-only browser qualification. `assertMaterializerStoragePolicy` now rejects the experimental materializer combined with persistent storage. `GraphProvider` runs that guard before PGlite opens. The pure policy test first failed because the guard was absent, then passed after implementation; the mounted startup test proves the invalid combination publishes an error without opening the database. Persistent storage remains usable while the experimental materializer is disabled.

## Focused requalification

The exact browser command was:

```text
NODE_OPTIONS='--max_old_space_size=4096 --no-experimental-webstorage' npm test -- --run \
  src/shared/sync/case-summary-materialization.test.ts \
  src/shared/sync/pglite-schema.test.ts \
  src/shared/sync/catalog-conformance.test.ts \
  src/shared/sync/storage-policy.test.ts \
  src/features/case-queue/hooks/use-case-detail.test.tsx \
  src/features/case-queue/components/case-queue.test.tsx \
  src/app/routes/app-routes.test.tsx \
  src/features/case-queue/components/case-form.test.tsx \
  src/app/shell/app-shell.test.tsx \
  src/app/providers/graph-provider-startup.test.tsx \
  src/features/case-queue/hooks/use-case-command.test.tsx \
  src/features/case-queue/hooks/use-case-queue-view.test.tsx \
  src/app/providers/graph-storage-key.test.ts \
  src/features/case-queue/hooks/use-case-projection.test.ts \
  src/shared/sync/replica-wiring.test.ts \
  src/features/case-queue/api/case-api.test.ts

Test Files  16 passed (16)
Tests       59 passed (59)
```

Node 26's experimental global web storage had shadowed JSDOM in an earlier attempt; disabling that Node experiment restored the configured JSDOM storage without a source change. `npm run typecheck` and `npm run lint` both exited 0.

The exact Rust commands were:

```text
cargo fmt --check -p aso-host -p aso-server-axum
cargo test -p aso-host projection::tests
cargo test -p aso-server-axum session::tests::mounted_registry_derives_two_practice_grants

projection::tests: 3 passed; 0 failed
mounted_registry_derives_two_practice_grants: 1 passed; 0 failed
```

The companion FRF command was:

```text
cargo fmt --check --all
cargo test -p frf-gateway --features shape-facade --test shape_projection_grant

shape_projection_grant: 3 passed; 0 failed
```

## Foreign-practice sabotage and restoration

The practice equality check in `projectCaseQueue` was temporarily removed and the following exact focused command was run:

```text
npm test -- --run src/features/case-queue/hooks/use-case-projection.test.ts

Test Files  1 failed (1)
Tests       1 failed | 4 passed (5)
Expected: "error"
Received: "ready"
```

The source was restored byte-for-byte and the same command then reported:

```text
Test Files  1 passed (1)
Tests       5 passed (5)
```

The full observed outputs are retained in `task-5-foreign-practice-negative-control.log` and `task-5-foreign-practice-restored.log`.

## Artifact refinement and adversarial review

The deterministic artifact command was:

```text
python3 .refiner/artifacts/web-02-case-publication-ui/rebuild.py

Passed: 12 artifact constraints
Passed: 44 source files copied
Passed: strict OpenSpec validation
```

The isolated review used `build-review-packet.sh --mode diff` followed by `dispatch-judge.sh --mode diff`. The cross-model judge was `gpt-5.5`; the producer was `gpt-6-astra`; `cross_model_check` was `verified-distinct`. Pass 2 found the two storage/migration concerns resolved above. Pass 3 confirmed the repaired product diff but lacked the separately saved task receipts and incorrectly treated pending task 3.1 as part of task 2.1. The final packet includes these receipts and explicitly scopes the review to current task 2.1. The sycophancy screen passed at score 0.0.

## Route warning disposition

The pass-3 warning about `/login` redirect is rejected by mounted behavior. `createSessionStore` sets `session: null` when the logout-pending control is present, so `PublicRouteBoundary` does not redirect. The focused `app-routes.test.tsx` case supplies both an authenticated startup session and `aso:logout-pending:v1`; it renders `Server sign-out pending` and proves that neither the database nor shape subscription starts.

## Command-confirmation findings

The scoped pass-5 judge found two real defects. Summary-only fingerprints could confirm a case update without verifying `memberId`, `facilityId`, `procedureCode`, `planKey`, or `data`, and an uncertain lookup derived its expected revision/status from the current projection rather than the submitted command.

Two focused tests first failed: the stale protected-field case received `confirmed` instead of `conflict`, and the uncertain transition remained `awaiting-projection` instead of confirming the already-projected submitted target. The runtime command now stores its expected revision, status, summary fingerprint, and full detail fingerprint before transport. Create/update confirmation waits for the summary projection and an authorized `caseApi.read`; uncertainty retains the same expectation; reconciliation reuses it. The focused hook then passed 5/5, and the complete Web-02 browser set passed 59/59.

## Current task boundary

This receipt closes only Web-02 task 2.1. Task 3.1 remains intentionally pending; it owns final mounted-caller confirmation, architecture/spec delta recording, and change completion. Requiring task 3.1 in this review would violate the KBD one-task-per-turn contract.
