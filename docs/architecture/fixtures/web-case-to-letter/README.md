# Web case-to-letter contract fixtures

These manifests freeze deterministic inputs and expected outputs for the browser-first workflow. They are design contracts for `web-01` through `web-17`; their presence is not evidence that the application implements or passes the scenario.

All people, organizations, member identifiers, records, dates, prose, and clinical content are synthetic. Human-readable labels begin with `Synthetic`, case numbers begin with `SYN-`, and contact addresses use the reserved `.invalid` domain. Do not replace any value with real patient, member, provider, payer, or practice data.

## Files

- `fixture-manifest.json` contains complete standalone inputs for `request-case`, `corrected-resubmission-case`, and `clinical-appeal-case`, plus the low-confidence, missing-citation, unrelated-page, and foreign-practice controls. Its `administering_entity_resolution_fixture` section supplies directly loadable valid, missing, ambiguous, conflicting, and expired plan/delegation records.
- `expected-output-manifest.json` freezes lifecycle transitions, evidence states, classifications, exact letter bodies and claims, links, hashes, UI copy, refusal outcomes, and deterministic administering-entity states.
- `manifest-lock.json` pins the SHA-256 digest of both manifests. A consumer must verify the lock before loading either file.
- `verify.py` checks JSON identity, lock integrity, synthetic-only labels, standalone command coverage and revision tokens, disjoint positive and negative identities, exact source spans/version/date/hash plus human support review, met/gap/void work resolution, response acknowledgements, denial-case isolation, and the exact negative-control outcomes.

Each positive workflow command contains its mutation HTTP method and route,
one or more `payload_refs`, the retry lookup anchor, actor, capability, input
revisions, and result revisions. A referenced payload contains the command ID,
the exact expected revisions, and every operation-specific field. Loaders use
these records directly; command-name routing tables outside this manifest are
not part of the contract. Case creation includes every required relationship;
published criteria imports include their payer, policy, section, source, and
content hash. Uploaded documents use keys present in the design-schema type
registry and carry their case, patient, and required typed payload. Submission
acknowledgements use a registered channel plus conforming channel data. A
revision consumed after its first appearance must equal the last revision
published by an owning command.

Each positive case also carries the current synthetic signature record. Every
signing payload binds both its `signatureId` and `signatureRevision`; a loader
must create that record through the fixture setup before dispatching a signing
command.

Run the focused contract check from the repository root:

```bash
python3 docs/architecture/fixtures/web-case-to-letter/verify.py
```

## Hash contract

Document `content_sha256` is SHA-256 over UTF-8 page text joined by one form-feed byte (`0x0c`) in ascending `page_number` order. Letter `body_sha256` is SHA-256 over the UTF-8 decoded `body_markdown` value with its embedded newline characters and no added terminal newline. File hashes in `manifest-lock.json` cover the complete bytes of each JSON file, including its terminal newline.

Submission `attachment_manifest.sha256` is SHA-256 over the ordered attachment
identifiers joined by a newline plus one terminal newline. The rendered letter
identifier is first, followed by each cited document identifier in first-claim
order with duplicates removed. `receipt_custody.evidence_sha256` is SHA-256 of
`submission_id|submitted_at|status`. Initial and response submissions each use
attempt 1 within their own letter.

Any intentional fixture change requires updating the normative workflow contract, assessing every downstream change, regenerating dependent hashes, and replacing the lock in the same reviewed change. Runtime tests must load these files rather than copy their values into a second fixture source.

Negative controls derive from a named complete positive workflow that starts
from an empty synthetic practice. The loader replays that workflow through the
domain command API through `stop_after_command`, remaps every inherited UUID
with RFC 4122 UUIDv5 under the control's unique namespace, rewrites the source fixture
prefix on every revision token using the declared `fixture_prefix_v1` rule,
applies the declared overlays,
and then dispatches `tested_command`, or performs `tested_read` without a
command receipt. A tested mutation names its payload references, actor role,
capability, exact lookup anchor, input revisions, and expected result. A tested
read names its route and verified session context without a command ID or
revision payload. `ready_assertions` records the aggregate facts the loader must
observe before that dispatch. A web-16 loader must fail setup when a source
step, overlay, payload reference, revision, or assertion is missing; it must
never insert these objects directly into schema tables.

The UUIDv5 name is the exact UTF-8 byte sequence produced by
`web-case-to-letter-v2|{source_fixture_id}|{target_fixture_id}|{source_uuid_lowercase}`.
The source UUID and result use canonical lowercase RFC 4122 text. UUIDv5 uses
SHA-1 as specified by RFC 4122. Every transform includes a conformance sample
that `verify.py` recomputes.

Generated claims originate only from the deterministic fixture inference
adapter. The missing-citation client request contains the command identity,
expected revisions, and letter purpose; it does not send a candidate claim.
The adapter result supplies the deliberately incomplete candidate so the same
generation boundary that production will use must reject it before persistence.

Fixture actor names are workflow labels. `actor_role_keys` maps them to the
schema registry: coordinator and viewer actors use `staff`, administrators use
`admin`, surgeons use `surgeon`, and processors use the narrow internal job
grant rather than a human role. Membership rows always store the schema key.

## Required outcomes

| Fixture | Frozen result |
|---|---|
| `request-case` | Initial met/gap/void revision; accepted sourced surgeon argument; coordinator-obtained missing source; final revision with no mandatory void; signed cited request and acknowledged submission |
| `corrected-resubmission-case` | Full empty-case-to-request flow, acknowledged initial submission, administrative denial, signed corrected response, and acknowledged response submission |
| `clinical-appeal-case` | Full empty-case-to-request flow, acknowledged initial submission, clinical denial, fresh four-part response gate, signed appeal, and acknowledged response submission |
| `low-confidence-denial` | `classification_needs_review`; no response letter |
| `missing-citation-claim` | Exact unsupported-assertion message; no persisted claim or prose inclusion |
| `unrelated-page-claim` | Valid pointer but unsupported claim; support review blocks approval and prose inclusion |
| `foreign-practice-case` | Hidden/refused at Gate, AppServices, PostgreSQL, replica, and route boundaries |
| `web-03-resolution-rules` | One exact resolution plus named `missing`, `ambiguous`, `conflicting`, and `expired` parked states; every parked state blocks downstream work |

The two denial cases use distinct case, determination, response-letter, and command UUIDs. A test that lets one case mutate the other has failed even if both final letters appear correct.
