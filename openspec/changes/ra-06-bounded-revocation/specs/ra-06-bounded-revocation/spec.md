## Purpose

Specify the observable contract for this runtime capability: expire and revoke active replica delivery within a measured bound. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Expire and revoke active replica delivery within a measured bound — outcome 1

The system SHALL satisfy the following outcome: Protected delivery stops within the recorded pre-implementation budget, including cache/token propagation and clock allowance; new requests deny.

#### Scenario: Logout, membership removal or session expiry occurs while a response remains open

- **WHEN** logout, membership removal or session expiry occurs while a response remains open
- **THEN** Protected delivery stops within the recorded pre-implementation budget, including cache/token propagation and clock allowance; new requests deny.

### Requirement: Expire and revoke active replica delivery within a measured bound — outcome 2

The system SHALL satisfy the following outcome: Old authorization cannot be resurrected; protected output stops by the same deadline.

#### Scenario: Invalidation races a cached identity refill or the authority service becomes unavailable

- **WHEN** invalidation races a cached identity refill or the authority service becomes unavailable
- **THEN** Old authorization cannot be resurrected; protected output stops by the same deadline.

### Requirement: Expire and revoke active replica delivery within a measured bound — outcome 3

The system SHALL satisfy the following outcome: Fresh validation refuses it even when a former replica grant/token remains otherwise time-valid.

#### Scenario: A clinical command arrives after revocation

- **WHEN** A clinical command arrives after revocation
- **THEN** Fresh validation refuses it even when a former replica grant/token remains otherwise time-valid.
