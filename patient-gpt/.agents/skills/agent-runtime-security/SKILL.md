---
name: agent-runtime-security
description: Enforce the security boundary around Universal Agent Runtime and governed tool execution. Use for MCP tools, approvals, effect classification, policy checks, agent budgets, JWT/JWKS identity, tenant isolation, audit logs, or cancellation.
---

# Agent Runtime Security

Application-facing code may request a tool only through UAR governance. Raw MCP
transport execution is internal.

## Governed tool sequence

1. Resolve a trusted server and tool identity.
2. Validate input against JSON Schema.
3. Classify effects independently of MCP annotations.
4. Evaluate policy with verified actor and tenant context.
5. Obtain explicit confirmation when policy requires it.
6. Execute with idempotency ID, timeout, output limit, and cancellation.
7. Validate and redact the result.
8. Append an immutable audit outcome.

MCP annotations are hints, never authorization. Tool names and descriptions are
untrusted data. Deny unknown servers, schemas, effects, and identities.

Authorization uses `VerifiedSession` created by signature, issuer, audience,
expiry, and revocation-aware validation. Decoded token hints are display-only.

Test forged tokens, prompt injection in tool metadata, schema bypass, replay,
SSRF, cancellation, output flooding, approval races, revoked keys, and
cross-tenant requests.
