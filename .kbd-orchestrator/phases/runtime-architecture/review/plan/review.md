# Runtime architecture plan review

Date: 2026-09-06. Scope: planning artifacts only. Result: **Passed** with the warning dispositions below. No application implementation or runtime certification is claimed.

## Artifact and review provenance

The [plan](../../plan.md) defines 24 ordered changes across the five authorized workspace roots. Root OpenSpec owns proposal/design/spec/task artifacts; KBD owns phase ordering and status. The root `openspec/config.yaml` selects `spec-driven`, and `openspec list --json` resolved this repository as the nearest root.

The existing independent artifact critic received the plan without its generation history, but retained earlier prototype/assessment review context. The separate REST judge supplied fresh-context cross-model review: producer `gpt-6-astra`, judge `k3`, `verified-distinct`, through `rest-gateway:http://localhost:4000/v1`. Two judge rounds were used; there was no third round.

- Round 1: PASS, 0 critical / 1 warning / 1 suggestion; see [findings](findings.json).
- Round 2: PASS, 0 critical / 3 warnings / 1 suggestion; see [findings](findings-final.json).
- Both judge anti-theater checks: `PASS (score=0.0, strictness=strict)`.
- Independent critic: initially 0 critical / 3 warnings / 1 suggestion; revised plan and final amendments had no new critical or warning finding. See [critic receipt](critic.md).
- Final tone screen: score 0.017857, one low length flag, no required correction; see [receipt](../../sycophancy/plan-final-20260906.json).

The final judge packet reviewed plan SHA256 `ad5c9837afc27c81f82d83acfa3896cd44550edf9bd5fc93cb1594c7d178bff3`. The final plan SHA256 is `d0ea75f7881129291f02ed85c30e88dadb2e4b2341aec5d493fd78c13ef54c24`. They differ because the final warning dispositions below were applied after that judge call and independently rechecked by the critic. The final hash is not represented as having received another REST judge review.

## Warning dispositions

1. **Phase verification coverage.** Added Flutter analyze/test alongside Rust workspace test/build, web build and architecture audit at phase T2. Broad phase checks are not required prematurely on each bounded change.
2. **OpenSpec backend.** The final judge interpreted the stale constraint as requiring actual specs. Its literal condition permits “a root OpenSpec project or actual specs”; the root project exists, as confirmed by the CLI. The KBD skill also selects OpenSpec when the root directory exists. Root spec-driven artifacts therefore satisfy the existing rule without a new approval or a hand-edited canonical state file.
3. **Orthogonal dependency.** Removed ra-10 from ra-11a's dependencies and made ra-10 an explicit ra-14 delivery prerequisite. Sync conformance can proceed independently; first UI delivery and final certification still enforce the no-query-cache invariant. The final critic checked the dependency table, change sections and execution rounds agree.
4. **Practice derivation acceptance.** Added ra-04 acceptance and tasks for the seven established fresh/upgrade derivation cases, forged practice IDs, parent-key changes and cascades under a non-bypass role. The actual derived-practice triggers belong to case_evidence, evidence_citations and documents. Cases use authorized ownership/RLS; evidence_states is explicitly approved reference data. The suggestion to invent practice triggers on all five tables was not adopted.
5. **Critic findings.** SQLite parity now includes the complete native baseline projection, including annotations and gate summary. The oversized sync change became conformance, worker ownership and SQL materialization changes. Gate summary has an explicit server-to-projection-to-graph-to-view contract. Durable synthetic crash fixtures are separated from the memory-only browser baseline and do not approve real clinical persistence.
6. **Suggestions.** Corrected the SQL/SQLite spelling findings. No remaining review finding requires another planning round.

## Verification evidence

T0 planning checks only:

- Ran `openspec validate <change-id> --strict --json --no-interactive` for each of the 24 changes. All returned one passed item, zero failed items and no issues. Individual `validate-*.json` receipts are retained in this directory.
- Ran `openspec list --json`: 24 changes, each with zero completed tasks. OpenSpec labels an unimplemented change with tasks as `in-progress`; that label does not establish implementation.
- Aggregated the receipts and checked the 96 authored Markdown artifacts, balanced fences, dependency order, dependency references in designs/tasks, and unchecked task markers. Observed: 24 valid changes, 75 acceptance criteria, 195 unchecked tasks, acyclic dependencies. See [artifact checks](artifact-checks.json). The first aggregate script assumed a top-level validation boolean and failed; it was corrected to inspect the observed CLI `items`/`summary` schema, then passed. This was a checker error, not an OpenSpec validation failure.

## Uncomfortable limit and execution handoff

A validated plan can still fail at the installed PEM boundary: isolated candidate conformance does not prove the application's exact 4.0.0 installation has the required lifecycle behavior. G-PIN therefore blocks real adoption until the operator-owned pin decision and actual produced package artifact exist; no replacement version is invented and 4.0.0 must not be silently overwritten or republished.

Start with ra-01-verified-session. Respect dependencies and decision gates in the plan; first persisted synthetic-row delivery is ra-14, not full UI completion or publication. The twelve other UI routes remain outside that first delivery. Native storage choice, retention, SSO, encryption, revocation budgets and performance budgets require the explicit decisions/evidence assigned by the plan.

No application source, dependency pin, schema or token changes were made in this planning turn. No executable guards or unrelated implementation were added. Runtime browser behavior, native/device behavior, security enforcement, performance and full phase verification remain unverified because no implementation or application test/build was run. Prior publication remains blocked.
