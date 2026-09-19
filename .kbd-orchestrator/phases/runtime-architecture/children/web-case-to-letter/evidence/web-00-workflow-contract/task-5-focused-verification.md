# web-00 task 5 focused verification

Date: 2026-09-17
Phase: `runtime-architecture › web-case-to-letter`
Change: `web-00-workflow-contract`
Task: `2.1`
Result: **Passed**

## Review repairs

The final review cycle closed five concrete defects:

- PostgreSQL now derives one active tenant from the verified Kratos identity
  and `aso.practice_id`; membership in another practice is not active
  authority. Clinical triggers also bind the recorded actor to the current
  verified user.
- `letter_claims` carries `case_id`, and composite foreign keys require both
  its letter and cited document to belong to that case.
- Every standalone positive fixture contains a current signature record, and
  every signing request binds `signatureId` and `signatureRevision`.
- The missing-citation request sends command identity, revisions, and purpose.
  Its deliberately incomplete candidate comes from the deterministic fixture
  inference adapter rather than the client.
- Negative-control UUIDv5 remapping fixes the RFC 4122 namespace, SHA-1,
  canonical lowercase UUID text, exact UTF-8 name template, and a recomputed
  conformance sample.

## Deterministic checks

`python3 docs/architecture/fixtures/web-case-to-letter/verify.py` exited 0 and
printed ten `Passed:` lines. It covered three positive fixture families, four
isolated negative controls, 96 disjoint command UUIDs, complete command and
revision ownership, submission custody, the appeal response gate, exact claim
provenance and review, deterministic resets, synthetic labeling, and lock
hashes.

Three controlled copies changed one guard at a time, regenerated their fixture
locks, and ran the real verifier. Each exited nonzero with its intended message:

```text
request-case: sign_letter does not bind the standalone signature
missing-citation-claim: client payload supplies a generated claim
low-confidence-denial: UUIDv5 byte/name encoding is not reproducible
```

The tracked source was not changed by these controls.

The artifact rebuild exited 0:

```text
Passed: 46 deterministic artifact checks
Passed: 48 frozen task sources
Passed: 49 non-empty manifest files
Passed: source manifest 4b6f3569074d55c89129eafac183cc6ff63783665b0f15ef0a4bf2cf3117cf26
```

Strict validation exited 0 for `web-00`, `web-08`, `web-10`, `web-11`,
`web-14`, `web-15`, `web-17`, `ra-20`, and `ra-22`.

## PostgreSQL 18

Disposable databases ran inside the healthy `aso-prior-auth-db-1` PostgreSQL
18.6 container and were dropped after each run. Applying `schema.sql`,
`schema-ai.sql`, and `schema-web-capabilities.sql` succeeded. The focused probes
observed:

```text
Passed: cross-practice gate affirmation refused
Passed: cross-practice annotation refused
Passed: cross-practice letter approval refused
Passed: cross-practice letter signing refused
Passed: clinical case practice reassignment refused
Passed: same case stores initial and response version 1
Passed: each letter stores submission attempt 1
Passed: cross-case cited document refused
```

The criteria migration applied, rolled back, and reapplied. `schema-checks.sql`
produced its five expected refusals and four expected positive results.
`schema-ai-checks.sql` produced eleven expected refusals and five result lines
across four positive assertions. Its stale duplicate `Medical policy` setup row
was removed after the base schema's canonical seeded row caused an observed
transaction abort.

## Independent review

The configured REST judge resolved `gpt-5.5` against producer
`gpt-6-astra`, but dispatch exited 3 with:

```text
judge returned no usable completion — unavailable
```

The skill-prescribed fresh-context fallback reviewed only the frozen artifact
using `gpt-5.5`. It returned `PASS` with zero findings after checking eight
named failure classes and citing exact artifact files. The first zero-finding
receipt was rejected by the strict anti-theater gate because its checked-class
entries did not explain why each failure did not apply. The reviewer re-examined
the artifact and supplied evidence-backed entries. The second screen printed:

```text
[adv-gate] PASS (score=0.0, strictness=strict)
```

The pre-screen receipt validates against the supplied findings schema. The
screen then adds `sycophancy_screen`, while that older schema declares unknown
top-level properties invalid. This is a review-tool schema mismatch; it does
not alter the PASS, the eight cited classes, or the zero-finding result.

## Tier boundary

This change ran T0 and focused T1 only. The actual local browser campaign is
reserved for `web-17`; broad browser runtime certification is reserved for
`ra-22`. No native or mobile result was used.
