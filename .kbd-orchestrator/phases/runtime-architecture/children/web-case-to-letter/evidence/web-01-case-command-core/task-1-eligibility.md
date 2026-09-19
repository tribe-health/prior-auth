# web-01 task 1 eligibility and web-first scope

Date: 2026-09-16
Phase: `runtime-architecture › web-case-to-letter`
Change: `web-01-case-command-core`
Task: `1.1`
Result: **Passed**

## Dependency and position

- Canonical KBD revision 1531 records plan revision 10 and exact next work
  `/kbd-apply web-01-case-command-core`.
- `web-00-workflow-contract` is `complete` with 6/6 canonical tasks and is
  archived at `openspec/changes/archive/2026-09-16-web-00-workflow-contract`.
- The frozen web-00 review verdict is `PASS` with zero findings, and its
  artifact-refiner bundle remains present.
- `web-01-case-command-core` is `in_progress` with all six canonical tasks
  registered. Task 1.1 is the only task active in this turn.

The stale next-work pointer to web-00 was corrected through the supported
`prometheus kbd revise` command. No waypoint file was edited by hand.

## Operator course correction

Plan revision 10 and immutable decision
`web-first-browser-certification-before-native` require web-01 through web-17
to complete and pass in the browser before further Tauri or mobile work. The
child plan, execution contract, task inventory, scope, and all active web-01
through web-17 OpenSpec proposal/design/task records now require browser HTTP
delivery. Typed Tauri wrappers are deferred to RA19/RA21 after web-17 passes.

The child scope now denies `desktop/**` and `mobile/**`. This makes the order
enforceable during apply rather than leaving it as prose. Shell-neutral
`AppServices` remains required so later native adapters can consume the same
business behavior without changing it.

## Frozen web-00 inputs retained

- `fixture-manifest.json` SHA-256:
  `37cae4665649a0da36aa08d8e7e56627ed436b897800ae48672addf7429a78d2`
- `expected-output-manifest.json` SHA-256:
  `1ff11ca64c19957fcdc26fa82585d26c42d58d2ae5e634cfcff71d1d30ee7229`
- Verified selected-practice authority, same-case citation provenance,
  three evidence states, stable command identity, deterministic UUIDv5,
  source-backed claims, and the four negative controls remain unchanged.

Only shell delivery order changed. The domain, authority, tenant, citation,
idempotency, error, fixture, and expected-output contracts did not change.

## Assigned ownership for web-01

Task 1.2 may write only the additive server migration, schema checks, and
least-privilege database functions under `migrations/server/**`,
`docs/design/schema/**`, and their focused scripts/evidence.

Task 1.3 may write the shell-neutral case aggregate/service under
`crates/aso-host/**` and the PostgreSQL adapter under
`crates/aso-web-server/**`.

Task 1.4 may mount browser HTTP routes under `crates/aso-server-axum/**` and
their focused contract checks. It may not write `desktop/**` or `mobile/**`.
Case publication, PGlite/PEM mapping, Zustand selectors, and React case views
remain owned by web-02.

## Decision gates

- Verified Kratos identity and selected practice are the only actor and tenant
  authority inputs. Request bodies cannot select either.
- Durable effects use additive migrations and least-privilege functions.
  Direct production-role table writes remain refused.
- Stable command IDs reconcile a lost response and reject a different payload
  under the same ID.
- Web-01 makes no replica, PGlite, Zustand, React UI, Tauri, mobile, payer
  transport, or full-scenario claim.
- `versions.toml` needs no change for web-01. Its blocked PGlite materializer
  decision is preserved because case publication begins in web-02.
- Only Tier 0 and focused Tier 1 checks run in web-01. The local full-stack and
  actual-browser Tier 2 campaign remains web-17.

## Commands and observed results

```text
prometheus kbd revise --reason <web-first course correction> \
  --exact-next-work '/kbd-apply web-01-case-command-core'
Run: web-ui-architecture-20260904T190440Z  revision 1530
Lifecycle: Ready  plan revision 10
```

```text
prometheus kbd decision record \
  --id web-first-browser-certification-before-native ...
revision: 1531
committedLocally: true
controlPlane: disabled
```

```text
for c in openspec/changes/web-{01..17}-*; do
  openspec validate "$(basename "$c")" --strict
done
Change 'web-01-case-command-core' is valid
...
Change 'web-17-browser-scenario-certification' is valid
```

```text
python3 -m json.tool \
  .kbd-orchestrator/phases/runtime-architecture/children/web-case-to-letter/scope.json
exit 0

git diff --check -- <revised child and OpenSpec planning records>
exit 0
```

## Eligibility decision

**Passed.** Task 1.2 may implement the additive case-command migration and
database boundary. The implementation must remain browser-first and inside the
ownership and decision gates above.
