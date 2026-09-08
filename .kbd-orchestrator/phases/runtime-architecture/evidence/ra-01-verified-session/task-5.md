# RA-01 acceptance 2.1 — authoritative session transport parity

2026-09-06. Runtime-architecture Execute, driver task 5 of 8.
Result: **Passed** for acceptance 2.1. The change remains in progress.

The existing mounted evidence satisfies this scenario. All 18 latest tracked
implementation/design hashes still match the verified artifacts. This task maps
and checks that evidence; it does not claim a new live execution. No application
code, dependencies or new tests were needed.

## Acceptance mapping

| Required behavior | Observed evidence |
| --- | --- |
| Browser and native credentials select an allowed practice | `A_cookie`, `A_bearer`, `A_x-session-token`, and the equivalent three B cases returned 200 through Gate with the selected practice. |
| Same sanitized scope for the same identity/practice | All eight summary keys and their values were checked against verified identity, ASO user, practice, display name, human principal and current capabilities. A and B have different grants. |
| Verified expiry | Each summary expiry equals the originating Kratos session expiry. The direct mounted test also compares Bearer and X-Session-Token summaries from the same native session for full equality. |
| Authoritative revision | Every successful Gate summary equals the current database incarnation/revision. Direct mounted capability removal/restoration advances the revision without reusing its earlier value. |
| Fresh membership | B's membership removal returns 403 on the next request, A remains authorized, and B returns 200 after restoration. A's deactivation returns 403. |
| No opaque credentials in the response | Tests allow exactly the eight summary keys, assert authoritative values and compare expiry; all observed session responses carry no-store. No cookie/token/session identifier is in that DTO. |

The uncomfortable wording issue was “same expiry”: separate browser and native
logins create distinct Kratos sessions. Acceptance preserves each verified expiry,
not equality between distinct sessions. The specification now makes this explicit,
matching the decision already recorded in task 1.2's design. No session lifetime
was changed to manufacture equality.

## Actual commands and prerequisites

Primary T1 command, previously executed and completed at
`2026-09-06T17:54:05.039223+00:00`:

```text
RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-gateway.py
exit 0; result Passed; 36 checks; 34/34 no-store responses
```

That run used actual ASO composition, pinned Kratos v26.2.0, a restricted
password-authenticated Postgres login and the existing Gate image identified in
the receipt. PostgreSQL was reachable at its detected published port 55432.
All six A/B transport cases had correct identity context and reader role at the
database lookup. One backend was shared by both identities. All disposable
resources were cleaned up. [Mounted evidence](gateway-session.json).

Supporting T1 command, completed at `2026-09-06T16:28:18.894660+00:00`:

```text
RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-context.py
exit 0; result Passed; 41 checks; 37/37 no-store responses
```

Its reused mounted boundary assertions explicitly compare all non-expiry fields
across browser/native sessions and full summaries across native transports,
then exercise live capability changes and revision advancement.
[Supporting evidence](context-session.json).

T0 executed for this acceptance: source/evidence SHA-256 verification, named
case/result assertions, JSON/link checks and scoped diff check. OpenSpec strict
validation returned `valid: true`, `issues: []`, one passed and zero failed.
The [acceptance receipt](task-5-acceptance.json) binds this mapping to source and
evidence hashes. No T1 rerun, T2/T3 or current service-availability claim is made.

## Changes and limits

Independent artifact-critic review found no actionable findings in acceptance
2.1. It compared the receipts, assertions and current spec/design and confirmed
the scope, per-session expiry, revision, membership, sanitization, counts and
cleanup claims are supported. This was source/evidence review only; no new live
tests were run by the reviewer. Complete-change QA remains task 3.1.

- `openspec/changes/ra-01-verified-session/specs/ra-01-verified-session/spec.md`:
  clarify existing expiry semantics for the acceptance scenario.
- This file and `task-5-acceptance.json`: map the scenario to observed commands,
  prerequisite availability at execution, results and current artifact hashes.
- `openspec/changes/ra-01-verified-session/tasks.md`: complete only 2.1 via KBD;
  generated progress projections and append-only session memory follow.

No unrelated implementation or guards were added. Prior credential/tenant guard
mutation proofs remain the relevant evidence; none were rerun for this document
change. Gate's same-name duplicate-header limitation remains recorded. Native
UI/IPC, full production configuration and deployment, and complete-change QA
remain unverified. Acceptance 2.2, 2.3 and completion 3.1 remain pending. No archive,
commit or publication occurred.
