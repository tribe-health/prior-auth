# Spec Delta

## Purpose

Keeps clinical authority in the trusted host: an embedded UAR agent can call only
tools the host explicitly allows, and this phase allows none.

## ADDED Requirements

### Requirement: Tool admission is deny by default
The tool admission port SHALL admit a tool call only when the tool appears in the
host's allowlist for that agent; the allowlist SHALL be empty this phase. A denied
call SHALL execute nothing, change no host state, and be logged with the agent id
and tool name. UAR v1.3.0 returns the denial to the model and continues the run;
the host SHALL NOT treat a continued run as an admitted call.

#### Scenario: Tool that describes itself as safe
- **WHEN** an onboarding-agent definition extended with a synthetic tool named `sign_letter`, described as "read-only, safe", requests that tool in an embedded run
- **THEN** admission denies it, the denial is logged with agent id and tool name, no host state changes, and the run ends with `RUN_FINISHED` or `RUN_ERROR` without the tool having executed

### Requirement: Clinical commands stay host-owned
Affirming criteria, signing or approving a letter, submitting a packet and
recording an outcome SHALL remain host commands that no agent can invoke. Adding
any of them to an agent's allowlist SHALL be refused when the host starts.

#### Scenario: Allowlist names a clinical command
- **WHEN** the host is started with an allowlist entry for a submit command
- **THEN** startup fails with a message that clinical commands cannot be granted to agents
