# artifact-refiner QA — web-ui-architecture (W1–W8)

**Date** 2026-09-06 · **Constraints** `.kbd-orchestrator/constraints.md`
**Scope** all eight changes, validated as one artifact set.

## Blocking constraints — observed output

| id | result | observed |
|---|---|---|
| `build-passes` | PASS | `cargo build --workspace` finished; `pnpm --dir web build` ✓ built in 4.28s; `flutter analyze mobile` **No issues found!** |
| `invariant-tests-pass` | PASS | `cargo test --workspace` 5 passed, 0 failed |
| `architecture-audit-passes` | PASS | `bash scripts/audit.sh` → audit: PASS (6/6) |
| `three-evidence-states` | PASS | audit check 6 — the `void` state survives on both surfaces |
| `clinical-authority-boundary` | PASS | audit + `cargo test --workspace`; the Postgres trigger was **observed refusing** an administrator at bootstrap: *"user a0000000-…-0002 may not affirm the surgeon gate; affirm_gate is a clinical capability"* |
| `host-remains-shell-neutral` | PASS | audit check 4 — `aso-host` is host-neutral |
| `no-query-cache` | PASS | audit check 2 — no query-cache dependency |
| `generated-theme-is-read-only` | PASS | audit check 5 — generated files carry their banner |
| `no-console-log-in-web-source` | PASS | 0 matches |
| `no-any-type-in-web-source` | PASS | 0 matches |
| `no-hardcoded-secrets` | PASS | 0 matches |

**11 of 11 blocking constraints pass.**

## Warning constraints

| id | result | note |
|---|---|---|
| `tests-for-new-features` | PASS | 50 tests across 6 files; every behavioural guard in the phase was proved to fail under deliberate sabotage before being accepted |
| `lint-clean` | PASS | `pnpm --dir web lint` clean; `flutter analyze` no issues; audit PASS |
| `no-stub-comments` | PASS | 0 TODO/FIXME/STUB/HACK |
| `accessibility-basics` | PASS | manual review required and performed — see `review/a2-screen-reader.md`. One defect found (locked steps announced state without reason) and fixed |
| `exact-dependency-pins` | **FINDING** | see below |

## The one finding

**`versions.toml` has an empty `[pins]` table.** The file declares itself the
pin authority — *"Agents must not contradict this file"* — and pins nothing.

This is not theoretical. `@prometheus-ags/entity-graph-react@4.0.0` peer-requires
`entity-graph-core: ^4.0.0`, and pnpm resolved **3.2.0** because nothing declared
core directly: a second copy of the graph one major version behind the hooks
wrapping it. Every gate in this table stayed green while that was true. Fixed
2026-09-06 by adding core as an explicit `4.0.0` dependency.

`versions.toml` is deny-listed for agent edits by `.claude/settings.json`, so
the pin must be added by the operator:

```toml
[pins]
"@prometheus-ags/entity-graph-core" = "4.0.0"
"@prometheus-ags/entity-graph-react" = "4.0.0"
```

Severity **warning**, not blocking: the tree is correct right now. It is
recorded because the next install can drift back, and the failure is silent.

## Verdict

**PASS** on all blocking constraints. One warning-level finding, owned by the
operator, with the corrective action stated.
