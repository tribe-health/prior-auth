# Spec Delta

## Purpose

Decides which UAR agent serves a conversation, in one table shared by the cloud
host, the desktop host and the iOS embedding.

## ADDED Requirements

### Requirement: Scope selects the agent
A `uar` run SHALL be routed by conversation scope kind through one routing table
shared by every host. Scope `onboarding` SHALL route to the PatientGPT onboarding
agent.

#### Scenario: Onboarding run routed
- **WHEN** a `uar` run starts in scope `onboarding`
- **THEN** the request reaches the onboarding agent id from the routing table

### Requirement: Scopes without an agent are refused
A `uar` run in a scope with no routed agent SHALL be refused with code
`agent_unavailable` (HTTP 503) before any request reaches UAR. No scope SHALL fall
back to another agent.

#### Scenario: Case scope this phase
- **WHEN** a `uar` run starts in scope `case:<patientId>:<caseId>` in service mode
- **THEN** it is refused with `agent_unavailable` and the UAR service receives no request

### Requirement: The deterministic mode keeps its current behaviour
In `deterministic` mode, `uar` runs in clinical scopes SHALL keep returning the
existing deterministic reply, so the current demo path is unchanged.

#### Scenario: Deterministic demo
- **WHEN** a `uar` run starts in scope `all` with `PATIENTGPT_UAR_MODE=deterministic`
- **THEN** the reply is exactly the deterministic text from `docs/plan/scaffold-contracts.md`
