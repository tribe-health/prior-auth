## Why

Gate's current generation is process-local. A second replica can reuse or republish an older
session cache entry after another replica invalidates it.

## What Changes

Consume ASO authority events into a shared, monotonic Redis fence; stamp L1/L2 entries; publish only
through an atomic version check; and bypass caches whenever source freshness cannot be proved.

## Capabilities

### New Capabilities

- `ra06c-02-distributed-gate-fence`: Enforce distributed session-cache invalidation.

### Modified Capabilities

None.

## Impact

Flint Gate cache/auth pipeline, Redis integration, least-privilege ASO event consumption and local
two-instance tests. Depends on `ra06c-01-durable-authority-events`.
