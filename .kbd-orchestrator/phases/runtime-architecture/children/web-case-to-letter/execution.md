# EXECUTION: runtime-architecture › web-case-to-letter

Project: Prior Authorization Workbench
Date: 2026-09-16
Backend: OpenSpec through KBD-owned `/kbd-apply`
Changes: 18, serial dependency order

## Dispatch contract

Execute `web-00-workflow-contract` through `web-17-browser-scenario-certification` in the order recorded by `plan.md`. `/kbd-apply` owns one task boundary at a time and updates the append-only KBD runtime. Bare OpenSpec apply is not used because it does not fire KBD task hooks or update canonical position.

Each implementation change runs applicable Tier 0 after edits and focused Tier 1 when its unit is complete. No broad local integration runs before web-17. Web-17 freezes one candidate and runs the child Tier 2 local stack and actual-browser campaign. Tier 3 remains a parent milestone/release concern. CI is not test evidence.

## Ownership

The root Codex agent owns orchestration, cross-change consistency, KBD state, OpenSpec verification/archive, final browser evidence, and the completion claim. Parallel agents may perform independent read-only exploration or receive explicitly disjoint files within the active change. They must not revert concurrent edits.

Application writes stay inside `scope.json`. New commands enter shell-neutral `AppServices`, then typed browser HTTP routes. Plan revision 10 defers matching Tauri wrappers, Tauri runtime behavior, and native parity to RA19/RA21 after web-17 certifies the browser workflow. Mobile is outside scope. Before a new record can replicate, the active change must supply its lane/privacy/column/tenant/revocation evidence.

## Per-change completion

1. Confirm dependencies and the exact active KBD/OpenSpec task.
2. Complete the smallest authorized edit and its applicable Tier 0 check.
3. Complete the focused capability and Tier 1 acceptance, including a deliberate red/restore for an uncovered load-bearing guard.
4. Record actual commands and outputs.
5. Run artifact-refiner and fresh adversarial review.
6. Mark implementation complete, verify the OpenSpec change, and archive it before activating the next change.

## First action

`/kbd-apply web-00-workflow-contract`
