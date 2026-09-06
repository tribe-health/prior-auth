# KBD Constraints — Prior Authorization Workbench

These constraints are derived from the repository documentation and its Rust,
React/Vite, Tauri, and Flutter architecture. KBD and every executing tool must
apply them before a change can be archived.

## Blocking Constraints

```yaml
constraints:
  - id: build-passes
    severity: blocking
    description: "All build-only surfaces must compile or analyze successfully"
    command: "cargo build --workspace && pnpm --dir web build && flutter analyze mobile"

  - id: invariant-tests-pass
    severity: blocking
    description: "Rust domain invariants and Flutter tests must pass"
    command: "cargo test --workspace && flutter test mobile"

  - id: architecture-audit-passes
    severity: blocking
    description: "The repository architecture audit must pass"
    command: "bash scripts/audit.sh"

  - id: three-evidence-states
    severity: blocking
    description: "Evidence state must preserve met, gap, and void as distinct values"
    command: "bash scripts/audit.sh"

  - id: clinical-authority-boundary
    severity: blocking
    description: "Administrative authority must never imply permission to affirm a clinical gate or sign a letter"
    command: "cargo test --workspace"

  - id: host-remains-shell-neutral
    severity: blocking
    description: "aso-host must not depend on Axum, Tauri, Flutter, or another presentation shell"
    command: "bash scripts/audit.sh"

  - id: no-query-cache
    severity: blocking
    description: "Do not add a query-cache dependency; the entity graph owns freshness"
    command: "bash scripts/audit.sh"

  - id: generated-theme-is-read-only
    severity: blocking
    description: "Do not hand-edit web/src/theme.css or mobile/lib/core/theme/tokens.dart; edit tokens.toml and regenerate"
    command: "bash scripts/audit.sh"

  - id: no-console-log-in-web-source
    severity: blocking
    description: "No console.log statements in web TypeScript source"
    check: "rg -n 'console\\.log' web/src -g '*.ts' -g '*.tsx'"

  - id: no-any-type-in-web-source
    severity: blocking
    description: "No explicit any type in web TypeScript source"
    check: "rg -n ': any([,;)>]|$)' web/src -g '*.ts' -g '*.tsx'"

  - id: no-hardcoded-secrets
    severity: blocking
    description: "No hardcoded API keys, tokens, or passwords in application source"
    check: "rg -n 'sk-|api_key|API_KEY|secret.*=[[:space:]]*[\"'\"'][A-Za-z0-9]' crates web/src mobile/lib desktop/src-tauri/src"
```

## Warning Constraints

```yaml
constraints:
  - id: tests-for-new-features
    severity: warning
    description: "Tests exist for every new behavior introduced by a change"

  - id: lint-clean
    severity: warning
    description: "Architecture, Rust, web, and Flutter lint checks pass without warnings"
    command: "bash scripts/audit.sh && cargo clippy --workspace --all-targets && pnpm --dir web lint && flutter analyze mobile"

  - id: no-stub-comments
    severity: warning
    description: "No TODO, FIXME, STUB, or HACK comments are introduced"
    check: "rg -n 'TODO|FIXME|STUB|HACK' crates web/src mobile/lib desktop/src-tauri/src"

  - id: accessibility-basics
    severity: warning
    description: "New UI uses semantic HTML/widgets, keyboard access, labels, and visible focus states"
    note: "Manual review is required"

  - id: exact-dependency-pins
    severity: warning
    description: "Preserve exact pins for code-generation and FFI dependency graphs unless the full coherent set is validated"
```

## Workflow Triggers

```yaml
workflow_triggers:
  - event: on_iteration_complete
    action:
      type: command
      target: "cargo build --workspace && pnpm --dir web build && flutter analyze mobile"

  - event: on_change_complete
    action:
      type: command
      target: "cargo test --workspace && flutter test mobile"
```

## Project Notes

- The focus project is the repository root; no multi-root VS Code workspace was found.
- `web/openspec/config.yaml` is nested below the focus root and has no specs, so KBD uses its built-in change management until a root OpenSpec project or actual specs are added.
- Design intent comes from `docs/design/`; sequencing comes from `docs/plan/build-order.md`; architecture decisions come from `docs/architecture/`.
