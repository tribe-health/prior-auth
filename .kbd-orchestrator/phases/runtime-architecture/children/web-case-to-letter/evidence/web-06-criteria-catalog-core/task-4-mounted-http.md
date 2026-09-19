# Web-06 task 1.4 — mounted criteria catalog HTTP

Result: **Passed** at Tier 1.

## Delivered boundary

- Mounted the frozen browser contracts for catalog import, list, criterion read,
  and uncertain-command lookup in the production Axum router.
- Reused the shell-neutral `ImportCriteriaCatalogCommand` and AppServices
  results directly, keeping the browser and service payloads identical.
- Required verified human sessions and `configure` for import/lookup. Catalog
  reads accept `configure`, `case:read`, or `criteria_select` and preserve the
  selected-practice boundary.
- Added stable HTTP refusals for stale revision, changed command reuse,
  overlapping validity, invalid provenance, invalid grade, tenant denial, and
  unavailable service. Protected responses carry `Cache-Control: no-store`.
- Extended the existing disposable-PostgreSQL lifecycle through the actual
  production router, verified session resolution, `AppServices`, and the
  restricted runtime login.

## Observed verification

- `RUSTC_WRAPPER= cargo check -p aso-web-server`: exit 0.
- `RUSTC_WRAPPER= cargo clippy -p aso-web-server --no-deps`: exit 0 with the
  pre-existing `chunks_exact_to_as_chunks` warning in `adapters/gate.rs`.
- `RUSTC_WRAPPER= cargo clippy -p aso-server-axum --no-deps`: exit 0 with the
  existing large-`Response` result warning pattern, including the new route.
- `cargo fmt --all -- --check`: exit 0.
- `python3 -m py_compile scripts/test-web06-criteria-service.py`: exit 0.
- Scoped `git diff --check`: exit 0.
- Fresh disposable database receipt: `Passed`. The mounted lifecycle emitted
  all eight required service and HTTP markers; 1 test passed, 0 failed.
- Populated-upgrade database receipt: `Passed` with the same eight markers;
  legacy rows, evidence identifiers, user data, hashes, effective ranges, and
  deterministic timestamps survived migration.
- Both runs proved exact retry and lookup parity, changed-command conflict,
  local obtained-row visibility, foreign-practice exclusion, foreign direct
  read as 404, grade non-promotion, and overlapping validity as 409.

Raw receipts:

- `task-4-fresh-http.json`
- `task-4-upgrade-http.json`

## Observed failures and repair

- The first T0 check stalled in `sccache` on an unchanged dependency. The same
  check completed with `RUSTC_WRAPPER` disabled; source and dependency state
  were unchanged.
- The first test-target compile failed because `ClinicalContext` is
  intentionally non-cloneable. The fixture now resolves each synthetic session
  from its source identity instead of copying authority state. The rebuilt
  target and both integration runs passed.

## Guard provenance and remaining scope

Session, capability, tenant, command-id, provenance-grade, and effective-range
checks implement frozen Web-00 contracts and existing trust boundaries. No
fallback, retry loop, or speculative validation was added.

The uncomfortable limit is visible: these routes make the catalog available to
the browser, but there is still no criteria-selection UI or case-bound snapshot.
Web-07 owns that behavior. The complete browser scenario remains uncertified
until Web-17. Tauri and mobile remain deferred and were not changed.
