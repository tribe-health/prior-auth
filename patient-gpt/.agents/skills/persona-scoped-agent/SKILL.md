---
name: persona-scoped-agent
description: Design or audit an agent whose prompts, tools, retrieval, and actions are constrained by a verified persona and project policy. Use for role-aware agents, assistant modes, capability sets, human release gates, or persona-specific context.
---

# Persona-Scoped Agent

A persona is a bounded behavior and capability configuration, not a trusted
role supplied by the client.

## Rules

- Resolve persona eligibility from `VerifiedSession` and project policy.
- Pin persona version, system instructions, tool allowlist, retrieval scopes,
  model requirements, and budgets.
- Keep authorization in policy; prompt text cannot grant capability.
- Treat retrieved content and tool metadata as untrusted.
- Require named human release for irreversible or externally consequential
  actions when project policy says prepare/flag only.
- Record the effective persona and policy revision on every run.

Test persona escalation attempts, hidden tool invocation, cross-tenant
retrieval, policy changes during a run, expired sessions, and human-release
boundaries.
