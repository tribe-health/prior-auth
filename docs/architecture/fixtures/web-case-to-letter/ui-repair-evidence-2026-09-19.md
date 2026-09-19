# Web layout and recovery evidence — 2026-09-19

Scope: responsive web repairs within `runtime-architecture › web-case-to-letter`.
This is focused local evidence, not certification of the document-generation agent.

## Delivered and measured

The shell uses the full dynamic viewport. The workflow context rail collapses
into a keyboard-accessible drawer below 1100px; primary navigation switches to
bottom navigation below 800px. The route outlet stays mounted during resize.
Content columns respond to available width. Error alerts fit their container;
long citations wrap; wide Markdown tables and code have local scrolling.

Local Chromium/Playwright on the running Compose web application measured:

| Viewport | Shell height | Horizontal overflow | Main reaches bottom | Unsaved intake value preserved |
|---|---:|---|---|---|
| 1440 × 1000 | 1000 | No | Yes | Yes |
| 1100 × 600 | 600 | No | Yes | Yes |
| 1024 × 768 | 768 | No | Yes | Yes |
| 768 × 900 | 900 | No | Yes | Yes |
| 390 × 844 | 844 | No | Yes | Yes |
| 320 × 700 | 700 | No | Yes | Yes |
| 1024 × 240 | 240 | No | Yes | Yes |

The intake probe changed a field without saving, resized repeatedly, then restored
the original value. The denial workspace separately passed overflow/bottom checks
at widths 1440, 1024, 768, 390 and 320. Reduced-motion shell transition duration
was `1e-05s`; the content settled at opacity `1`. Mobile and desktop screenshots
were visually inspected. The mobile workflow drawer opened and closed without
horizontal overflow. The short-height check used the demo surgeon's available
navigation, not an administrator's additional entry.

## Synchronization and initialization

The observed FRF upstream network failure returned HTTP 502 and previously closed
the replica permanently. The browser now retries that authorized idempotent GET
twice, with the same cursor, and retains authority/abort checks. Other refusals
remain final. A live browser interception injected one 502: `injected=1`,
`retried=true`, `protectedUiVisible=true`, `paused=0`. This proves recovery from
one transient failure; it does not establish the upstream socket's root cause.

`docker compose run --rm --no-deps aso-demo-init` completed with `COMMIT` and
`Demo identity and synthetic case are ready.` Existing case revision values
remained `10|1|1|2|2`; letter count remained `1`; the existing Kratos identity
identifier was unchanged. No clinical record reset was performed.

## Focused checks

- `pnpm --dir web typecheck`: Passed, `$ tsc --noEmit`.
- `pnpm --dir web lint`: Passed, `$ oxlint`.
- Shell focused Vitest: Passed, 1 test.
- FRF shape transport focused Vitest: Passed, 36 tests, including cancellation,
  retry exhaustion, unchanged cursor and credentials, and authority refusal.
- Letter workflow hook focused Vitest: Passed, 4 tests. Removing the stale-policy
  guard produced 3 failures; restoring it returned all 4 tests to green.
- Demo identity repeatability test: Passed, 1 test; shell syntax check Passed.
- Impeccable detection: one warning for the payer quotation's accent border;
  retained as a quotation marker. No claim of a warning-free detector run.

## Remaining acceptance

The independent artifact critic found alert overflow, wide Markdown clipping,
long filename clipping, and short-height rail reachability. Those source changes
are applied. Final independent source and screenshot review: **Passed**, with
no further actionable layout findings. The policy-selection recovery exposed a
PostgreSQL `CURRENT_CATALOG` keyword collision. Forward migration
`2026090637_criteria_catalog_revision_variable.sql` now uses an unambiguous variable;
the coordinating executor reported migrator and real executor-role regression
**Passed**. The local command was:

```sh
docker compose exec -T db psql -U flint -d flint -X -v ON_ERROR_STOP=1 < scripts/test-criteria-selection-revision.sql
```

Observed regression receipts reject stale resolution/catalog tokens, accept
matching tokens and retain a current snapshot; the regression rolls back its
changes. The browser then saved the current policy snapshot, committed evidence
revision 2 and generated a clinical appeal with HTTP 200. This is recovery and
generation evidence only: it does not certify appeal review, signing, inference,
or protocol integration. Revision 12 was registered at source revision 1717 with
exact next work `/kbd-apply da-01-document-assembly-agent`.

Uncomfortable limitation: a correctly sized interface and a signed historical
demo letter do not prove source truth, live inference, durable agent tasks,
protocol interoperability, or the complete three-scenario acceptance campaign.
Those remain explicit revision-12 implementation and certification work.
