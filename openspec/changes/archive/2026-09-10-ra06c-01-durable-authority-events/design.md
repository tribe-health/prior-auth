## Context

Kratos owns authentication. ASO PostgreSQL owns membership. The existing global ASO authority
revision advances transactionally but emits no durable event, and logout calls Kratos without an
ASO denial record.

## Decisions

- Key denials by deployment, Kratos issuer and verified session ID. Retain them through original
  session expiry plus the recorded skew allowance.
- Write the new authority revision and outbox event in the same membership transaction. Serialize
  every outbox allocation on the authority singleton so sequence order cannot precede commit order.
- Use one shell-neutral logout coordinator. It commits denial and retry intent, claims the initial
  lease, confirms Kratos revocation, then marks confirmed. A retry or confirmation transition must
  still own an unexpired lease at its observation time. A recovery runner claims expired leases.
- A trusted mounted observation of external Kratos revocation records the same denial. Untrusted
  callers cannot choose the session identity.
- HTTP and Tauri keep one operation contract. Production native credential activation remains RA17.

## Failure ordering

A crash before denial commit returns no success. A crash after commit leaves access denied and the
row retryable. A crash after Kratos revocation repeats inactive-state confirmation. The denial is
never deleted merely because retry completed.

## Limits

The global revision invalidates more practices than necessary. That cost is accepted for this
repair because it cannot widen authority.
