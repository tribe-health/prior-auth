# Architecture decision index

Reconciled 2026-09-16 across all five project directories.

The [application runtime architecture](application-runtime-architecture.md) is
the accepted ASO target design. This index maps every current ADR to that design.
Accepted describes a decision, not implemented behavior or a passing runtime
test. Historical superseded text is evidence of earlier choices, not an
alternative current instruction. Dependency pins remain governed by each
repository's version contract; ADR-010 uses the exact native-session pins in
`versions.toml`.

The [Web Case-to-Letter Workflow Contract](web-case-to-letter-contract.md) is
the normative execution contract for the current web-first child. It freezes
the lifecycle, criteria migration, citation, command parity, privacy,
invalidation, error and fixture matrices for the complete browser request and
denial-response workflows. Browser certification through `web-17`, `ra-20`
and browser-scoped `ra-22` precedes Tauri SQLite and native updater
certification. Native evidence cannot block or substitute for the browser
result.

## UI implementation architecture

[React UI and component architecture](react-ui-component-architecture.md) maps
all prototype screens into shadcn-based parts, sections/cards and feature views.
It defines scoped PEM/Zustand hooks, command/draft boundaries, mobile adaptation
on resize and accessible motion. It elaborates existing ADRs; it is not evidence
that these runtime or UI contracts are implemented. See the
[critic/judge review receipt](react-ui-component-architecture-review.md) for
findings, dispositions and verification limits.

The [Tauri PGlite baseline](tauri-pglite-baseline.md) records the actual macOS
WKWebView cold, catch-up, persistence-reopen and teardown measurements plus the
managed-device persistence policy. It is a measured baseline, not approval to
persist clinical data on every desktop.

## ASO decisions

| Record | Status | Current scope |
|---|---|---|
| [ASO ADR-001](adr-001-no-query-cache.md) | Accepted | No client query cache; PEM owns business entities; runtime/control state exceptions are explicit |
| [ASO ADR-002](adr-002-clinical-authority.md) | Accepted | Independent Gate, AppServices and Postgres clinical checks on all command paths |
| [ASO ADR-003](adr-003-three-evidence-states.md) | Accepted | met/gap/void remain distinct from runtime loading and authorization state |
| [ASO ADR-004](adr-004-component-model.md) | Accepted | Three component layers shared across browser and desktop; environment adapters at composition |
| [ASO ADR-005](adr-005-navigation-and-gating.md) | Accepted | Navigation combines verified read permission, ready graph and committed case gate state |
| [ASO ADR-006](adr-006-entity-graph-binding.md) | Superseded by ASO 008 | Historical entity binding; not the current universal state-ownership rule |
| [ASO ADR-007](adr-007-local-first-sync.md) | Superseded by ASO 009 | Historical browser-only sync and projection claims; not current privacy proof |
| [ASO ADR-008](adr-008-shared-runtime-state-and-sessions.md) | Accepted target | Shared runtime, Zustand-backed PEM, scoped sessions and identity teardown |
| [ASO ADR-009](adr-009-authorized-replicas-and-updates.md) | Accepted target | Authorized SQL replication, browser/native storage, migration and update lifecycle |
| [ASO ADR-010](adr-010-native-session-credentials.md) | Accepted; facility and typed IPC slices implemented | Host-owned native Kratos credential storage, sanitized renderer projection, constrained clinical commands, cross-window invalidation and selected system-browser SSO completion |

ADRs 001–005 retain their original decisions with dated runtime alignment;
006–007 retain the original decision bodies under explicit historical headings.
008–009 are the focused successors. ADR-010 records the implemented credential
facility and typed IPC slices, including mock-runtime two-window invalidation,
without claiming production-window, OIDC or multi-platform certification.

## Companion fabric decisions

FRF numbering is independent of ASO numbering. Its standalone operator UI,
CRDT engine and media plane do not determine ASO clinical replica storage.

| Record | Status | Relationship to ASO |
|---|---|---|
| [FRF ADR-001](../../../../../prometheus/flint-realtime-fabric/docs/decisions/adr-001-crdt-engine.md) | Accepted | Loro belongs to the document lane, not replicated clinical rows |
| [FRF ADR-002](../../../../../prometheus/flint-realtime-fabric/docs/decisions/adr-002-agent-bus-tenant-isolation.md) | Accepted generic; partially superseded for ASO by FRF 009 | Tenant subscription grants alone cannot enable protected ASO agent output |
| [FRF ADR-003](../../../../../prometheus/flint-realtime-fabric/docs/decisions/adr-003-ffi-codegen-versions.md) | Accepted | FFI/code-generation scope; no ASO storage or Flutter certification |
| [FRF ADR-004](../../../../../prometheus/flint-realtime-fabric/docs/decisions/adr-004-admin-ui-oidc-idp.md) | Proposed | Standalone admin OIDC; Hydra is not an ASO prerequisite |
| [FRF ADR-005](../../../../../prometheus/flint-realtime-fabric/docs/decisions/adr-005-media-transport-port.md) | Proposed; ownership refined by FRF 008 | Distinct media/signaling types; existing crate-packaging rule deviation explicitly recorded |
| [FRF ADR-006](../../../../../prometheus/flint-realtime-fabric/docs/decisions/adr-006-rtp-fanout.md) | Proposed; ownership refined by FRF 008 | Room routing retained; old per-session task/socket assumptions are historical |
| [FRF ADR-007](../../../../../prometheus/flint-realtime-fabric/docs/decisions/adr-007-media-path-authz.md) | Accepted; ASO qualified by FRF 009 | Room-join checks plus bounded expiry/revocation required for ASO protected media |
| [FRF ADR-008](../../../../../prometheus/flint-realtime-fabric/docs/decisions/adr-008-shared-media-socket.md) | Accepted | Lazy shared socket and owning demux task; no client database decision |
| [FRF ADR-009](../../../../../prometheus/flint-realtime-fabric/docs/decisions/adr-009-aso-runtime-integration.md) | Accepted ASO target | Authorized shape facade, identity bridge, subject/run visibility and revocation gates |

Proposal statuses in FRF 004–006 are retained. Implementation evidence does not
retroactively accept a proposal. FRF 008 takes precedence for the socket and
driver-task ownership portions of 005–006. FRF 009 supplies the stricter ASO
integration boundary without claiming generic fabric deployments implement it.

## Other project directories

| Directory | Decision inventory result |
|---|---|
| `flint-forge` | No formal ADR found in maintained source/documentation; Forge Postgres contract is compatible with ASO server authority |
| `flint-gate` | No formal ADR found in maintained source/documentation; verified identity and token bridge are incorporated in ASO 008 and FRF 009 |
| `prometheus-entity-management` | No numbered ADR found; the unnumbered incremental-query decision is reviewed below |

PEM's [incremental-query ceiling decision](../../../../../prometheus/prometheus-entity-management/docs/incremental-query-ceiling.md) is a
dated v2 performance record. Full-query re-derivation and remote evaluation
thresholds inform measurements; they are not a verified v4 performance SLA or
a mandate to add a query cache. The runtime architecture requires representative
measurements before choosing production thresholds.

## Audit boundary and unresolved implementation

Inventory includes 19 numbered ADRs (10 ASO, 9 FRF) plus the PEM unnumbered
decision. Searches covered maintained files in all five roots; dependency,
build, vendored skill/example and archived session artifacts are not active
application decisions. Append-only memory and superseded specs retain history.

The uncomfortable limitation is that consistent documents cannot prove the
runtime. The authorized facade, bounded revocation, scoped PEM lifecycle,
committed projection, public Kratos startup, macOS native credential facility
and mock-runtime native command parity now have local change evidence, and the
reviewed PEM candidate is adopted. The browser materializer remains disabled
after exceeding its memory gate. An actual macOS two-window lifecycle and
synthetic PGlite IndexedDB round trip are now measured; production shape
materialization, native SQLite parity, update coordination, OIDC activation and
Windows/Linux qualification still require implementation and the runtime
architecture's final acceptance matrix.
The existing media crate packaging also remains a documented source/rule
discrepancy; no code or standing rule was changed to conceal it.
