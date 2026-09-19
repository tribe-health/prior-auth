## Why

RA06 cannot enforce bounded revocation while logout and membership changes have no durable,
replayable application event. Process-local cache invalidation does not survive another Gate
replica or a failed notification.

## What Changes

Add an ASO session-denial and retry journal, a transactional authority event stream, and one
shell-neutral logout coordinator with bounded recovery leases. Correct parent RA06's timing claim
and assign the future materializer and resume callers to RA11c and RA13.

## Capabilities

### New Capabilities

- `ra06c-01-durable-authority-events`: Persist and replay session and membership revocation.

### Modified Capabilities

- `ra-06-bounded-revocation`: Measure server-controlled response production.
- `ra-11c-sql-materialization`: Own the real replica-failure publisher caller.
- `ra-13-epoch-logout-and-drafts`: Own resume and draft-recovery orchestration.

## Impact

ASO migrations, session ports/services, Axum adapter, Tauri parity contract and runtime
architecture documentation. Dependency: parent RA06. No public login or native credential owner.
