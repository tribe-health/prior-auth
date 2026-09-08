## Purpose

Specify the observable contract for this runtime capability: run the shared evidence runtime in tauri with pglite. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Run the shared evidence runtime in Tauri with PGlite — outcome 1

The system SHALL satisfy the following outcome: One DB/sync owner supplies identical entities/lists while selection/filter state remains independent.

#### Scenario: Two Tauri windows show the same case

- **WHEN** two Tauri windows show the same case
- **THEN** One DB/sync owner supplies identical entities/lists while selection/filter state remains independent.

### Requirement: Run the shared evidence runtime in Tauri with PGlite — outcome 2

The system SHALL satisfy the following outcome: Ownership transfers or restarts without duplicate commits and stale windows cannot read/write the old scope.

#### Scenario: A window closes, the owner exits, or identity changes

- **WHEN** A window closes, the owner exits, or identity changes
- **THEN** Ownership transfers or restarts without duplicate commits and stale windows cannot read/write the old scope.

### Requirement: Run the shared evidence runtime in Tauri with PGlite — outcome 3

The system SHALL satisfy the following outcome: Actual first-row/catch-up/teardown measurements and runtime evidence are recorded; a browser build is not substituted.

#### Scenario: The baseline runs on a claimed OS/webview

- **WHEN** the baseline runs on a claimed OS/webview
- **THEN** Actual first-row/catch-up/teardown measurements and runtime evidence are recorded; a browser build is not substituted.
