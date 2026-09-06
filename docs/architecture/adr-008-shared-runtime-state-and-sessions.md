# ADR-008 · Shared application runtime, entity state and sessions

**Status** Accepted target design · **Date** 2026-09-06  
**Supersedes** [ADR-006](adr-006-entity-graph-binding.md).  
**Implementation** Not certified; acceptance of this decision is not a runtime test result.

## Context

One `web/` application serves browsers and Tauri. The earlier distinction
between “the entity graph” and “Zustand” obscured that PEM's normalized graph
is itself a Zustand vanilla store. It also excluded session and lifecycle
projections that must agree within a runtime without becoming business records.

The [application runtime architecture](application-runtime-architecture.md)
sections 4–7 and 9–10 define the complete lifecycle. This ADR records the
current ownership decision; [ADR-009](adr-009-authorized-replicas-and-updates.md)
defines storage, replication and application updates.

## Decision

Select browser or Tauri adapters once at the composition root. Feature hooks,
PEM components, domain records and ordered-ID lists are shared. Environment
detection selects capabilities and transports; it never grants authority.
`aso-host` remains independent of every shell.

| State | Owner | Persistence and scope |
|---|---|---|
| Clinical records and durable preferences | PEM entity graph, projected from their authoritative stores | One scoped graph per mounted session; lists contain IDs only |
| Unsent drafts | Local-only draft entities in PEM, backed by a separate draft store when policy permits | Identity/practice scoped; outside disposable replica generations; no automatic clinical replay |
| Verified session summary | Session Zustand store | Ephemeral; no cookie, opaque token, downstream JWT or key |
| Startup, sync and update progress | Runtime/update Zustand stores | Ephemeral, coordinator-owned; no duplicate clinical records |
| Selection, expansion and filter input | Per-view interaction Zustand store | Ephemeral and independent across views |
| Credentials, migration/checkpoint metadata and logout-pending marker | Trusted platform/storage services | Control data with explicit retention; not additional business entity stores |

“Views must agree” is a useful question for business records, not a universal
test that turns runtime metadata into entities. Additional Zustand stores may
project verified session and lifecycle state. Durable business records and
preferences still belong in PEM. No parallel case/document query cache is added.

Publish all related entity and list changes for a coherent database revision
atomically into PEM. Neither sequential store mutations nor React render
batching alone establishes this guarantee for imperative subscribers.

### Startup and identity changes

Public login, recovery and verification routes require no private database.
Protected startup follows verified identity and membership → authorized
namespace → exclusive database ownership → migration → coherent local
hydration → required initial replication → ready. Database readiness, graph
hydration and server freshness are distinct states.

Every asynchronous task captures the session epoch. On logout, identity change
or practice change, hide protected views, increment the epoch, stop and drain
or fence subscriptions and persistence, close the old namespace, clear object
URLs/forms/selections and destroy the old graph. The next scope receives a
fresh graph. Scope pending actions and status per runtime; module globals are
not a valid account-isolation mechanism.

Kratos browser flows use secure HttpOnly cookies and CSRF protection. Native
flows keep the opaque session token in the trusted host's protected credential
facility. Gate validates the session and resolves authoritative ASO membership;
its verified, audience-bound downstream JWT bridge serves FRF. A Kratos opaque
token is not an OAuth access token or an FRF JWT. Admin identity APIs remain
server-side. Clinical checks remain independent under
[ADR-002](adr-002-clinical-authority.md).

Persist the minimal noncredential `logoutPending` marker before revocation and
check it before passive session restoration, including reloads and new tabs.
Do not clear it merely because a surviving cookie passes `whoami`. Complete
server revocation or an explicit fresh login ceremony must resolve it. Report
incomplete revocation separately from local locking.

Offline protected rendering defaults to locked when authorization cannot be
revalidated. A future exception needs a bounded, server-issued offline grant
and a separate policy decision; this ADR enables none. Signing and affirmation
remain online-only. Unsent drafts can be recovered only by their original
authorized identity, and recovery never executes a clinical command.

### Native state bridges

The Tauri Zustand plugin is optional for non-sensitive shell coordination.
It does not own clinical replicas, credentials, session authority or per-view
selection. Its persistence defaults require explicit handling. PEM's Tauri
graph bridge and any shell bridge must not become competing graph writers.
There is no requirement to adopt that plugin to satisfy this ADR.

## Consequences and alternatives

The cost is an explicit lifecycle coordinator and scoped storage/transport
adapters. A single persisted global Zustand store would be shorter but would
mix authority, sensitive data and account lifetimes. Keeping the original
“only per-view transient Zustand” wording would misdescribe both PEM and the
required session runtime.

The difficult failure is user A's delayed hydration, save or stream callback
publishing into user B's runtime. Namespace separation alone is insufficient;
epoch fencing, drained writes and fresh graph ownership are required together.

## Verification

Apply the runtime architecture section 14 acceptance matrix, including cold and
warm startup, account/practice switching during hydration, logout across reloads,
offline lock, draft recovery and atomic subscriber observations. Existing
structural audits do not prove these lifecycle guarantees. No implementation
or test result is implied by this accepted design.
