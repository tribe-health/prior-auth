## 1. Shared fence

- [x] 1.1 Implement least-privilege ASO snapshot/outbox consumption with a durable cursor, 250 ms high-water probe and process-local readiness.
- [x] 1.2 Add version-stamped L1/L2 entries and atomic compare-and-publish/invalidate operations; preserve tenant-qualified keys.
- [x] 1.3 Require a fresh ASO authority-fence decision for every protected authorization and disable caches on lag, Redis loss or regression.

## 2. Distributed proof

- [x] 2.1 Run two Gate instances against Redis/Postgres and prove stale refill, duplicate/reordered/lost events and cross-tenant collisions cannot restore authority.
- [x] 2.2 Prove a consumer stalled after bootstrap, Redis partition, empty restart and restored old snapshot force cache bypass until gap-free replay completes.

## 3. Completion evidence

- [x] 3.1 Run Gate T0/T1 locally; sabotage atomic publication and observe stale-resurrection proof fail, restore it, then run artifact-refiner and isolated adversarial review.
