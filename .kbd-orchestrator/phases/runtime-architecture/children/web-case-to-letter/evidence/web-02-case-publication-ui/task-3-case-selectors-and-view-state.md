# Web-02 task 1.3 — case selectors and scoped view state

Date: 2026-09-17  
Phase: `runtime-architecture › web-case-to-letter`  
Change: `web-02-case-publication-ui`  
Task: `1.3`  
Result: **Passed**

## Delivered behavior

The browser now has committed PEM selectors for the case queue, case detail,
and case intake surfaces. Each selector reads the ordered `replica:cases`
identifier list and rejoins the current normalized `Case` entity in one graph
snapshot. The selector never copies a durable case row into Zustand view state.

The projected TypeScript model contains only the twelve revision-4 fields. It
normalizes PGlite `DATE`, `TIMESTAMPTZ`, and `BIGINT` values and accepts only
the sixteen server-defined lifecycle statuses. A listed row that is missing,
has a mismatched ID, belongs to another practice, or contains an unknown status
returns an explicit error. An ID outside the committed list is unavailable;
it is not recovered from an unlisted entity row.

`useCaseQueueView` creates one `useScopedViewStore` owner per mounted queue. Its
Zustand state contains only transient search text, status filter, and selected
case ID. The scope includes verified identity, session, practice,
authorization revision, epoch, the queue surface, and React view instance.
Account/practice/epoch replacement therefore inherits the existing synchronous
scope fence and resets the transient state.

## Files

- `web/src/features/case-queue/model/case-record.ts`
- `web/src/features/case-queue/hooks/use-case-projection.ts`
- `web/src/features/case-queue/hooks/use-case-projection.test.ts`
- `web/src/features/case-queue/hooks/use-case-queue-view.ts`
- `web/src/features/case-queue/hooks/use-case-queue-view.test.tsx`

No route, component, desktop, mobile, API, or durable schema file changed.

## Observed verification

TypeScript T0:

```text
pnpm --dir web typecheck
$ tsc --noEmit

pnpm --dir web lint
$ oxlint
```

Initial focused tests:

```text
pnpm --dir web exec vitest run \
  src/features/case-queue/hooks/use-case-projection.test.ts \
  src/features/case-queue/hooks/use-case-queue-view.test.tsx --maxWorkers=1

Test Files  2 passed (2)
Tests       6 passed (6)
```

Controlled shared-store regression: `createScopedViewStore` was temporarily
changed so every mounted view reused one Zustand store. The isolation test
failed because the second queue received the first queue's values:

```text
Test Files  1 failed (1)
Tests       1 failed (1)

Expected: search "", statusFilter "all", selectedCaseId null
Received: search "SYNTHETIC-001", statusFilter "intake", selectedCaseId "case-1"
```

The sabotage was fully reverted. The final focused suite included the shared
scope primitives and passed:

```text
pnpm --dir web exec vitest run \
  src/features/case-queue/hooks/use-case-projection.test.ts \
  src/features/case-queue/hooks/use-case-queue-view.test.tsx \
  src/shared/scoped-view-store.test.ts \
  src/shared/use-scoped-view-store.test.tsx --maxWorkers=1

Test Files  4 passed (4)
Tests       11 passed (11)
```

`git diff -- web/src/shared/scoped-view-store.ts` produced no output after the
restore. `git diff --check` passed. Strict OpenSpec validation exited zero and
printed `Change 'web-02-case-publication-ui' is valid`.

## Claim limits

The hooks are not yet mounted in product routes. Task 1.4 owns the responsive
queue, detail, create, edit, and intake components and will connect these
selectors to the existing HTTP command boundary. Full reload and actual-browser
behavior remain unclaimed until those callers exist and Web-17 certifies them.
