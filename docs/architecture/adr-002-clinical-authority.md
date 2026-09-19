# ADR-002 · Clinical authority is enforced in three places

**Status** Accepted · **Date** 2026-09-04

## Decision

Affirming the surgeon gate and signing a letter are checked at **three
independent layers**, and none of them is permitted to assume another ran.

| Layer | Mechanism | What it catches |
|---|---|---|
| Gateway | Fresh policy decision on verified identity, current capability and actual case practice | A caller with no right to invoke the action at all |
| Application core | Verified-context gate, signing and reassessment command checks in `AppServices` | A typed refusal the interface can explain to a human |
| Database | Bounded command functions plus `enforce_gate_authority`, `enforce_letter_signing` and `enforce_evidence_reassessment` triggers | Anything that bypassed both — a batch job, a psql session, a future route |

## Why not one layer

Each layer answers a different question and fails differently.

The **database** trigger is the floor. A service role can bypass row-level
security, so a rule that lives only in row-level security is not a rule for
every caller. A trigger is.

The **core** check exists so a refusal arrives as a typed capability denial rather than
a constraint violation. "You may not affirm this case" is actionable; a
Postgres error code is not.

The **gateway** check exists because an AI assistant acting for a surgeon is a
*different principal* — `Agent`, not `User`. A policy granting a surgeon the
ability to sign grants a delegated agent nothing. Authority is re-granted per
action or it does not exist.

## Consequences

- Three checks means three places to update when a capability changes. That is
  the cost, and it is deliberate: the alternative is one place to forget.
- The mounted web binary requires Kratos, session-database and restricted
  clinical-database configuration. It does not start with process-local clinical
  authority or repositories. Memory adapters compile only as focused test
  fixtures.

## Runtime alignment — 2026-09-06

Kratos verifies identity; authoritative ASO membership and policy grant clinical
capabilities. The session store exposes a verified presentation projection and
cannot authorize a command. Native IPC must reach the same Gate, AppServices
and authoritative Postgres checks as HTTP. A local PGlite or SQLite replica is
never the authority for affirmation or signing. Both operations require online
validation and must not replay automatically after reconnection.

An administrator cannot affirm or sign. An agent never inherits its human
principal's clinical authority. Generated assertions require document, page and
date citations; local optimistic state cannot invent a committed clinical act.
The server signing path now implements these invariants. ADR-010's macOS
credential facility and typed native command transport have local evidence;
production-window and multi-platform certification remain separate work.
See [ADR-008](adr-008-shared-runtime-state-and-sessions.md) and
[ADR-009](adr-009-authorized-replicas-and-updates.md), with native credential
ownership in [ADR-010](adr-010-native-session-credentials.md).

### RA-02 gate transport implementation

Gate's `aso_clinical_authorize` pre-request hook calls the read-only ASO
`/internal/gate/authorize` policy endpoint with original credentials, method and
URI. Only an exact 204 allows forwarding. That endpoint freshly resolves Kratos
and ASO membership, checks clinical capability for mutations and reads the case
under the selected practice. It never invokes a clinical command. Cached Gate
identity, static Cedar entities and caller identity headers do not supply this
decision.

Kratos identities are stamped as `User` by the trusted adapter. The shared
session service carries that authoritative principal and refuses `Agent` and
`Service` before resolving membership. A future agent identity provider must
stamp `Agent`; caller traits and headers cannot change it.

The mounted command independently resolves the raw credential again and calls
`execute_gate_command`. Within the verified identity and selected practice,
the service first checks whether the command ID already names a different
payload; a mismatch conflicts before examining that changed target case. New
and exact-replay commands then pass the service capability check, restricted
database transaction and independent affirmation trigger. PostgreSQL repeats
the scoped conflict check before its own target-case authority check. Reads and
explicit command-result lookup still require fresh authorization and the
requested case. Affirm and remove bodies contain only `commandId` and `kind`;
identity and actor cannot be supplied. The RA17 desktop wrappers now obtain the
trusted host credential after their window and epoch checks, then call these
same mounted Gate routes.

The uncomfortable deployment constraint: these routes require a Gate binary
containing the new hook and a configured restricted ASO gate repository. An
older Gate image does not gain clinical authorization merely by receiving the
new YAML. Runtime and image certification remain separate from source changes.

### RA-03 signing transport implementation

`POST /api/letters/{letterId}/sign` accepts a command ID and expected letter,
QA and signature revisions. Its body cannot name an actor, identity, practice,
principal or signature asset. The route resolves the raw credential and
selected practice into a fresh `ClinicalContext`; `execute_sign_letter` then
checks a human principal, current capability, target scope, current approved
letter, approval actor, complete gate, complete QA and citable sources before
the repository transaction.

Gate applies the same `aso_clinical_authorize` hook to signing. The read-only
policy callback requires the session's `sign_letter` capability and reads the
letter under the verified practice without executing the command. PostgreSQL
repeats identity, practice, principal, capability, revision, QA, source and
signature checks while the case, letter and signature are locked. It commits
the signed letter, audit event and immutable identity/practice-scoped command
result in one transaction. The result lookup contract is exposed at
`GET /api/letters/{letterId}/sign/commands/{commandId}`. An exact repeated
command is resolved from the stored result before mutable letter state is read;
a changed payload conflicts. Fresh current authority is still required for
lookup and replay.

Evidence reassessment uses the same verified-context pattern through
`POST /api/cases/{caseId}/evidence/{evidenceId}/state` and explicit command
lookup. The request carries a command ID, one of `met`, `gap` or `void`, and the
observed `assessedAt` revision. Gate requires the clinical `annotate`
capability and resource scope. `AppServices` and PostgreSQL repeat that check,
refuse a stale assessment timestamp, and atomically update the assessment with
one audit event and one immutable result. Identity and actor are absent from
the body.

Until the schema distinguishes surgeon-authored prose from generated factual
assertions, an annotation-only letter claim cannot satisfy the signing source
precondition. Every claim on a signable letter must resolve to a case/patient
document with a page, effective date, content hash and valid page count.
Claim rows and the referenced document version become immutable when the letter
is approved or signed. A source correction creates a new document row and a new
letter revision; changing cited content or provenance in place is refused by a
database trigger. Approval and source/QA mutations take the same transaction
locks, so a source mutation either commits before approval or waits and is
refused after it. An approved letter cannot return to draft, QA rows cannot be
moved away from it, and its only status transition is to signed. This binds
signing to the source content that approval actually reviewed without changing
an applied signing-migration checksum.

Statement-level database triggers also refuse `TRUNCATE` of QA results or
claim mappings while they support an approved or signed letter. Row-level
immutability alone does not cover that operation. Approval holds relation locks
that conflict with both truncations. Under those locks it revalidates every
required QA result, requires every included claim to resolve a case/patient
document with a positive page number and source date, and rechecks each cited
document's provenance and page bounds. Annotation and criterion links are
auxiliary attribution and cannot replace that source. If truncation commits first,
approval is refused as incomplete; if approval wins, truncation waits and is
refused. A correction still requires new source and letter revisions.

The first server migration installs the local-ledger publication boundary
before any command table can commit. Its registry keys protected relations by
OID, so renaming a ledger does not make it publishable. The migration preflight
and postflight refuse existing unsafe table or schema publications. A second
boundary migration is installed in the same pre-ledger pass and serializes
`CREATE/ALTER TABLE` against `CREATE/ALTER PUBLICATION` at DDL start. A command
that waits aborts with SQLSTATE `40001` and must be retried with a fresh catalog
snapshot; end-of-command validation still refuses the unsafe result. This closes
the concurrent schema-move/table-creation publication race as well as the
sequential cases.

Gate's read-only policy callback preserves target-reader availability failures
as `503`. Only typed denial or hidden-not-found results become the `403` policy
denial. An unavailable authority store is not evidence that the clinician lacks
authority.

The shared Tauri gate, signing, reassessment and annotation commands and their
lookups have actor-free, closed input contracts. RA17 mounts them through the
host credential owner and forwards them to Gate with the selected practice as
request context. Local Tauri dispatcher and mounted HTTP tests prove the
transport and typed denial path. Every operation preserves policy denial,
host-credential failure and unavailable/uncertain transport as distinct error
classes, while mutation lookups remain the reconciliation path. The
uncomfortable operational limit is that these tests do not certify a deployed
Gate image or a physical desktop runtime.

The restricted signing and reassessment functions order their clinical update,
audit insert and immutable receipt insert in one PostgreSQL transaction. Fresh
and populated-upgrade fixtures force the final receipt insert to fail and observe
the exact clinical pre-image, no audit, no receipt and no lookup result. Removing
the synthetic failure permits the same command ID to commit once. Signing's
administrator, agent and foreign-practice direct-trigger probes require SQLSTATE
`42501`, so a later signature or data error cannot masquerade as the authority
refusal.

## 2026-09-19 extension — generation protocols do not confer clinical authority

Accepted target under the [revision-12 agent addendum](../handoff/web-case-to-letter-revision-12-agent-integration.md):
AG-UI, A2A and MCP adapters share the host-owned task service and independently
authenticate their callers. The model receives bounded case/source/policy tools;
it receives no affirmation, approval, signing, submission, arbitrary SQL, or
credential capability. An agent's successful generation task is not a surgeon's
clinical act. Tool descriptions and caller-supplied task IDs grant no authority.

External claims retain document/page/date provenance, including the backing
document for an attributed annotation. Final persistence rechecks the verified
principal and captured revisions after model/tool work. Seven engine QA findings
are preserved; a review action cannot overwrite failing findings with passes.
The exact persisted assembly digest binds approval/signing, with historical hashes
remaining valid under their original format. This extension is not evidence that
the new protocol or provider boundaries have passed local certification.
