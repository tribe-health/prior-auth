# RA-01 acceptance 2.2 — untrusted hints and explicit refusal states

2026-09-06. Runtime-architecture Execute, driver task 6 of 8.
Result: **Passed** for acceptance 2.2. RA-01 remains in progress.

The existing mounted results satisfy the stated scenario. All 18 tracked
implementation/design hashes and both source evidence hashes still match those
verified for acceptance 2.1. This is acceptance of recorded T1 evidence, not a
new runtime execution or a claim about current service availability.

## Acceptance mapping

| Scenario | Boundary and observed result |
| --- | --- |
| Identity headers without a credential | Gate → ASO: `spoof_without_credential` returns 401 with `unauthenticated`. |
| Forged identity, practice and role headers with A's valid credential | Gate → ASO: `spoof_with_A_credential` returns 200 with A's authoritative summary and database context, not the supplied B identity or administrator role. |
| Unauthorized practice selection | Gate → ASO: both `A_foreign_practice` and `B_foreign_practice` return 403 with `practice_denied`. |
| Untrusted role traits | Actual ASO HTTP composition with controlled provider: administrator/service/foreign-practice/all-permissions traits leave the verified user, home practice and database capabilities unchanged; the foreign practice request returns 403. |
| Anonymous request | Gate → ASO: `anonymous` returns 401, including during the injected provider outage. |
| Provider unavailable | Gate → ASO: A and B requests return 503 with `session_unavailable`; B returns 200 after recovery. The direct mounted provider test independently verifies this mapping. |
| Invalid session versus reauthentication | Direct mounted provider tests distinguish 401 `unauthenticated` from 403 `reauthentication_required`, with the exact reauthentication body checked. |
| Mixed distinct credential sources | Gate → ASO: A's Bearer plus B's X-Session-Token returns 401. |

The scripts assert exact sanitized response values and error bodies, not only
status codes. All selected responses are no-store. The
[acceptance JSON](task-6-acceptance.json) contains 16 named observations, source
hashes and expected error bodies. A valid request containing forged hints can
succeed for its verified scope; those hints confer no additional authority.

## Actual commands and prerequisites

Prior primary T1 run, completed `2026-09-06T17:54:05.039223+00:00`:

```text
RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-gateway.py
exit 0; result Passed; 36 checks; 34/34 responses no-store
```

The run used the actual ASO binary, existing Gate image, real Kratos v26.2.0,
and PostgreSQL on detected port 55432 with a restricted disposable login. The
Gate image ID and successful prerequisite observations are bound in the receipt.
A forwarding proxy injected provider failures without stopping shared Kratos.
The count includes 33 Gate responses plus direct app readiness.
[Gate evidence](gateway-session.json).

Prior supporting T1 run, completed `2026-09-06T16:28:18.894660+00:00`:

```text
RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-context.py
exit 0; result Passed; 41 checks; 37/37 responses no-store
```

This includes the controlled provider-trait, unavailable-provider and
reauthentication scenarios on the actual mounted ASO composition. It proves
traits are ignored at that boundary; it does not claim Kratos permits clients
to edit those traits. [Direct mounted evidence](context-session.json).
Both runs recorded successful cleanup of their owned resources.

T0 this task: verify 18 source hashes and two evidence hashes, assert all 16
selected status/no-store outcomes and cleanup results, validate JSON/local links,
and run scoped diff and OpenSpec strict validation. No T1 rerun or T2/T3 was
needed for unchanged code. Earlier guard mutation proofs remain unchanged.

## Changes and remaining limits

Independent artifact-critic review found no concrete false claims or evidence
gaps for acceptance 2.2. It compared the recorded receipts and assertion code,
including the distinction between controlled provider tests and real Kratos
behavior. Review was read-only; no tests were rerun. Complete-change QA remains
task 3.1.

Only `task-6.md` and `task-6-acceptance.json` are added for acceptance mapping.
`openspec/changes/ra-01-verified-session/tasks.md` completes 2.2 through KBD;
generated projections and the append-only session log record the boundary.
No application code, tests, dependencies, unrelated implementation or guards
were added. The existing refusal checks trace to the explicit credential and
tenant authority requirements.

The uncomfortable limit remains Gate's collapse of repeated same-name credential
headers. Mixed distinct sources are tested; duplicate-header rejection parity
with direct ASO HTTP is not certified. This acceptance covers the stated forged
hint/practice and unavailable-provider scenario, not every transport edge case.

Native UI/IPC, HTTP-disconnect propagation, complete production configuration
and deployment, and full-change QA remain unverified. Acceptance 2.3 and completion
3.1 remain pending. No archive, commit, publication or live resource mutation
occurred in this task.
