# FRF shape facade ↔ ASO replica: how the two fit together

**Status:** Integration record updated 2026-09-15. The authorized facade is the accepted client
path from Gate to Electric. Bounded local HTTP and topology evidence has passed; full runtime
certification remains open. Supersedes nothing.

## Why this note exists

Work on the Flint Realtime Fabric (FRF) side produced an *authorized shape facade* — an
HTTP endpoint that derives allowed practice, rows and columns on the server, authorizes every
request and continuation through the configured provider, binds opaque handles to verified
session context, and proxies to ElectricSQL (`frf-app`, `crates/frf-shape-electric`, and
`GET /v1/shape`).

That work was planned on the belief that **ASO had no privacy-approved replica schema** — the
ASO runtime architecture lists it as sequence step 1, and the FRF-side assessment took "listed
as step 1" to mean "not done." That was wrong. The schema exists, is tested, and was designed
for exactly this data path. This note corrects the record so the mistake is not repeated by
whoever reads the FRF artifacts next.

## What ASO already has

**`web/src/shared/sync/pglite-schema.ts`** — the local schema as a deliberate subset:

- Projection revision 5 contains seven tables: `annotation_types`, `annotations`, `cases`,
  `case_evidence`, `evidence_states`, `evidence_citations`, and `document_statuses`. Nothing else is
  synced. `annotation_types` and `evidence_states` are exact approved reference projections;
  every other table is practice-scoped.
- `OMITTED_COLUMNS` records every excluded column **as data, with a reason** — `rationale`
  (clinician free text), `quote` (verbatim chart excerpt), `patient_id`, `author_name`,
  `author_npi`, `storage_uri`, and unapproved `data` payloads. The annotation projection carries
  the explicitly attributed opinion body and source target while excluding its type-specific
  `data`. Kept as data so a test can assert it and a reviewer can diff it.
- `pglite-schema.test.ts` fails when an undeclared table appears, when a table name matches the
  remaining patient/source-text/embedding exclusions, or when an omitted column reappears.
- ADR-007 states plainly that there is **no runtime enforcement** — this is a build-time
  decision plus that test.

**`docker/frf/shape-catalog.json` and `web/src/shared/sync/electric-shapes.ts`** — the server and client shape declarations:

- The catalog maps each public shape identifier to a base relation (`aso.cases`, …). Base tables, not views:
  measured against a live stack on 2026-09-05, `GET /v1/shape?table=aso.sync_cases` returned
  400 while `aso.cases` returned 200, because a view emits no WAL and cannot join a publication.
- `SYNC_COLUMNS` **is** the PHI boundary on the wire. Verified against a canary row on
  2026-09-05: an unprojected shape shipped `author_name`, `patient_id` and `storage_uri`; the
  projected shape returned the same row with only the listed columns.
- `createTenantScopedElectricAdapter` **fails closed** — a table added without a tenant decision
  throws at attach time.
- `practice_id` is available as a server-side scope column for every trusted shape. For
  `document_statuses`, migration `2026090622_document_status_projection.sql` derives it from the
  controlling case and keeps it outside the returned column list. An Electric shape WHERE clause
  is flat and cannot join, so this derived WAL-producing table performs the join before publication.

That last point matters: the schema was shaped for a flat, per-shape WHERE clause. It already
anticipates the facade's request model.

## What this means for the FRF side

The FRF facade consumes the versioned ASO projection registry. The conformance runs the other way:

| FRF concept | ASO's existing answer |
|---|---|
| shape catalog entry | `docker/frf/shape-catalog.json`, checked against `SYNC_COLUMNS` per public shape |
| `table` | the base relation, e.g. `aso.case_evidence` |
| `columns` | `SYNC_COLUMNS[table]` — already the PHI boundary |
| scope column | `practice_id`, denormalized onto practice-owned rows; omitted only when `reference: true` and FRF's compiled registry both approve the exact `annotation_types` or `evidence_states` projection |
| tenant decision | FRF requires `scope_column` or an exact compiled reference projection; the browser declaration rejects an omitted decision |

RA15 introduced attributed annotations in projection revision 3. Projection revision 5 retains
that contract and adds the server-owned `document_statuses` base projection. RA15 added the server-owned,
practice-scoped annotation table and the exact approved `annotation_types` reference projection.
Both name their approved columns in the Rust grant registry, Gate token contract, FRF catalog,
client shape request, and PGlite schema. The catalog gives first-annotation UI creation a trusted
type identity without replicating JSON Schema. Future widening still requires an explicit
architecture decision; the facade does not choose it. The document status projection returns the
frozen eleven fields, filters on its unreturned case-derived `practice_id`, and contains no source
text, object location, parser output, or embedding column.

## Adopted client path

The accepted runtime path is `client → Gate → FRF /v1/shape → Electric → Postgres`. The
existing web adapter still names Electric parameters directly and has no caller; later
materializer work replaces that disconnected seam with the facade protocol. Direct Electric
access is restricted to an operator-loopback diagnostic and is never a client path.

The bounded deployment expresses that order in network membership. Gate joins the internal
client segment and the backend segment. FRF and Electric join only the backend. A client can
resolve `shape-gateway`, receives Gate's `401` session challenge without a valid session, and
cannot resolve FRF or Electric directly. FRF still verifies Gate's token independently.

The facade preserves Electric's `200`, conditional `304` and must-refetch `409` protocol
responses. Every other Electric status is converted to a private `502` before upstream headers
or body content can cross the facade. The client-facing response replaces Electric's cache
policy with `Cache-Control: private, no-store`; protocol validators remain available to the
active authorized caller without permitting a stored PHI response to cross a session change.

Only `annotation_types` and `evidence_states` may be shared across practice scopes. Their compiled
registry entries fix the relations and exact columns: `aso.annotation_types` exposes `id`, `key`,
`name`, and `description`; `aso.evidence_states` exposes `key`, `label`, and `meaning`. Both accept
no client parameters and use the practice object namespace. A catalog's `reference: true` flag
cannot declare another table global or widen either approved reference projection.

The application retains its local tenant and schema checks as independent safeguards. They do
not authorize upstream access: Gate and FRF derive the practice, table, columns and predicate
from verified server context. Catalog drift remains a real operational risk, so final
certification must compare the FRF catalog with `pglite-schema.ts` and the local materializer.

## Revocation and response-production contract

ASO PostgreSQL and Kratos remain the authorities. Session denial is keyed by deployment,
Kratos issuer and verified Kratos session ID. Membership/capability authority is keyed by
deployment, ASO incarnation and monotonic global revision. ASO commits the revision and durable
outbox event in the same transaction and commits logout denial plus retry intent before asking
Kratos to revoke. Gate consumes this stream into a shared Redis coherency fence, disables L1/L2
use on lag, loss or regression, and still performs a fresh ASO authority-fence decision for every
protected authorization.

FRF holds the resulting grant through a shell-neutral protected-body lease. The Axum adapter
must yield frames from that lease instead of authorizing a completed buffered body. Active bodies
revalidate at most every 750 ms, bound the ASO authority RPC at 750 ms and propagate cancellation
within 250 ms. Authority timeout, loss or a changed session/grant tuple ends delivery and releases
continuation state. The gateway samples monotonic time before sub-second Unix time and passes both
to FRF. FRF anchors the grant deadline to that earlier monotonic sample and the exact integer JWT
expiry boundary, so dispatch delay cannot extend the grant. The response stream checks that
deadline before and after polling its receiver, preventing a queued frame from winning a scheduler
race with the background cancellation owner. A cancelled producer yields no later protected frame.

The 5,000 ms measurement starts at the authoritative ASO membership commit, durable session-denial
commit or verified expiry instant. It ends at the final protected frame produced by the server or
cancellation that prevents the next frame, followed by denial of a subsequent protected request.
For a revocation initiated directly in Kratos, the observable interval starts when a mounted path
holding the previously verified session first sees it inactive and commits the corresponding ASO
denial. Kernel/proxy buffers, network transit and client receipt are outside this server-controlled
claim; already produced bytes cannot be recalled.

RA11c owns the real materializer caller that publishes replica authority failure into the shared
RA06 session-revocation event. RA06 owns the synchronous Zustand fence for both wide and compact
React layouts. RA13 owns foreground/resume checks, the durable client logout marker and draft
recovery. These client owners do not replace the Gate/ASO decision or FRF body lease.

## Change made alongside this note

`web/src/app/providers/graph-provider.tsx` — the persisted namespace was `aso:${practiceId}`,
practice alone. The runtime architecture §7 forbids that: *"Do not key private storage only by
practice ID."* Two clinicians sharing a workstation shared a namespace.

`graphStorageKey(session)` now composes `aso:g<generation>:<principal>:<practiceId>:<identityId>`,
with `graph-storage-key.test.ts` asserting that two identities in one practice, two practices for
one identity, and a user versus an agent acting for them all resolve to different namespaces.

**Open item:** authorization-scope revision is *not* in the key. `VerifiedSession` carries
`capabilities` but no revision counter, and hashing the capability list would churn the namespace
on unrelated changes. Adding a scope revision to the session is the clean fix, and is not done.

## Verification status

The bounded local stack executed real Kratos v26.2.0 login, Gate RS256 minting, FRF
issuer/audience verification and Electric 1.8.0. Allowed initial and continuation requests
returned `200`; scope, projection, cross-identity handle and expired-handle requests returned
`403` without Electric headers. A client-only internal network reached Gate and received its
`401` session challenge, but could resolve neither FRF nor Electric and could not reach the
operator diagnostic; the diagnostic remained reachable only at `127.0.0.1`. The topology
verifier failed when FRF was deliberately attached to the client network and a direct request
returned `200`. Disconnecting FRF restored DNS failure with curl exit `6` while the Gate path
and operator loopback diagnostic remained available.

A persisted synthetic case then proved the state transition. Its initial Electric `insert`
contained exactly the approved six `cases` columns for the authorized practice. Deleting one
of its four affirmations through another PostgreSQL session committed the derived
`gate_affirmed_at -> null` state. A continuation on the same handle returned an Electric
`update` containing `id`, `gate_affirmed_at: null` and `updated_at`, followed by the
up-to-date marker. The other practice's case never appeared.

The authorization acceptance repeated the live Gate path with one synthetic case in each of
two practices. The real Gate-minted token and a same-key diagnostic token carrying the exact
configured issuer and audience returned `200` and only the authorized practice's case.
Otherwise identical same-key tokens with the wrong issuer or audience returned `401` without
Electric headers, protected identifiers or shape messages. Cross-identity continuation and
refetch handle reuse, a client practice change and a client projection change returned `403`
under fresh session-grant resolution with the same non-disclosure properties.

Materialization into local SQL and PEM, measured session or membership revocation, and each
deployment-specific topology remain open. Electric update frames may contain only changed
columns, so later materializer work must merge deltas into an existing row rather than replace
it. The local same-key diagnostics prove verifier behavior against synthetic key material; they
do not certify production key custody or rotation. Nothing here certifies those surfaces.
