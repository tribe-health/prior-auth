# UAR Tool-Governance Boundary

Application-facing code never executes a raw MCP transport. It submits a typed
tool intent to Universal Agent Runtime and receives governed lifecycle events.

## Required execution sequence

1. Resolve a paired, non-revoked server and stable tool identity.
2. Validate the input against the pinned JSON Schema.
3. Classify effects independently of MCP annotations.
4. Evaluate project policy with `VerifiedSession`, tenant, resource, and effect.
5. Emit an approval request when policy requires confirmation.
6. Execute with an idempotency ID, deadline, output budget, and cancellation.
7. Validate, truncate, and redact the output according to schema and policy.
8. Append an immutable result containing decision, timing, digest, and outcome.

Unknown servers, schemas, actors, tenants, effects, and policy actions are
denied. Tool descriptions and MCP annotations are untrusted hints. They cannot
grant authorization or reduce the effect class.

## Public event states

Clients render `approval-required`, `approved`, `denied`, `running`,
`cancel-requested`, `cancelled`, `timed-out`, `failed`, and `completed`. They do
not infer state from prose and cannot bypass a runtime decision.

## Required tests

- schema bypass and additional-property attacks;
- prompt injection in tool names, descriptions, and results;
- forged or revoked server identity;
- replayed idempotency IDs;
- cancellation before approval, during transport, and after side effect;
- timeout, output flooding, malformed result, SSRF, and secret redaction;
- cross-tenant actor/resource combinations;
- annotations that understate actual effects.
