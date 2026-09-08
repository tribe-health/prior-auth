# RA04 projection grants completion report

## Result

**Passed** at the applicable T0/T1 and local synthetic integration boundary.

RA04 establishes a fixed, server-owned five-projection grant. The ASO session route derives it from a verified membership, Gate resolves that grant and mints typed claims when the dedicated hook is configured, and FRF verifies and re-authorizes those claims before shape facade access. Callers cannot supply relations, predicates, columns, identity traits, or token claims that broaden the grant.

## Delivered contract

The projection revision is `1`. It includes `cases`, `case_evidence`, `evidence_states`, `evidence_citations`, and `documents`. Four clinical record projections bind `practice_id` to the selected verified practice. `evidence_states` is the explicitly approved reference projection and uses `key` as both its primary and approval key. Metadata absent from the registry remains protected. `cases.gate_affirmed_at` is included as a nullable entity field; actor identity is excluded.

The ASO router mounts `GET /api/session/replica-grant`. The handler accepts only a practice selection, resolves the current credential through the session service, independently refuses expired and non-human sessions, and constructs the registry from the sanitized session. Gate's middleware calls the dedicated replica grant minter, rejects simultaneous generic mint configuration, and refuses access when its required minter is absent. FRF's `GET /v1/shape` route verifies the token, requires the ASO replica scope, resolves an authorized request on every initial or continuation request, and only then calls the facade.

Fresh and upgraded PostgreSQL fixtures ran under a non-owner, `NOSUPERUSER`, `NOBYPASSRLS` login. They proved that forged `practice_id` values are overwritten from authorized parents, permitted parent transfers cascade through the tested children, cases RLS refuses an unowned practice, and the three-state reference table remains `gap`, `met`, `void` without an invented practice trigger.

## Verification evidence

After adversarial review exposed a handler-level principal gap, a focused mounted test first failed with HTTP 200 for a non-human principal. A later review exposed whitespace-confusable duplicate cookies and blank native-token input; the focused parser test failed before the key/value trimming fix and passed after restoration. Both mounted session routes now reject expired, agent and service results independently: the current-session test first observed HTTP 200 instead of 401, then passed after the same guards were applied. The restored grant handler returns HTTP 403 for agent and service principals; its Rust format, check, Clippy and four mounted session tests then passed. The final Rust T0 checks passed for `aso-host`, `aso-server-axum`, `aso-desktop`, `flint-gate-core`, `frf-ports`, `frf-identity-ory`, and the FRF shape-facade target. Focused tests passed: ASO projection 3/3, ASO session 4/4, desktop session contracts 4/4, Gate replica policy 2/2, Gate typed mint 1/1, FRF identity 9/9, FRF mounted shape 3/3, and two shape widening tests 1/1 each. The web TypeScript typecheck and lint exited zero; lint repeated one pre-existing `prefer-string-starts-ends-with` warning in `replica-rebuild.test.ts`.

The current Gate binary passed a 19-check mounted synthetic campaign. Replica denial and unavailable responses now include typed JSON errors plus `Cache-Control: no-store` and credential-sensitive `Vary`; the added fixture checks failed before that response mapping and passed after restoration. Only the valid human session reached downstream; denial, unavailable membership, mixed credentials, a service principal, mismatched session linkage, forged inputs and a missing minter did not. Fresh and upgrade transaction fixtures both returned `Passed`, with 16 and 22 named checks and 18 lifecycle assertions, respectively. The practice derivation fixture returned 10/10 checks in both fresh and upgrade modes. Every disposable process, login and database reported cleanup.

## Caller and deployment truth

The ASO route is mounted in the application router. The project Gate route table deliberately does not expose `/api/session/replica-grant` to clients; a future configured claims-enhancement hook calls it as an internal callback and clients receive the authorized FRF facade response. Gate's middleware hook is implemented and was exercised in the actual Gate process using synthetic configuration. The checked project deployment file does not enable `aso_replica_grant`, so RA04 does not claim that the deployed stack currently mints replica tokens. FRF now keeps the legacy optional token ID for non-replica lanes while requiring a valid UUID token ID whenever any ASO replica contract claim is present. Its new compatibility test failed while `jti` was globally mandatory, then the complete identity suite passed 3 unit and 7 verifier tests after the scope correction. Production FRF configuration already refuses a missing JWT issuer, confirmed by its focused config test. The FRF route is compiled only with `shape-facade`; the live Gate-to-FRF-to-Electric exchange and deployment topology belong to RA05. RA05 now explicitly requires a real Gate-minted asymmetric token to pass the configured FRF issuer and audience before it can certify the live composition. The desktop function is a wrapper contract without active Tauri command registration. The web shell still returns a fail-closed placeholder for graph-backed gate navigation; RA14 owns the consuming selector.

The RA04 outcome for `gate_affirmed_at` is bounded to the authoritative producer, approved projection, mounted route preservation and navigation handoff. RA05 owns the committed transition through the live Electric stream.

The uncomfortable constraint is that this change can be correct at each mounted boundary and still deliver no realtime records in the current deployment. Enabling the deployment path and certifying the live Electric exchange remain explicit later work.

## Limits

G-DATA approval for persistent real clinical data was not granted or used. Broad phase T2, release T3, production deployment, browser rendering, Tauri IPC, Tauri windows and physical-device behavior were not run. These surfaces remain **Build-only** or unverified according to their existing project status; this report does not promote them.
