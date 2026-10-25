# Peer CRDT Sync — The Profile Vault (never-server data)

> Design for sensitive user data that lives ONLY on the user's own devices and
> browser instances, converging via CRDT over peer connections. This is the
> lane the master plan names ingredients for but never composes; this doc is
> the composition. Doctrine: [doctrine.md](doctrine.md).

## What belongs here

Profile and sensitive personal data used chiefly by client-side agents:
identity details, preferences the user marked private, health/behavioral
signals, agent-learned facts about the user. Characteristics: single logical
owner (the user), multi-device (phones, desktops, every browser tab/instance),
must survive any device dying, must NEVER be persisted server-side.

Cloud involvement is limited to *momentary* inference: a client agent may
include vault-derived context in a request to a safe cloud model (or use a
local LLM and involve no network at all), but the server never stores it, and
requests carry `no-store` intent. Anything needing server persistence is not
vault data — move it to lane 1 with explicit consent.

## Privacy classes (canonical taxonomy)

Every entity type and settings scope declares exactly one class. This
reconciles the naming drift (`Local` vs `LocalOnly` vs `local_only`) — the
canonical strings are:

| Class | Server sync | Peer sync | Examples |
|---|---|---|---|
| `public` | yes (scopes) | n/a | shared app entities |
| `trusted` | yes (scopes, tenant-bound) | n/a | user's private-but-hosted data |
| `local` | **NEVER — structurally excluded** | yes (vault) | profile vault, secrets, device state |

Enforcement is structural and fail-closed (LFS-INV-4): the write queue's
enqueue function takes the entity's declared class and **refuses** `local`
rows; vault tables are never registered in any `SyncScope`; unknown class ⇒
`local`. Server-side filtering is defense-in-depth, never the primary gate.

## Data model: one Loro doc per vault

- The vault is a single **Loro** document (ADR-LFS-5; Loro ≠ Yjs wire — no
  y-webrtc/y-websocket interop, ever). Top-level maps: `profile`,
  `preferences`, `agent_facts`; each entry is a small JSON-ish value. Large
  blobs (images, exports) do NOT go in the doc — store them content-addressed
  locally and put the hash in the doc ("sync metadata, fetch payloads").
- Persistence: the doc's encoded state lives in the local store
  (`_vault_state(doc_id, crdt_state BYTEA, version_vector BYTEA, updated_at)`)
  — PGlite on web, pglite-oxide on desktop, SQLite on mobile. Snapshots are
  written on mutation (debounced); the doc is the truth, the row is a cache.
- Reads for UI/agents go through a typed facade (`VaultRepository`) that
  materializes plain structs; feature code never touches Loro APIs directly.

## Transport: WebRTC DataChannel mesh (browser-capable lane)

Browsers are first-class vault peers, which rules out QUIC/iroh as the primary
lane (browsers cannot join iroh gossip). The vault peer lane is:

- **WebRTC DataChannels** between the user's devices. Native surfaces
  terminate WebRTC **in Rust inside `gen_ui_core`** (`webrtc-rs`; the
  TJ-ARCH-MOB-001 networking invariant). On web, WebRTC is necessarily a
  browser API: a thin JS/TS shim owns `RTCPeerConnection` mechanics but is
  driven entirely by the core protocol state machine (wasm) — the shim moves
  bytes and surfaces events; it makes no protocol decisions. Flutter uses
  `flutter_webrtc` for the platform plumbing under the same rule.
- **Sync protocol** (transport-agnostic, versioned):
  1. On channel open, peers exchange version vectors.
  2. Each side sends `export_updates_since(peer_vv)` deltas.
  3. Deltas apply commutatively; both converge; repeat on further mutation
     (debounced, delta-only).
  4. Messages are length-prefixed and chunked to 16 KiB frames (reassembled to
     ≤256 KiB logical messages) — DataChannel-safe sizing.
- **Topology**: full mesh among the user's own devices (a person owns a
  handful of devices; the ~20–30 peer WebRTC ceiling is irrelevant here).
  Every peer stores the full doc; any peer can bootstrap a new device.
- **Offline**: no peer online ⇒ nothing happens; the doc is local-first by
  construction. Convergence resumes on the next pairing — CRDT semantics make
  the order irrelevant.

## Pairing & signaling

- **Admission = device pairing, not open discovery.** A vault only syncs
  between devices the user has explicitly paired. Pairing exchanges device
  public keys (Ed25519); each device keeps a signed roster of trusted peers
  inside the vault doc itself (so the roster syncs too, and revocation
  propagates).
- **Signaling** (offer/answer/ICE relay) is a dumb pipe and MUST be treated as
  untrusted: it sees only ephemeral SDP blobs, never vault bytes. Lanes:
  - Production: FRF `SignalService` (`/ws/v1/signal`), rooms keyed by an
    opaque pairing token bound to the user's gate JWT.
  - Dev/slice: a minimal loopback/manual signaler (copy-paste or QR offer
    exchange) — the transport contract is identical, so swapping signalers is
    configuration, not redesign.
- **Channel security**: WebRTC gives DTLS; on top, peers mutually authenticate
  by proving possession of rostered keys during the handshake (challenge over
  the DataChannel before any delta flows). TURN relays, if configured, see
  only encrypted frames.

## Agents and the vault

- UAR reads the vault through the governed `VaultRepository` capability and
  writes approved learned facts back as CRDT mutations. Application UI and raw
  MCP transports cannot access the vault directly.
- Inference calls assemble a **momentary context**: selected vault fields are
  serialized into the prompt, sent to a local LLM (preferred) or an approved
  cloud endpoint, and the response is post-processed; the assembled context is
  never written to lane-1 tables or server logs. Provenance-tag every
  ContentBlock produced this way (`privacy_class: local`) so downstream sinks
  (protocol events, sync) can refuse it structurally.

## Failure and recovery

| Event | Behavior |
|---|---|
| Device lost | Pair a surviving device with the replacement; full doc bootstraps over the channel. Roster revocation removes the lost device's key. |
| All devices lost | Vault is gone by design. Offer an OPTIONAL user-initiated encrypted export (passphrase-wrapped file) — never an automatic cloud backup. |
| Divergent clocks / long offline | Irrelevant — Loro merge is order-free; version vectors bound the delta size. |
| Doc grows large | Loro compaction/shallow snapshot on save; blobs are external by rule. |

## Testing the lane (no mocks of internals)

Two in-process peers over a loopback DataChannel (or an in-memory duplex
implementing the same chunked-frame contract) exercising: pairing handshake,
bidirectional delta convergence, enqueue-refusal of `local` rows into the
server queue, and new-device bootstrap. These are boundary tests at the public
API; Loro internals and webrtc-rs internals are never mocked.
