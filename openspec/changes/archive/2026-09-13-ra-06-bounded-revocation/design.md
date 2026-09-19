## Context

This change implements runtime order 2 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Establish one enforceable revocation contract across cached identity, minting, open responses and reconnects. Clinical commands freshly validate authority. Persist ASO session denials, logout retry intent and membership authority events before relying on cache invalidation. Hold authority through the final server-produced protected frame. Make the completed RA-03 signing and reassessment commands reachable through the shared React application, with revocation projected into the same command-state model on desktop and mobile layouts.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. This change does not implement the full generated-letter editor, realtime SQL materializer, native credential owner, public Kratos sign-in flow or durable draft repository. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO PostgreSQL and Kratos remain authoritative. ASO owns the durable session-denial/retry journal, transactional authority outbox and shell-neutral logout coordinator. Gate owns fresh ASO authority decisions, durable-event consumption and the shared Redis coherency fence. FRF owns the protected-body lease through final frame production or cancellation. The shared React application owns the immediate session/command Zustand fence and the existing evidence-timeline and letter route compositions.

RA06 certifies the server revocation path and synchronous consumer fence. RA11c owns construction of the Electric/PGLite materializer and publication into that fence; the RA06 candidate records that dependency as open and makes no producer claim.

Dependencies: ra-05-authorized-shape-facade. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Before code, define and record the numeric bound, component budgets, clock assumptions and invalidation authority; add a deterministic conformance harness.
- Implement expiry-aware caching/invalidation and a bounded active-response lease, including reconnect and failure behavior.
- Measure logout, role removal, expiry and stale-refill races across Gate/FRF; preserve existing per-event tenant/view checks.
- Key session denial by deployment, Kratos issuer and verified Kratos session ID. Key membership authority by deployment, ASO incarnation and monotonic global authorization revision. Tenant-qualified grants additionally bind practice and verified identity. A new incarnation is accepted only after a fresh ASO bootstrap.
- Commit denial and retry intent before asking Kratos to revoke. A crash before commit produces no success; a crash after commit remains denied and retryable; a crash after Kratos succeeds repeats inactive-session confirmation idempotently. Retain the denial through original session expiry plus skew. Retry and confirmation writes require the matching lease to remain live at the transition observation time.
- Commit each membership/capability authority event in the same PostgreSQL transaction as its revision. Serialize every outbox allocation on the authority singleton through commit so a visible higher sequence cannot overtake an uncommitted lower sequence. Gate bootstraps from a repeatable-read ASO snapshot, disables L1/L2 cache use on lag, Redis loss or regression, and performs a fresh ASO authority-fence decision for every protected authorization.
- A mounted server path that holds the previously verified signed session identity and observes direct Kratos revocation records the same durable denial before that observation can become a reusable cache result. An untrusted caller cannot select the denied session.
- Render clinical commands through feature hooks only. The UI distinguishes idle, submitting, refused, conflict, outcome unknown, accepted awaiting projection and confirmed. It never infers a clinical result from animation or an optimistic local write.
- On logout, membership loss, session expiry or observed replica revalidation failure, synchronously fence protected content and mutation controls before exit motion. Announce that sign-in is required without revealing the prior case. Accept a later server-verified session as a new epoch. RA11c owns the real materializer caller that publishes replica revalidation failure into this session event seam. RA12 owns the Kratos action that obtains a replacement session. RA13 owns foreground/resume orchestration, the durable client logout marker and separately scoped draft recovery after G-DATA permits persistence.
- Keep the same component instance and command owner across resize. Wide layouts use inline/card actions; narrow layouts use a sticky action region or accessible dialog/sheet composition with 44px targets, visible focus and reduced-motion behavior.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

### Recorded revocation budget

G-REV is resolved for this change before runtime implementation. The server-controlled ceiling is **5,000 ms**. It starts at the authoritative ASO membership commit, durable session-denial commit or verified session-expiry instant. It ends when FRF records the final protected body frame produced by the server or cancellation that prevents the next frame, and a subsequent protected request is denied. The local integration timer starts immediately before the request that causes the authoritative commit, making its observation a conservative upper bound. It does not measure operating-system or proxy buffering, network transit or client receipt.

The enforced active-body lease revalidates the current ASO grant at most every 750 ms, gives that authority RPC at most 750 ms, and propagates cancellation within 250 ms. These components fit the existing 1,750 ms active-lease allowance. Gate probes the durable outbox high-water mark at least every 250 ms and disables cache use when the consumer falls behind, but every protected authorization still performs a fresh ASO authority-fence decision. The overall ceiling remains 5,000 ms so authority-event commit latency, process scheduling and the recorded one-second wall-clock/skew allowance remain inside the measured server interval.

| Enforced point | Maximum |
|---|---:|
| Gate durable-outbox high-water probe while cache-enabled | 250 ms |
| FRF active-body grant revalidation interval | 750 ms |
| FRF authority RPC timeout | 750 ms |
| FRF cancellation propagation | 250 ms |
| **FRF active-body lease component** | **1,750 ms** |
| **Server-controlled commit-to-final-frame ceiling** | **5,000 ms** |

The ASO replica-grant decision is the active lease authority. It composes a verified Kratos session with current ASO practice membership, incarnation and authorization revision, and refuses an unexpired durable session denial. Gate cache eviction, Redis/Pub/Sub, PostgreSQL notifications and process-local epochs accelerate or fence work, but none is an authorization authority. Authority timeout or loss denies renewal and closes the protected response within the same ceiling. A server-produced frame may already be in a kernel or proxy buffer when authority changes; the system cannot recall it and does not report it as a post-revocation server production event.

Elapsed deadlines use a monotonic process clock. Absolute Kratos and JWT expiries remain UTC instants and are converted once to a monotonic deadline with the recorded one-second allowance for whole-second claims and cross-process skew. A backward wall-clock adjustment cannot extend an active lease. Cache refill and response completion capture a generation before asynchronous work and must compare it again before publishing a value, protected bytes or a continuation handle.

The browser has a separate ordering invariant rather than a background-timer SLA: when logout, expiry, a 401/403 revocation result or a replica invalidation is observed, the session epoch advances and protected React children and command controls are fenced synchronously before motion or another command can run. A timer fences at the verified session expiry, and a resumed page checks that expiry before rendering another protected interaction. A later verified session prop advances the epoch and opens only its own graph scope. The same store and component instances serve wide and compact layouts.

RA06 has no draft repository. Its replica graph is disposable and keyed by session and authorization revision so a new session cannot inherit protected rows. RA13 may add identity-scoped draft recovery only after the persistence policy is approved; it must remain outside the replica generation and prove fresh same-identity authorization before recovery.

## Risks / Trade-offs

The uncomfortable thing is that this contract permits the server to produce protected frames for up to five seconds after an authority change. Bytes produced before cancellation may remain buffered beyond that point. The implementation must measure the actual server interval and may tighten it, but it cannot report client receipt or change the recorded ceiling after observing results. Protected agent/media activation remains out of scope. A bounded signing command panel may render only the current verified revision and authoritative command outcome; it does not establish generation or QA production.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
