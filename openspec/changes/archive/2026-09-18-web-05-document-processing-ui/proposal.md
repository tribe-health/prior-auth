## Why

The web application cannot perform its central case-to-letter workflow. Extract page provenance, publish processing status, and mount the document intake UI.

## What Changes

- Extract page provenance, publish processing status, and mount the document intake UI.
- Preserve verified tenant scope, three evidence states, clinical authority, source citations, no query cache, and shell-neutral application services.
- Use the browser and its mounted HTTP routes as the only behavioral acceptance surface in this child. Typed Tauri wrappers are deferred to RA19/RA21 after web-17 passes.

## Capabilities

### New Capabilities

- `document-processing-ui`: Extract page provenance, publish processing status, and mount the document intake UI.

### Modified Capabilities

None.

## Impact

This ordered web-first change belongs to `runtime-architecture › web-case-to-letter` and follows the reviewed child plan. It may affect the exact schema, host, server, projection, or React surfaces named by that plan; implementation is not authorized by this planning artifact alone.

## Delivered result

The browser intake route now mounts upload and committed processing-status UI. The server exposes bounded processing and lookup contracts, persists deterministic page provenance, and publishes an exact minimized document-status relation. Source text, embeddings, storage identity, and parser diagnostics remain local. Focused fresh and populated-upgrade integration, reversible negative controls, Artifact Refiner, and isolated adversarial review passed. Actual-browser end-to-end certification remains Web-17.
