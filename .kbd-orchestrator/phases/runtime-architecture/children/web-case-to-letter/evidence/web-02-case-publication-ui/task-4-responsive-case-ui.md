# Web-02 task 1.4 — responsive case UI

Date: 2026-09-17
Result: Passed

## Delivered behavior

- Replaced the case queue and intake placeholders with mounted React views.
- Added `/cases/:caseId` as the case dashboard and made pipeline step 01 target it.
- Added responsive create/edit forms built from the shared shadcn components.
- Kept patient, payer, surgeon and coordinator values identifier-only; the UI does not invent display names absent from the approved case projection.
- Routed create, update and status transition intent through the case feature hook and API module. The hook retains stable command ownership, exposes definitive refusals/conflicts, reconciles uncertain outcomes by lookup, and waits for the committed PEM case row before reporting success.
- Loaded protected case detail through the authenticated HTTP read after mount and after reconstruction. Draft interaction state stays scoped to the mounted identity/practice/session epoch/case/view.
- Added semantic labels, required controls, native form submission, 44px action targets, responsive one/two-column layout, stable form DOM across resize, and reduced-motion fallbacks.

No desktop or mobile path changed. Actual-browser full-stack acceptance remains assigned to Web-17; this task provides focused component/hook verification only.

## Observed verification

The final TypeScript gates passed:

```text
$ tsc --noEmit
$ oxlint
```

The focused task suite passed:

```text
Test Files  9 passed (9)
Tests       18 passed (18)
```

Covered behavior includes exact HTTP routes and payloads, committed case projection, independent queue view state, no optimistic case confirmation, uncertain command lookup, server reload after view reconstruction, labeled semantic form submission, value/DOM continuity across 320px and 1280px resize, mounted queue/create UI, protected route composition, and case pipeline shell composition.

The first new form-test typecheck correctly failed because this repository does not install jest-dom matcher types. The assertions were rewritten against native DOM properties, after which typecheck, lint, and the focused suite passed. No production behavior changed to accommodate that test issue.

Strict OpenSpec validation passed:

```text
Change 'web-02-case-publication-ui' is valid
```

`git diff --check` exited zero.

## Remaining Web-02 work

- Task 2.1 owns foreign-practice/broadened-projection sabotage and the prescribed reviews.
- Task 3.1 owns final architecture/spec reconciliation and change completion evidence.
- Document upload and processing begin in Web-04 and Web-05 after Web-03 resolves the administering entity.
