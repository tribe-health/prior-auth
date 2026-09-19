# Share document views between A2UI and MCP Apps

## Why

Document previews, citations and QA need consistent responsive presentation inside the browser and external MCP hosts without duplicating clinical controls or confusing protocol formats.

## What Changes

Reuse React/shadcn view models and the four allowlisted document blocks from web-11/web-15. Implement a distinct MCP Apps transport/resource adapter with tool-linked ui:// resources, explicit CSP and host-mediated actions. A2UI descriptors remain a separate wire format. Keep authority, subscriptions and network access in host/channel adapters and feature hooks. Mark streamed output provisional until durable commit; preserve keyboard/source access, mobile layout and reduced motion. Never expose agent-derived clinical controls.

## Capabilities

### New Capabilities

- `da-03-mcp-app-document-surfaces`: Share document views between A2UI and MCP Apps.

## Impact

Approved revision-12 follow-on inside runtime-architecture › web-case-to-letter.
See [the addendum](../../../docs/handoff/web-case-to-letter-revision-12-agent-integration.md). Web only; no native work or production PHI inference.
This proposal records pending work and supplies no implementation evidence.
