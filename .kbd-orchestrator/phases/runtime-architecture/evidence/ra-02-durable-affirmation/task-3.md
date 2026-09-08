# RA-02 task 1.3 — mounted clinical authority

2026-09-06. Runtime-architecture / Execute. Driver task 3 of 9.
Result: **Passed** for this implementation unit. RA-02 remains in progress.

The delivery mounts durable gate operations with fresh session resolution and
an independent Gate policy callback. The plan required three separate authority
checks; the Gateway check needed a companion Flint Gate hook because its existing
identity middleware did not establish current ASO membership, capability and case
scope. The web transport update also exposed a stale reconciliation result during
independent review; lookup now refreshes current state and fences old selections.

The uncomfortable limit: the checked-in Gate configuration requires the new Gate
binary. The fixture ran a freshly built native debug executable, not the deployed
container. Desktop gate wrappers deliberately remain unavailable until RA-17 owns
native credentials. Neither this receipt nor the architecture updates certify
the complete application runtime or a mounted clinical UI.

## File-by-file delivery

ASO paths below are relative to the project root. Companion paths are relative
to `/Users/gqadonis/Projects/prometheus/flint-gate`.

| File | Change |
| --- | --- |
| `crates/aso-host/src/affirmation.rs` | Actor-free mutation DTO and typed native-authentication-unavailable error. |
| `crates/aso-server-axum/src/routes/gate.rs` | Verified read/affirm/remove/lookup routes; independent read-only authorization callback; sanitized, uncached responses. |
| `crates/aso-server-axum/src/routes/gate/tests.rs` | Ten actual router tests, including independently accepting downstream controls. |
| `crates/aso-server-axum/src/session.rs` | Reuse credential extraction and error mapping; reject duplicate Kratos session cookie keys. |
| `crates/aso-web-server/src/main.rs` | Configure durable clinical repository/authority using restricted credentials and require configured session authority. |
| `desktop/src-tauri/src/lib.rs` | Equivalent gate DTOs and four typed refusals until native credential ownership; accepting-port controls. |
| `docker/flint-gate/config.yaml` | Four clinical routes with mandatory fresh authorization hook. |
| `web/src/features/surgeon-gate/api/gate-api.ts` | Verified command/read/lookup transport with optional practice selection and no actor body. |
| `web/src/features/surgeon-gate/model/gate-state.ts` | Snapshot, mutation and receipt wire contracts plus view projection. |
| `web/src/features/surgeon-gate/hooks/use-surgeon-gate.ts` | Explicit command IDs and lookup; current-state recovery; case/practice response fencing. |
| `web/src/features/surgeon-gate/hooks/use-surgeon-gate.test.tsx` | Twelve real-hook regressions, including uncertain removal and delayed responses. |
| `scripts/test-gate-mounted.py` | Real Gate/ASO/Kratos/Postgres fixture, accepting sink, disabled-hook control and owned-resource cleanup. |
| `docs/architecture/adr-002-clinical-authority.md` | Explain current independent enforcement and staged desktop/deployment limits. |
| `docs/architecture/adr-005-navigation-and-gating.md` | Refer to the implemented gate command service method. |
| `docs/architecture/adr-007-local-first-sync.md` | Refer to the implemented gate command service method. |
| `docs/architecture/application-runtime-architecture.md` | Distinguish original assessment from implemented session and gate transport contracts. |
| `openspec/changes/ra-02-durable-affirmation/design.md` | Record the mounted policy, credentials, command transport and deployment boundaries. |
| Companion `crates/flint-gate-core/src/config/types.rs` | Typed ASO authorization pre-request hook configuration. |
| Companion `crates/flint-gate-core/src/config/lookup.rs` | Exclude fixed callback configuration from template lookups. |
| Companion `crates/flint-gate-core/src/middleware/mod.rs` | Register hook module. |
| Companion `crates/flint-gate-core/src/middleware/pipeline.rs` | Invoke fresh policy on every request before forwarding. |
| Companion `crates/flint-gate-core/src/middleware/aso_clinical_authorize.rs` | Raw credential forwarding, exact-204 decision, bounded nonredirecting callback and eight tests. |

[File hashes](task-3-files.json) capture all 22 files. Cargo.lock retains its
RA-01/task-2 SHA256. No dependency versions, PEM pins, shared database, deployed
image, real patient data, commit or unrelated product behavior changed. Evidence
files and append-only memory record the work; KBD/OpenSpec state changes only
through their driver/typed runtime.

## Observed verification

| Tier | Actual command | Observed output |
| --- | --- | --- |
| T0 | `cargo +1.97.1 check -p aso-host`; `cargo +1.97.1 clippy -p aso-host --no-deps` | Exit 0, `Finished dev profile`. |
| T0 | `cargo +1.97.1 check -p aso-web-server`; `cargo +1.97.1 clippy -p aso-web-server --no-deps` | Exit 0; two existing unit-struct-default warnings. |
| T0 | `cargo +1.97.1 check -p aso-server-axum --tests`; `cargo +1.97.1 clippy -p aso-server-axum --tests --no-deps` | Exit 0, no diagnostics; repeated after restoration. |
| T1 | `cargo +1.97.1 test -p aso-server-axum routes::gate::tests` | `10 passed; 0 failed`. |
| T0 | `cargo +1.97.1 check -p aso-desktop`; `cargo +1.97.1 clippy -p aso-desktop --no-deps` | Exit 0, no diagnostics; repeated after restoration. |
| T1 | `cargo +1.97.1 test -p aso-desktop session_contract_tests` | `2 passed; 0 failed`. |
| T0, companion | `cargo +1.97.1 check -p flint-gate-core`; `cargo +1.97.1 clippy -p flint-gate-core --no-deps` | Exit 0; three unrelated existing clippy warnings and existing non-root-profile warning. |
| T1, companion | `cargo +1.97.1 test -p flint-gate-core --lib aso_clinical_authorize` | `8 passed; 0 failed; 570 filtered out`. |
| T1 fixture prerequisite, companion | `cargo +1.97.1 build -p flint-gate` | Exit 0, native debug executable built. |
| T0 | `pnpm --dir web typecheck`; `pnpm --dir web lint` | Exit 0, `$ tsc --noEmit`, `$ oxlint`; no diagnostics. |
| T1 | `pnpm --dir web test src/features/surgeon-gate/hooks/use-surgeon-gate.test.tsx` | `Test Files 1 passed (1)`; `Tests 12 passed (12)`. |
| T1 | `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-gate-mounted.py --gate-binary /Users/gqadonis/Projects/prometheus/flint-gate/target/debug/flint-gate` | Exit 0, `Passed`; 81 checks and 17 cleanup checks. |
| T0 | `openspec validate ra-02-durable-affirmation --strict` | Exit 0, `Change 'ra-02-durable-affirmation' is valid`. |

The [mounted receipt](mounted.json) proves committed SQL results, identity-scoped
replay/lookup, conflict and actor-body rejection, browser-cookie POST replay,
native token forwarding, independent administrator/foreign-scope denial, live
capability removal, revocation and policy outage refusal. Four synthetic Kratos
identities, a disposable database/login, three Gate processes, ASO, sink and
temporary configurations were cleaned. The sink accepts requests without calling
the command service or clinical write triggers. Removing only the hook from its
owned configuration lets the same administrator through; the enabled hook refuses.

The retained [task-2 receipt](task-2.md) covers independent service and database
refusal, including direct trigger bypass tests for administrator, agent and
foreign scope. Current router tests separately refuse fresh nonhuman principals
while downstream ports accept. The live agent negative is explicitly a
non-Kratos credential; it does not certify a provisioned delegated-agent provider.

Three controlled source mutations failed at their intended assertions and were
restored byte-for-byte before final checks:

- [Callback capability](policy-guard-mutation.json): administrator 204 instead of required 403, Cargo test exit 101.
- [Desktop refusal](desktop-guard-mutation.json): unguarded access reaches accepting injected ports, Cargo test exit 101.
- [Lookup refresh](lookup-guard-mutation.json): stale affirmed state after a removed command, Vitest exit 1, one failed test.

T0 also parsed fixture Python and Gate YAML, asserted all four mandatory route
hooks, checked changed whitespace and round-tripped evidence JSON. A first
whole-file whitespace assertion rejected existing Markdown hard breaks; the
checker was corrected to preserve them without changing document formatting.

## Review, guards and remaining scope

The independent artifact critic found the stale lookup result. The corrected
source and final mounted receipt received no remaining actionable findings;
root reconciled that read-only review with the actual results. See
[review receipt](task-3-review.json). Full-change adversarial/refiner acceptance
remains the final RA-02 task.

All new guards trace to the explicit clinical/session/practice trust boundary,
credential ambiguity/disclosure, missing native credential ownership, uncertain
command responses or observed stale hook state. Callback outage/timeout refuses
forwarding, without credential-bearing redirects, environment proxies or retries.
No speculative product guard or unrequested subsystem was added.

Unverified: production container/deployment, real browser UI, physical devices,
trusted native credential ownership and provisioned delegated-agent flows.
Repeated same-name HTTP headers are covered by unit/router tests, not the live
urllib fixture. This hook is not yet mounted by the clinical UI; runtime-wide
Zustand/entity activation and session-epoch work remain later tasks. No T2
workspace/build/audit or T3 release/device gate ran at this implementation unit.
