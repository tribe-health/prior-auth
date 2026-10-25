# PatientGPT KBD constraints

Derived from AGENTS.md, versions.toml, the installed patientgpt-delivery team,
.claude/rules/{rust,typescript,flutter}.md, and the operator's delivery instructions.
This is project policy, not a claim that a generic constraint engine enforces
clinical authority. Production boundaries require actual implementation evidence.

## Configuration and scope

PatientGPT is the sole focus project. The parent prior-auth directory and listed
sibling repositories provide read-only reference context. The nested PatientGPT
focus takes precedence over the enclosing parent reference entry. The existing
team reserves exactly three parent workflow files for the platform release owner:
`../.github/workflows/patient-gpt-build.yml`, `patient-gpt-deploy.yml`, and
`patient-gpt-docs.yml` in that same directory. That narrow ownership exception
remains available for an assigned implementation task; it grants no broad parent
or sibling write access. Cross-repository UAR changes need a separate lead-scoped
handoff. Hidden project-owned directories are not disposable.

No PatientGPT package.json, Cargo.toml or pubspec.yaml exists. Application build,
test, lint and dev commands are null until actual app manifests establish them.
Do not substitute the parent workspace's commands, dummy success commands or
skill-package test runners. Requested React/TypeScript 7.0/Tauri/Rust/Flutter are
architecture targets, not an observed runnable stack. No mandatory external Cargo
target directory, nvm prefix or toolchain selector was discovered. Preserve any
subsequently adopted command environment on every affected command segment.
For isolated worktrees retain separate default target directories and shared
`CARGO_HOME`; serialize dependency-mutating Cargo commands as required by the
Rust rules. No concrete CARGO_HOME value is prescribed by current instructions.

The managed OpenSpec runner is
`/Users/gqadonis/.codex/skills/kbd-process-orchestrator/shared/openspec/cli.mjs`.
Refresh through that runner before starting/entering phases and read its receipt.
Invoke OpenSpec through its `run --project <PatientGPT root> -- <arguments>` path.
Preserve authored specs, changes, configuration and generated lifecycle receipts.
Initialization does not activate a phase or launch workers.

## Blocking constraints

```yaml
constraints:
  - id: patientgpt-focus-and-team-ownership
    severity: blocking
    description: 'Use patientgpt-delivery roles, explicit write ownership and the PatientGPT task state; do not inherit the parent active phase.'
    note: 'Freeze shared contracts before dependent parallel work; the lead integrates and serializes shared builds. See scope exceptions above.'
  - id: real-commands-and-prerequisites
    severity: blocking
    description: 'Do not execute application commands until actual PatientGPT manifests and required paths establish them.'
    note: 'Null commands mean unavailable; never fabricate success or mount/create substitute build storage during init.'
  - id: local-final-phase-testing
    severity: blocking
    description: 'Tests and independent review occur only after the full implementation phase is complete, through real local production paths and collaborators.'
    note: 'Keep critics and verifiers dormant during implementation. No CI tests, CI acceptance, per-edit test loops or mock-only completion evidence.'
  - id: visible-two-hour-delivery
    severity: blocking
    description: 'Each 120-minute increment includes a local web build and human demo; every even increment includes full local web and Tauri builds.'
    note: 'Increments do not automatically close phases; builds and demonstrations are distinct from runtime acceptance.'
  - id: shared-ui-and-domain-boundaries
    severity: blocking
    description: 'Share all React application code across web/Tauri; keep Rust domain and AppServices independent of shells and storage drivers.'
    note: 'UI to hooks/view models to stores to services to external; state belongs to inspectable systems. Native commands and HTTP routes retain behavioral parity.'
  - id: no-query-cache
    severity: blocking
    description: 'Entity graph owns durable entities and freshness; no TanStack Query, SWR, Apollo cache or competing request cache.'
    note: 'Zustand is transient UI state; Riverpod owns Flutter presentation state. No direct component networking.'
  - id: environment-storage-and-identity
    severity: blocking
    description: 'Preserve browser PGlite, desktop embedded SurrealDB 3.3.0, shared Rust storage ports and Axum/Postgres via Forge/Fabric; Kratos sessions and Flint Gate own identity/policy seams.'
    note: 'These are targets. Resolve documented memory, version and credential mismatches; do not silently substitute old template defaults.'
  - id: clinical-evidence-and-authority
    severity: blocking
    description: 'Keep met/gap/void distinct; filed documents change criteria, conversational statements do not. Reuse ASO clinical truth.'
    note: 'Affirm/sign/submit/outcome controls remain host-owned with independent gateway, AppServices and persistence authorization. Agents and administrators do not inherit surgeon authority.'
  - id: citations-privacy-and-tenancy
    severity: blocking
    description: 'Assertions require document, page and date; exclude unsupported claims explicitly. Keep synthetic fixtures/logs and enforce tenant/PHI boundaries.'
    note: 'Preserve lane/privacy classes; local data and derived embeddings remain local. No real patient data in tests, logs or commits.'
  - id: governed-uar-and-registered-components
    severity: blocking
    description: 'UAR owns governed product-agent execution; use explicit AG-UI profiles/adapters and versioned A2UI components admitted by the runtime and registered in every renderer.'
    note: 'Development roles are not deployed agents. Temporary primitive/host-block composition cannot close the full PatientGPT catalog goal. Tool descriptions do not grant authority.'
  - id: design-authority-and-naming
    severity: blocking
    description: 'Preserve docs/design branding, Flat 2.0, both themes, typography, mobile workflows and labeled evidence states; authored TypeScript 7.0 filenames use kebab-case.'
    note: 'Use the project UI protocol and requested source architecture skills. Edit the designated token source and regenerate; generic taste defaults cannot replace the reference.'
  - id: serial-build-and-evidence
    severity: blocking
    description: 'One writer per build/target directory; preserve real failures and record Passed, Build-only, Blocked or Failed for the stated evidence scope.'
    note: 'Do not invent a target directory to bypass lock contention, run cargo clean unasked, or claim native device/runtime acceptance from compilation.'
  - id: existing-deployment-and-monorepo-docs
    severity: blocking
    description: 'Use explicit know-me context and existing Envoy Gateway for Linode/Akamai; root monorepo workflows own builds/deployments and Docusaurus Pages.'
    note: 'No nested inactive workflow assumptions, copied SSR/AKS settings, CI tests or fabricated published About URL. Verify the actual site before setting the repository link.'
```

## Warning constraints

```yaml
constraints:
  - id: current-library-documentation
    severity: warning
    description: 'Resolve and query current Context7 documentation for library/API/CLI-specific work; disclose unavailable documentation and unresolved compatibility.'
  - id: explicit-native-support
    severity: warning
    description: 'Native definitions, model selection and initialization do not prove worker invocation, runtime binding or deployment.'
  - id: complete-platform-evidence
    severity: warning
    description: 'Track Flutter parity from early increments and record physical-device qualification separately; confirm custom titlebar drag and minimize/maximize/restore behavior.'
```

## Workflow triggers

```yaml
workflow_triggers: []
```

No executable trigger is emitted until real commands exist. In particular, no
per-change test trigger or automatic add/commit action is inherited from the
generic template. The lead configures the existing delivery-cadence runner after
build/run prerequisites are real; this file does not invent a scheduler.

The uncomfortable thing: valid KBD metadata can coexist with no runnable app.
Initialization enables specification and planning; it does not close a workflow,
clear known integration blockers or establish build/runtime readiness.
