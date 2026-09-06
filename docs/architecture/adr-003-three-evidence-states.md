# ADR-003 · Three evidence states, never two

**Status** Accepted · **Date** 2026-09-04

## Decision

Evidence against a payer criterion has **three** states, modelled as a closed
set on every surface:

| State | Meaning | What it asks a human to do |
|---|---|---|
| `met` | A dated source document satisfies the criterion | Cite it |
| `gap` | A document exists and contradicts or falls short | **Argue** it |
| `void` | Nothing in the record addresses it at all | **Obtain** it |

## Why not two

`void` is not a weak `gap`. A gap is a chart that says no; a void is a chart
that is silent. Nothing has been disproved.

They route work to **different people**. A gap needs a surgeon to explain why
the contradiction does not defeat the request. A void needs a coordinator to
order a lab. Collapsing them into one "unmet" bucket sends the wrong person to
do the wrong job — which is how a case sits for three weeks waiting on a
nicotine test nobody ordered.

## How it is held

- **Database** — a lookup table with a foreign key, not a boolean.
- **Rust** — `EvidenceState` enum; a missing match arm is a compile error.
- **TypeScript** — a three-member union; the count DTO names `void` explicitly.
- **Dart** — an enum whose unknown-value parse **throws** rather than defaulting.
- **Audit** — `scripts/audit.sh` check 6 fails if either surface loses the state.

## Consequences

- `void` is a reserved word in Dart, so the member is `voidState` while the wire
  value stays `void`. The JSON contract is shared across three languages and
  does not bend to one language's grammar.
- Every surface renders three treatments, and each carries a text label — colour
  is reinforcement, never the signal.

## Runtime alignment — 2026-09-06

Loading, offline, unauthorized and synchronization errors are runtime states,
not additional evidence states. Missing hydration must never be presented as
`void` or `gap`. Unknown wire values stop incompatible projection rather than
silently defaulting. Publish evidence entities and ordered list membership at
one coherent graph revision in every deployment. Render the evidence label and
its source citations from that projection.

See the [runtime architecture](application-runtime-architecture.md) and
[ADR-009](adr-009-authorized-replicas-and-updates.md). Runtime implementation
verification is separate from this accepted domain decision.
