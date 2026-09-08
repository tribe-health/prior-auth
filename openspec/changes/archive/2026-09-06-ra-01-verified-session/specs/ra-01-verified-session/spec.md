## Purpose

Specify the observable contract for this runtime capability: return an authoritative aso session and practice scope. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Return an authoritative ASO session and practice scope — outcome 1

The system SHALL satisfy the following outcome: Both yield the same sanitized scope, expiry and authorization revision without exposing credentials; fresh Postgres membership is authoritative.

#### Scenario: A valid browser cookie or native-token harness request selects an allowed practice

- **WHEN** A valid browser cookie or native-token harness request selects an allowed practice
- **THEN** Both yield the same sanitized scope, expiry and authorization revision without exposing credentials; fresh Postgres membership is authoritative.

For this scenario, expiry parity means preserving the expiry Kratos verified for
the credential being used. Two transports carrying the same session must return
the same expiry. Separate browser and native logins create distinct sessions and
may have different expiry timestamps; neither transport may substitute or extend
its session's expiry. Scope and authorization revision must agree for the same
identity and selected practice while database authority is unchanged. This is
the task 1.2 design's existing transport contract.

### Requirement: Return an authoritative ASO session and practice scope — outcome 2

The system SHALL satisfy the following outcome: The mounted service ignores untrusted identity hints and denies the unauthorized scope; anonymous returns 401, provider failure remains distinguishable as unavailable.

#### Scenario: A client forges identity headers, role traits or a foreign practice

- **WHEN** A client forges identity headers, role traits or a foreign practice
- **THEN** The mounted service ignores untrusted identity hints and denies the unauthorized scope; anonymous returns 401, provider failure remains distinguishable as unavailable.

### Requirement: Return an authoritative ASO session and practice scope — outcome 3

The system SHALL satisfy the following outcome: Each transaction receives only its verified context and cannot inherit the previous identity; deactivated membership is refused.

#### Scenario: Two identities reuse pooled database connections

- **WHEN** two identities reuse pooled database connections
- **THEN** Each transaction receives only its verified context and cannot inherit the previous identity; deactivated membership is refused.
