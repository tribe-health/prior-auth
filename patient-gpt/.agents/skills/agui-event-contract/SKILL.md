---
name: agui-event-contract
description: Define or audit the AG-UI event stream between Universal Agent Runtime and application clients. Use for agent event envelopes, SSE resume, run correlation, tool approval state, cancellation, event persistence, or unknown-event compatibility.
---

# AG-UI Event Contract

AG-UI is the runtime-to-application event boundary. UAR emits authoritative run
events; clients maintain projections.

## Envelope

Require protocol version, event ID, run ID, sequence, timestamp, event type,
typed payload, and optional causal parent. Event IDs are stable across retries.

## Semantics

- Apply events idempotently and in sequence.
- Resume streams with the last committed event ID.
- Represent approval, denial, cancellation, timeout, and failure explicitly.
- Keep tool inputs and outputs redacted according to policy.
- Preserve unknown event types without treating them as success.
- Never infer completion from prose.

Test disconnect/reconnect, duplicate and out-of-order events, restart recovery,
slow consumers, cancellation races, unknown versions, and projection replay.
