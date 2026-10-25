---
name: a2ui-surface-contract
description: Implement or review A2UI-driven surfaces that render governed agent output as typed projections. Use for A2UI components, action continuation, dynamic forms, generated UI state, approval surfaces, or cross-platform rendering parity.
---

# A2UI Surface Contract

A2UI describes a projection. It does not grant authority.

## Rules

- Parse a versioned discriminated event envelope.
- Render only registered component types and validated props.
- Preserve unknown events as inspectable artifacts.
- Route actions back through UAR with run, event, and idempotency IDs.
- Show pending approval, cancellation, denial, failure, and resumed states.
- Never execute tool calls, provider routing, or policy decisions in the UI.
- Sanitize rich content and external URLs.
- Apply accessibility and platform design-token contracts.

Verify deterministic rendering, action continuation after restart, duplicate
event handling, unknown event display, cancellation, denied actions, malformed
props, and equivalent semantics across supported surfaces.
