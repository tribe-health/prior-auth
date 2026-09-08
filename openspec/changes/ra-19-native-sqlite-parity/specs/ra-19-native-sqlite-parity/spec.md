## Purpose

Specify the observable contract for this runtime capability: evaluate a native sqlite materializer against the pglite baseline. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Evaluate a native SQLite materializer against the PGlite baseline — outcome 1

The system SHALL satisfy the following outcome: Normalized IDs, nulls, dates, ordering, relationships and checkpoint recovery match. Annotation entities, gate summary and every relation in the ra-18 projection are included; a five-table-only experiment cannot pass release parity.

#### Scenario: The same synthetic stream including deletes/refetch is applied to both engines

- **WHEN** the same synthetic stream including deletes/refetch is applied to both engines
- **THEN** Normalized IDs, nulls, dates, ordering, relationships and checkpoint recovery match. Annotation entities, gate summary and every relation in the ra-18 projection are included; a five-table-only experiment cannot pass release parity.

### Requirement: Evaluate a native SQLite materializer against the PGlite baseline — outcome 2

The system SHALL satisfy the following outcome: A single host owner preserves transaction/isolation and recovery behavior equivalent to the baseline.

#### Scenario: Two windows, migration failure or an interrupted commit are exercised

- **WHEN** two windows, migration failure or an interrupted commit are exercised
- **THEN** A single host owner preserves transaction/isolation and recovery behavior equivalent to the baseline.

### Requirement: Evaluate a native SQLite materializer against the PGlite baseline — outcome 3

The system SHALL satisfy the following outcome: SQLite release selection remains blocked and the tested PGlite baseline remains the candidate; no parity success is fabricated.

#### Scenario: Parity, approved encryption/storage or a measured benefit is absent

- **WHEN** parity, approved encryption/storage or a measured benefit is absent
- **THEN** SQLite release selection remains blocked and the tested PGlite baseline remains the candidate; no parity success is fabricated.
