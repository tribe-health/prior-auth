# ra06c-02-distributed-gate-fence Specification

## Purpose
Define one recoverable cache-coherency fence shared by every Gate replica.

## Requirements

### Requirement: Cache publication is fenced atomically

Gate SHALL atomically compare the candidate authority stamp with the current shared fence before
publishing an L1 or L2 session entry.

#### Scenario: Invalidation races a delayed refill

- **WHEN** one Gate replica starts a refill and another advances the authority fence
- **THEN** the delayed refill cannot publish or serve its older result on either replica.

### Requirement: Consumer lag cannot grant protected access

Gate SHALL probe durable event high-water within 250 ms and SHALL perform fresh ASO authority
validation for every protected authorization. Gate SHALL apply the request-entry deadline to every
awaited pre-upstream operation that can precede that fresh decision, including versioned
session-cache read and publication. Deadline expiry SHALL return the structured
`503 authority_decision_unavailable` response.

#### Scenario: Event consumer stalls after bootstrap

- **WHEN** ASO commits a later authority event and the running consumer stops advancing
- **THEN** cache use is disabled after the probe deadline and protected access denies from the fresh ASO decision within the 5,000 ms contract.

#### Scenario: An earlier hook stalls before the fresh authority decision

- **WHEN** a protected route runs a database-backed hook before its fresh ASO callback and that dependency stalls
- **THEN** the earlier hook consumes the same request-entry deadline and Gate returns `503 authority_decision_unavailable` within the 5,000 ms contract.

#### Scenario: A non-Kratos route owns a fresh authority decision

- **WHEN** an anonymous, API-key, JWT or other non-Kratos route contains a fresh ASO callback and an earlier operation stalls
- **THEN** the callback's presence activates the request-entry deadline independently of the authenticator and Gate returns `503 authority_decision_unavailable` within the 5,000 ms contract.

### Requirement: Stream watchdog lifetime is scoped to its stream

Gate SHALL cancel the periodic session watchdog and release its retained credential probe whenever
the corresponding protected stream ends.

#### Scenario: Protected stream completes or its client disconnects

- **WHEN** the upstream reaches end-of-stream or the downstream receiver closes
- **THEN** the forwarding scope cancels and aborts its watchdog task before releasing the stream-owned state.

### Requirement: Redis cannot attest to freshness

Gate SHALL bootstrap from a repeatable-read ASO snapshot and gap-free event replay before each
process enables caches.

#### Scenario: Redis is partitioned, empty or restored from an older snapshot

- **WHEN** a Gate process observes missing or lower fence state
- **THEN** it bypasses L1/L2 until authoritative bootstrap and replay complete, and authority failure denies.

### Requirement: Runtime configuration publication is serialized

Gate SHALL publish live database-backed route and Cedar changes as one serialized revision. Gate
SHALL detect file-backed configuration changes but SHALL leave the active route,
authentication-provider and Cedar snapshots unchanged until restart. When database-backed
configuration is enabled, Gate SHALL publish the first stable route/Cedar pair before binding an
HTTP listener and SHALL refuse startup if that publication fails.

#### Scenario: Configuration file changes while requests are active

- **WHEN** the watched Gate configuration file changes after startup
- **THEN** Gate reports that restart is required and every request continues with the previously installed route, authentication-provider and Cedar snapshots.

#### Scenario: Configuration update is malformed or delivered in parts

- **WHEN** a watched file update is malformed or a partial write is followed by a valid write
- **THEN** Gate reports that restart is required independently of parsing the new bytes, debounces on the trailing edge, and leaves every active configuration surface unchanged.

#### Scenario: Mounted configuration target rotates

- **WHEN** the configured file is atomically replaced or its resolved symlink target changes
- **THEN** Gate reports that restart is required and continues observing the original configured path without applying the replacement at runtime.

#### Scenario: Mounted configuration target rotates repeatedly

- **WHEN** a mounted configuration path resolves through a sequence of distinct target directories
- **THEN** Gate retains the original-path watch, replaces the prior resolved-target watch, and reports later rotations without accumulating target-directory watches.

#### Scenario: Configuration changes while a replica starts

- **WHEN** a route or Cedar mutation commits while another Gate replica is starting
- **THEN** the replica serves only after one stable durable revision has supplied both surfaces.

#### Scenario: Configuration publication stalls request snapshot capture

- **WHEN** a protected request arrives while another task holds the process-local configuration publication guard
- **THEN** snapshot acquisition consumes the same request-entry deadline as authentication and authority hooks, and expiration returns `503 authority_decision_unavailable` within the 5,000 ms contract.
