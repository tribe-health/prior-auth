## Why

The web application cannot perform its central case-to-letter workflow. Stage and commit bounded tenant-scoped case documents with durable idempotency.

## What Changes

- Stage and commit bounded tenant-scoped case documents with durable idempotency.
- Preserve verified tenant scope, three evidence states, clinical authority, source citations, no query cache, and shell-neutral application services.
- Use the browser and its mounted HTTP routes as the only behavioral acceptance surface in this child. Typed Tauri wrappers are deferred to RA19/RA21 after web-17 passes.

## Capabilities

### New Capabilities

- `document-upload-core`: Stage and commit bounded tenant-scoped case documents with durable idempotency.

### Modified Capabilities

None.

## Impact

This ordered web-first change belongs to `runtime-architecture › web-case-to-letter` and follows the reviewed child plan. It may affect the exact schema, host, server, projection, or React surfaces named by that plan; implementation is not authorized by this planning artifact alone.
