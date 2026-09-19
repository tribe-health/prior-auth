# Web-02 task 3.1 — completion evidence

Result: Passed at the Web-02 focused boundary.

## Mounted production path

The production browser composition is connected:

1. `web/src/main.tsx` mounts `SessionProvider` and `RouterProvider(appRoutes)`.
2. `app-routes.tsx` mounts protected routes inside `GraphProvider`.
3. `/`, `/cases/:caseId`, and `/cases/:caseId/intake` lazy-load the queue, dashboard, and intake route modules.
4. Those route modules mount `CaseQueue`, `CaseDetail`, and `CaseIntake`.
5. The components call committed PEM selectors, scoped Zustand view hooks, and `useCaseCommand`; they contain no direct HTTP, PGlite, or PEM mutation.
6. `caseApi` sends create, read, update, status transition, and command lookup to `/api/cases` contracts.
7. `aso_server_axum::api_router` merges `routes::cases::router()`, which mounts those collection, detail, transition, and lookup paths over shared `AppServices`.

The source-level mounted-caller command checked nineteen links and printed `Passed: 19/19 mounted caller checks`. Its full output is retained in `task-6-mounted-callers.log`.

## Commands and observed output

Browser behavior and boundaries, run after the final product-code repair:

```text
NODE_OPTIONS='--max_old_space_size=4096 --no-experimental-webstorage' npm test -- --run <the 16 files listed in task-5-review-findings-resolution.md>

Test Files  16 passed (16)
Tests       59 passed (59)
```

```text
npm run typecheck
tsc --noEmit
exit 0

npm run lint
oxlint
exit 0
```

```text
cargo test -p aso-host projection::tests
3 passed; 0 failed

cargo test -p aso-server-axum session::tests::mounted_registry_derives_two_practice_grants
1 passed; 0 failed

cargo test -p frf-gateway --features shape-facade --test shape_projection_grant
3 passed; 0 failed
```

Production web build at this completion boundary:

```text
cd web && npm run build
tsc -b && vite build
2345 modules transformed
✓ built in 2.79s
exit 0
```

The build retained non-fatal PGlite dependency warnings about browser-external Node filesystem exports, dependency `eval`, and the main chunk exceeding 500 kB. These do not prove an actual browser run; Web-17 still owns runtime and full-scenario certification.

Quality gates:

```text
python3 .refiner/artifacts/web-02-case-publication-ui/rebuild.py
Passed: 12 artifact constraints
Passed: 46 source files copied
Passed: strict OpenSpec validation

openspec validate web-02-case-publication-ui --strict
Change 'web-02-case-publication-ui' is valid
```

The final distinct-model adversarial review returned `PASS` with 0 critical findings, 1 retained warning, and 0 suggestions. The warning concerns the earlier RA15 annotation projection and does not widen Web-02.

## Documentation and specification delta

- `openspec/changes/web-02-case-publication-ui/specs/case-publication-ui/spec.md` now names the exact summary projection, mounted browser workflow, committed command confirmation, isolated responsive interaction state, and memory-only materializer refusal.
- `docs/architecture/web-case-to-letter-contract.md` now records the production mount chain, authorized detail confirmation, uncertain-command target retention, storage refusal, and the explicit Web-03 through Web-17 remainder.
- `README.md` now records the observed production web build while leaving the complete browser scenario unverified.

## Scope boundary

Web-02 delivers case summary publication plus browser queue, create, dashboard, intake edit, and valid status transition. It does not claim administering-entity resolution, document upload/processing, criteria selection, evidence assembly, initial authorization letter generation, denial ingestion, response letters, or actual-browser certification. Those remain ordered Web-03 through Web-17 work. No Tauri or mobile source was added or certified.
