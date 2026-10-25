# PatientGPT team setup receipt

Specification/setup scope, 2026-10-04. Application waypoint remains `spec` /
`bootstrap`; the delivery clock is not active. The application has no scaffold
build/run commands yet. This receipt does not certify application behavior.

## Changed artifacts

| File or generated group | Change |
|---|---|
| `TEAM.md` | 17-role roster, ownership, handoffs, models and native limitations |
| `AGENTS.md`, `CLAUDE.md` symlink | Default team routing and operator architecture/cadence overrides; symlink preserved |
| `versions.toml` | Architecture targets/decisions, not falsely installed dependency pins |
| `README.md` | Links to team and delivery/acceptance docs |
| `PRODUCT.md` | Impeccable product schema for existing docs/design scope; future buildPath unset |
| `.agent-team/patientgpt-delivery/team.json`, `project-routing.json`, `state.json` | Validated portable team, selected Codex routing and initialized local coordination state |
| `.agent-team/setup/`, `.agent-team/exports/` | Reproducible requests, model selections, staged native exports and installation/check receipts |
| `.codex/agents`, `.claude/agents`, `.opencode/agents`, `.kimi-code/agents`, `.minimax/agents`, `.dsh/profiles` | Six native target installations; Zed uses effective shared instructions |
| `.agents/skills`, `.claude/skills` selected bindings | Requested source architecture/process skills and full Impeccable available locally; existing UI/UX Pro Max, Vercel and Flutter bundle preserved |
| `docs/plan/patientgpt-delivery-cadence.md` | 12 proposed increments across three full phases; real-command activation prerequisites |
| `docs/product/team-product-brief.md` | Seven workflow acceptance scenarios and backlog |
| `.prometheus/project-contract.md` | Reconciled deferred team text and current target decisions |
| `.prometheus/{decisions,gotchas,session-log}.md` | Append-only setup decisions, observed integration gaps and session record |
| `.prometheus/team-research`, `.prometheus/research` | Three dossiers, source ledgers, full research package, validation and supplemental review evidence |
| `.prometheus/review/architecture/team-final-findings.json` | Fresh-context final team critic receipt |

Exact native file names/hashes and preserved differences are in
`../.agent-team/setup/native-artifact-inventory.json`. The only native export
mismatch is the deliberately preserved pre-existing Claude artifact critic;
shared project routing supplies its team role contract.

## Checks actually run

- Creator `validate --input .agent-team/setup/team-request.json`: `valid: true`.
- Creator `models-select` for each role: 17 selections of locally configured
  gpt-6-astra under explicit task policy; unknown prices, no inference probe.
- Creator `init`, six `export`, six `install-project --dry-run` then apply:
  exit 0. Targets: claude: 17 native files, opencode: 17 native files, kimi: 17 native files, minimax: 17 native files, deepseek: 18 native files, codex: 17 native files.
- Creator `install-project --project <patient-gpt> --check`: exit 0,
  `clean: true`, `changed: []` for selected Codex routing.
- Native inventory: `103` files exist; `102` match staged exports, one existing
  bootstrap critic preserved. Seventeen Codex TOML files parsed; JSON-native
  frontmatter parsed; all bound `.agents/skills/<id>/SKILL.md` files exist.
- Full local Impeccable `scripts/engine.mjs context`: exit 0;
  `PRODUCT_INIT_REQUIRED` absent after PRODUCT.md creation.
- `versions.toml` parsed; CLAUDE.md resolves to AGENTS.md.
- Deep-research package check: `RESULT: PASS` for structural contract;
  evidence status remains `partial`, with three unresolved integration conflicts.
- Fresh-context team critic: no findings. Supplemental research review found two coverage warnings and then one
  evidence-label warning; all were repaired. Final narrow closure: zero findings.
  Original findings and repairs remain in the package's `review/` directory.

These are cheap artifact checks and completed-specification review, not an
application test suite. No app builds, runtime tests, CI dispatch, deployment,
Pages publication, GitHub About mutation, commit or push occurred.

## Review boundary and limitations

The gateway judge refused because distinct-model identity could not be
established. Its managed checkpoint/provenance correctly retain a blocked gateway
review. Supplemental harness-native reviews use a fresh context without generator
history; distinct-model independence remains unverified. Do not overwrite that
limitation or interpret `adversarial_review_used: false` in the managed research
manifest as a claim that no supplemental review occurred.

Native role discovery/invocation in each CLI is unverified; MiniMax CLI was absent.
Exact non-Codex models inherit each harness and remain unresolved. Cadence runtime
activation awaits real build/run commands; the proposed schedule is not running.
PGlite memory use, SurrealDB 3.3.0 compatibility, native session translation,
Gate/Envoy enforcement, registered UAR components and physical device behavior
require implementation and full-phase local integration evidence.

## Scope and guard audit

No production guards or application code were added. Clinical, tenant, tool and
identity restrictions in role contracts trace to explicit user/project trust
boundaries and observed source mismatches. No unrelated work was added; sibling
repositories and cluster state were inspected read-only. The uncomfortable thing
is that a complete roster and regular build cadence can still fail to deliver a
usable clinical workflow; product acceptance remains a separate phase gate.
