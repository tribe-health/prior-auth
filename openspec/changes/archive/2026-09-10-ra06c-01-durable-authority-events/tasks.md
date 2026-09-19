## 1. Contract and persistence

- [x] 1.1 Amend parent RA06, runtime architecture, RA11c and RA13 artifacts with server timing endpoints, authority identities and downstream ownership.
- [x] 1.2 Add fresh-install and upgrade migrations for the session-denial/retry journal and transactional authority outbox; prove authority rollback emits no event.
- [x] 1.3 Implement the shell-neutral logout coordinator, bounded row leases and ASO web-server recovery runner; keep route adapters free of journal transitions.

## 2. Mounted behavior

- [x] 2.1 Refuse denied sessions in session and replica-grant resolution and persist trusted observations of direct Kratos revocation.
- [x] 2.2 Preserve HTTP/Tauri operation parity without accepting renderer-supplied credentials; leave production native activation to RA17.
- [x] 2.3 Test fresh/upgrade/rollback, crash points, retry races, retention and tenant/deployment key isolation with synthetic data.

## 3. Completion evidence

- [x] 3.1 Run applicable T0/T1 and strict OpenSpec validation; sabotage the denial predicate, observe the mounted test fail, restore it, then run artifact-refiner and isolated adversarial review.
