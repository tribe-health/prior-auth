# ra-02-durable-affirmation Specification

## Purpose
Specify the observable contract for this runtime capability: persist authenticated gate affirmation with independent controls. These requirements preserve verified scope and honest delivery evidence across the application.

## Requirements

### Requirement: Persist authenticated gate affirmation with independent controls — outcome 1

The system SHALL satisfy the following outcome: Gate policy, AppServices capability and the database each enforce authority; one durable affirmation and audited result commit atomically.

#### Scenario: An authorized surgeon affirms with a stable command ID

- **WHEN** an authorized surgeon affirms with a stable command ID
- **THEN** Gate policy, AppServices capability and the database each enforce authority; one durable affirmation and audited result commit atomically.

### Requirement: Persist authenticated gate affirmation with independent controls — outcome 2

The system SHALL satisfy the following outcome: Each layer refuses independently, even when the other two are bypassed by the test harness.

#### Scenario: Administrator, agent or foreign-practice actor attempts affirmation at each enforcement layer separately

- **WHEN** administrator, agent or foreign-practice actor attempts affirmation at each enforcement layer separately
- **THEN** Each layer refuses independently, even when the other two are bypassed by the test harness.

### Requirement: Persist authenticated gate affirmation with independent controls — outcome 3

The system SHALL satisfy the following outcome: A lookup/retry reconciles the committed result without a second effect; payload conflict is explicit.

#### Scenario: The response is lost, or the same command ID carries a different payload

- **WHEN** the response is lost, or the same command ID carries a different payload
- **THEN** A lookup/retry reconciles the committed result without a second effect; payload conflict is explicit.

### Requirement: Persist authenticated gate affirmation with independent controls — outcome 4

The system SHALL satisfy the following outcome: The cases.gate_affirmed_at derived value updates or clears transactionally, and a caller cannot directly spoof it.

#### Scenario: Another authorized surgeon adds or removes a required affirmation

- **WHEN** another authorized surgeon adds or removes a required affirmation
- **THEN** The cases.gate_affirmed_at derived value updates or clears transactionally, and a caller cannot directly spoof it.
