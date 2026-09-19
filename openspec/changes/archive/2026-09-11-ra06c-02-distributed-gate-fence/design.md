## Context

Redis L2 is shared, but cached entries carry a process-local generation. Pub/Sub alone cannot make
notification loss, reordering or Redis restoration safe.

## Decisions

- Stamp entries with deployment, issuer, verified session identity and ASO incarnation/revision.
- Perform version comparison and cache publication atomically using an API verified against the
  locked redis-rs version.
- Poll ASO outbox high-water at most every 250 ms. Lag or probe failure disables L1/L2 use.
- Bootstrap with one repeatable-read ASO snapshot plus durable high-water replay. Readiness is
  process-local; Redis cannot declare itself current.
- Every protected authorization still makes a fresh ASO authority-fence probe. Redis accelerates
  identity work and never replaces authority.
- Derive protected-request deadline enforcement from the route's fresh ASO callback, independently
  of its authenticator. Apply that absolute request-entry deadline to authentication, body
  collection, versioned session-cache reads and publication, lookup resolution and every awaited
  pre-request hook operation that may run before the fresh decision. Every deadline expiry returns
  the structured `503 authority_decision_unavailable` response.
- Own each stream watchdog inside the stream-forwarding task. Any forwarding exit cancels and
  aborts the watchdog so cached or raw credential probes are released with the stream.
- Watch the original file-backed Gate configuration path and its resolved target. Debounce on the
  trailing edge, report malformed writes, atomic replacement and mounted symlink rotation as
  restart-required changes, retain only the current resolved-target directory watcher, and never
  replace live route, authentication-provider or Cedar state outside the serialized database
  publisher.
- Before binding either HTTP listener, prepare and publish the first database-backed route and
  Cedar pair through the same stable-revision and advisory-lock protocol used for live changes.
- Bound process-local configuration snapshot acquisition with the request-entry deadline. Release
  the publication guard before best-effort Redis payload deletion because the shared epoch already
  makes prior payloads unusable.

## Failure behavior

Missing, lower, partitioned or restored Redis state disables caches. Fresh authority failure
denies. Duplicate or reordered events cannot reduce the fence.
