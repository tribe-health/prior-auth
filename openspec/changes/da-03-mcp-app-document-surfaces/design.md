# Share document views between A2UI and MCP Apps

## Context and Decision

Reuse React/shadcn view models and the four allowlisted document blocks from web-11/web-15. Implement a distinct MCP Apps transport/resource adapter with tool-linked ui:// resources, explicit CSP and host-mediated actions. A2UI descriptors remain a separate wire format. Keep authority, subscriptions and network access in host/channel adapters and feature hooks. Mark streamed output provisional until durable commit; preserve keyboard/source access, mobile layout and reduced motion. Never expose agent-derived clinical controls.

## Dependencies

Follow [revision 12](../../../docs/handoff/web-case-to-letter-revision-12-agent-integration.md) after the accepted responsive web repairs.
No database migration or clinical write belongs to a protocol renderer. Host ports
and their final-transaction guarantees must exist before these adapters run.

## Verification

Local focused checks after each unit; full stack under web-17 after all packages.
No CI or native result substitutes for browser/protocol evidence.

## Uncomfortable limitation

Protocol conformance and consistent presentation do not prove clinical truth or
that the person reviewing a cited source has understood it. Preserve source review
and independent clinical authorization.
