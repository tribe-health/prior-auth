# Expose authorized document tasks through A2A and MCP

## Why

External agents and tools need the same authorized, durable document-generation task service used by the browser. Separate protocol-specific execution would duplicate authority and create inconsistent results.

## What Changes

Add authenticated A2A and MCP adapters to the assembly service around the host-owned task port. Pin protocol versions before implementation; publish only implemented Agent Card capabilities. Use tenant/case scoped task identities, cancellation, replay and artifacts from one durable task service. MCP client tools come only from configured authenticated servers with independently classified effects and finite budgets. Expose no affirmation, approval, signing, submission, arbitrary SQL/filesystem or credential tools. Task IDs do not confer authority. The store-free kernel does not receive a database dependency.

## Capabilities

### New Capabilities

- `da-02-a2a-mcp-task-adapters`: Expose authorized document tasks through A2A and MCP.

## Impact

Approved revision-12 follow-on inside runtime-architecture › web-case-to-letter.
See [the addendum](../../../docs/handoff/web-case-to-letter-revision-12-agent-integration.md). Web only; no native work or production PHI inference.
This proposal records pending work and supplies no implementation evidence.
