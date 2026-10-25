# PatientGPT delivery team

The 17-role development team is selected in `.agent-team/project-routing.json`.
Default to relevant team roles for substantive work. Start with product-manager
for acceptance and team-lead for allocation. Roles are a pool, not 17 concurrent
workers; current capacity is lead plus three workers. Small indivisible work may
remain with one owner. Product UAR agents are a separate versioned runtime catalog.

| Role | Responsibility | Exclusive proposed write roots |
|---|---|---|
| product-manager | Product manager for complete prior-authorization user flows | `docs/product/**` |
| team-lead | Team lead and delivery integrator | `.agent-team/**`, `docs/plan/**`, `contracts/**`, `Cargo.toml`, `Cargo.lock`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `scripts/integration/**` |
| creative-director | UI/UX creative director preserving the existing PatientGPT identity | `docs/creative-direction/**` |
| design-expert | Interaction, accessibility and cross-platform design expert | `docs/interaction-design/**`, `assets/templates/design-tokens/**`, `scripts/design-tokens/**` |
| react-engineer | One shared React application for browser and Tauri | `web/**` |
| tauri-engineer | Tauri shell and embedded SurrealDB integration | `desktop/**` |
| flutter-engineer | Flutter mobile implementation with shared Rust services | `mobile/**`, `crates/patient-gpt-ffi/**` |
| rust-domain-engineer | Shared shell-independent Rust services and clinical contracts | `crates/patient-gpt-domain/**`, `crates/patient-gpt-host/**` |
| storage-engineer | Environment storage adapters and replica lifecycle | `crates/patient-gpt-storage/**`, `storage/**` |
| flint-data-engineer | Axum/Postgres and Flint Forge/Fabric integration | `crates/patient-gpt-server/**`, `crates/patient-gpt-flint/**`, `migrations/**` |
| identity-security-engineer | Kratos, Flint Gate and trusted gateway integration | `crates/patient-gpt-identity/**`, `identity/**` |
| uar-agent-expert | UAR agent-building expert for governed product agents, AG-UI and A2UI | `runtime-agents/**`, `crates/patient-gpt-uar/**`, `docs/architecture/uar/**` |
| platform-release-engineer | Monorepo builds, local stack and deployment delivery | `deploy/**`, `scripts/build/**`, `scripts/local-stack/**`, `../.github/workflows/patient-gpt-build.yml`, `../.github/workflows/patient-gpt-deploy.yml`, `../.github/workflows/patient-gpt-docs.yml` |
| documentation-engineer | Docusaurus product, architecture and operator documentation | `website/**`, `docs/operator/**`, `docs/architecture/application/**` |
| phase-verifier | Local full-integration phase verifier | `.prometheus/verification/**`, `tests/integration/**` |
| artifact-critic | Independent architecture and delivery adversarial critic | `.prometheus/review/architecture/**` |
| ui-critic | Independent UI fidelity and accessibility critic | `.prometheus/review/ui/**` |

These roots reserve future implementation ownership; most app roots do not yet
exist. The lead reconciles them with the scaffold before dispatch. Root monorepo
workflow ownership is narrowly listed using `../`; this does not grant broad
write access to the parent or sibling projects. Existing docs/design stays the
source of truth. Consumers do not hand-edit another owner's generated outputs.

## Operating contract

Freeze one scenario and its typed contract before disjoint implementation. Each
handoff gives files/revision, input/output contract, durable record changes,
actual build/demo evidence, unresolved dependencies and next owner. One writer
owns each build directory. The lead resolves conflicts and owns integration.

Use [the delivery plan](docs/plan/patientgpt-delivery-cadence.md): 120-minute
increments, web build and human demo each time, full web/Tauri every even cut.
Tests and independent critics only at full-phase completion. Critics see final
artifacts and acceptance, never generation history. No CI tests.

## Models and native support

Quality-first is the working policy, without a user-specified price cap. All 17
Codex roles select locally configured `gpt-6-astra` with high effort via native
role configuration. `setup/model-selections.json` records task-policy selections
under `.agent-team/`; declared tool support comes from host metadata. Prices are
unknown; no inference probe or comparative model benchmark was run. Portable
roles retain hard/tools requirements; models are not forced across provider
namespaces. Re-select when invocation skills/requirements change.

Claude, OpenCode, Kimi, MiniMax and DeepSeek inherit the invoking harness's
configured model. Their exact model IDs/quality remain unresolved until native
invocation. Kimi and DeepSeek do not have a verified per-role override. This is
not equivalent to 17 verified cross-harness model bindings.

Native files are installed for Codex, Claude, OpenCode, Kimi, MiniMax and DeepSeek.
Zed follows the effective AGENTS.md pointer (or its external ACP agent's native
configuration); no invented Zed delegation API. MiniMax requires launching with
`MINIMAX_DATA_DIR` set to this project's absolute `.minimax` directory; `mcode`
was absent during setup. Definitions and syntax checks do not prove discovery,
agent invocation, a live team or clinical/runtime authorization. If delegation
is unavailable, apply roles sequentially and disclose review-independence limits.

## Skills and research

Requested skills are locally bound under `.agents/skills` and `.claude/skills`.
Use the architecture source checkout `/Users/gqadonis/Projects/hybrid-mobile-architecture-src`
as the primary reference. UI routes through `.agents/UI_UX_PROTOCOL.md` and the
existing docs/design source. Full Impeccable, UI/UX Pro Max, Vercel React and
Flutter skills are available; load narrowly. No generic SWR/query-cache advice,
old Flutter localization generation example or upstream old dependency pin
overrides the project contract. The Impeccable product record is separate from
changing design authority.

Research dossiers: [.prometheus/team-research/uar.md](.prometheus/team-research/uar.md),
[storage/identity](.prometheus/team-research/storage-identity.md), and
[UI/platforms](.prometheus/team-research/ui-platforms.md). The UAR expert owns
full registered PatientGPT A2UI catalog integration: the current nine primitives
do not accept the prototype's full clinical vocabulary. Host ContentBlocks are
an initial slice only. Clinical sign/affirm/submit/outcomes stay host-owned.

The uncomfortable thing: definitions cannot make the proposed stack operational.
PGlite memory use, exact SurrealDB compatibility, native auth headers, Gate/Envoy
admission and UAR catalog registration require production work and final local
integration evidence. The two-hour plan is a delivery rhythm, not a 24-hour
promise for the whole application.
