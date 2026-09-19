## Purpose

Specify the observable contract for this runtime capability: expire and revoke active replica delivery within a measured bound. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Expire and revoke active replica delivery within a measured bound — outcome 1

The system SHALL satisfy the following outcome: From an authoritative ASO membership commit, durable session-denial commit or verified session-expiry instant, FRF produces its final protected body frame or cancels before the next frame within the recorded 5,000 ms server ceiling, and a subsequent protected request denies. The claim SHALL exclude operating-system/proxy buffering, network transit and client receipt.

#### Scenario: Logout, membership removal or session expiry occurs while a response remains open

- **WHEN** logout, membership removal or session expiry occurs while a response remains open
- **THEN** the server records its final protected frame or cancellation within 5,000 ms and a subsequent protected request denies, without claiming when previously produced bytes reach the client.

### Requirement: Expire and revoke active replica delivery within a measured bound — outcome 2

The system SHALL satisfy the following outcome: Old authorization cannot be resurrected across Gate replicas; protected body production stops by the same deadline.

#### Scenario: Invalidation races a cached identity refill or the authority service becomes unavailable

- **WHEN** invalidation races a cached identity refill or the authority service becomes unavailable
- **THEN** Gate bypasses stale L1/L2 entries, performs a fresh ASO authority decision and cannot publish an older authority tuple; FRF produces no protected frame after its cancellation point.

### Requirement: Revocation authority is durable and replayable

The system SHALL key session denial by deployment, Kratos issuer and verified Kratos session ID, and SHALL key membership authority by deployment, ASO incarnation and monotonic authorization revision. A membership/capability revision and its authority event SHALL commit in one PostgreSQL transaction. Authority event sequence SHALL follow commit order so a replay cursor cannot skip a lower in-flight event. Logout SHALL commit denial and retry intent before contacting Kratos, retain the denial through original session expiry plus skew, and refuse retry or confirmation writes from an expired lease owner.

#### Scenario: Authority changes survive process and notification failure

- **WHEN** membership changes, logout crosses a crash boundary, a notification is lost or Redis restarts with stale data
- **THEN** the ASO authority event/denial remains replayable, Gate disables cache use until a fresh bootstrap and gap-free catch-up, and protected authorization uses a fresh ASO decision.

#### Scenario: A mounted path observes direct Kratos revocation

- **WHEN** a mounted protected path holding the previously verified signed session identity observes that Kratos reports the session inactive
- **THEN** ASO records the same durable denial before the observation is reusable, cancels the local protected response, and accepts no caller-selected session identity.

### Requirement: Expire and revoke active replica delivery within a measured bound — outcome 3

The system SHALL satisfy the following outcome: Fresh validation refuses it even when a former replica grant/token remains otherwise time-valid.

#### Scenario: A clinical command arrives after revocation

- **WHEN** A clinical command arrives after revocation
- **THEN** Fresh validation refuses it even when a former replica grant/token remains otherwise time-valid.

### Requirement: Clinical command UI preserves authoritative outcomes

The shared React application SHALL expose the completed signing and evidence-reassessment commands through feature hooks and SHALL distinguish submitting, refused, conflict, outcome unknown, accepted awaiting projection and confirmed states without optimistically changing clinical data.

#### Scenario: A signing or reassessment response is delayed, refused or lost

- **WHEN** an authorized user submits a signing or reassessment command and its response is delayed, refused or has an uncertain commit outcome
- **THEN** the owning control remains correlated to the command, prevents duplicate submission, explains the current state accessibly, and offers lookup when reconciliation is required; it reports completion only after the authoritative result and read projection agree.

### Requirement: Revocation UI fences protected content across form factors

The shared React application SHALL project logout, membership removal, session expiry and an observed replica revalidation failure into one access-state boundary used in browser and Tauri environments. The boundary SHALL accept a later server-verified session as a new epoch. `ra-11c-sql-materialization` owns the real materializer caller that publishes replica revalidation failure into this boundary. Initiating a public Kratos authentication flow is specified by `ra-12-public-auth-startup`; foreground/resume orchestration, durable client logout control and same-identity draft recovery are specified by `ra-13-epoch-logout-and-drafts` after G-DATA permits persistence.

#### Scenario: Access ends while a protected view or clinical command is active

- **WHEN** access ends while a protected view or clinical command is active
- **THEN** protected content and mutation controls are hidden or disabled before exit animation, an accessible message identifies the session or permission change and states that sign-in is required, pending callbacks are generation-fenced, and a later server-verified session opens a new graph epoch without exposing the prior session's replica.

#### Scenario: The viewport crosses mobile and desktop layouts during a command

- **WHEN** the viewport resizes while signing, reassessment or reconciliation is active
- **THEN** the command owner and status remain stable; controls adapt between inline/card and narrow sticky or dialog/sheet compositions with visible focus, 44px targets and reduced-motion support.
