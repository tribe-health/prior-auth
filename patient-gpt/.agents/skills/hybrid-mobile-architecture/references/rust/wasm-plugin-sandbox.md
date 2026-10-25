# WASM plugin sandbox contract

> Reference for hosting third-party WebAssembly components. Captured from a
> production implementation; the *contract* is generic even though that
> implementation's crate is product-specific and deliberately not shipped.

## Why a contract, not a crate

Third-party plugin execution is the highest-risk surface an application exposes:
untrusted code running in-process. The valuable, transferable part is not the
host code — it is the set of limits, because every one of them exists because
the absence of it is exploitable.

The reference implementation's crate is a FUNC-SPEC-anchored product feature
whose execution path is explicitly stubbed. Porting it would ship an empty shell
carrying another product's spec vocabulary. Port the limits instead.

## Runtime: Wasmtime Component Model

Use the Component Model, not raw core modules. Components carry a typed
interface (WIT), so the host↔guest boundary is checked rather than a pile of
`i32` pointers.

Define the contract in a `.wit` file and version it (`your:plugin@1.0.0`). The
version is part of the contract: a host must refuse a component built against an
incompatible major.

## Resource limits

| Limit | Value | Why |
|---|---|---|
| Linear memory | **64 MiB** | A plugin that can allocate freely is a denial-of-service against the host process. On mobile this is worse than a crash — it triggers the OS memory killer, which takes the whole app. |
| Wall clock per call | **30 s** via epoch interruption | Bounds an infinite loop. Fuel alone cannot: a tight loop burns fuel predictably, but a blocking host call does not. |
| Epoch tick | ~50 ms | The ticker only runs while an invocation is active — a permanently-ticking timer is a battery cost users pay for nothing. |
| Fuel | seeded per invocation | Deterministic instruction budget; complements the wall clock rather than replacing it. |
| Threads | **none** | Concurrency belongs to the host. |
| Sockets | **none** | See network below. |

Enable both `consume_fuel(true)` and `epoch_interruption(true)`. They catch
different failure shapes, and a host with only one of them has a gap.

## Network access

**No direct sockets.** Network reaches the plugin only through an explicit host
function, gated twice:

1. a **policy engine** (e.g. Cedar) evaluating the call against the user's rules, and
2. the plugin manifest's **allow-list** of hosts.

Both must pass. The manifest alone is insufficient — it is authored by the plugin
publisher, who is exactly the party the sandbox exists to constrain.

## Distribution and trust

- **Content-addressed** (e.g. IPFS CID). The address *is* the integrity check:
  a different artifact has a different address.
- **SHA-256 verified after fetch**, before instantiation. Content addressing
  proves you asked for the right bytes; verification proves you got them.
- **Optionally publisher-signed** (Ed25519, `did:key:`). Signature identifies
  *who*; the hash identifies *what*. A host that checks only the signature can be
  fed a different signed artifact.

## Concurrency

One `Engine`, many `Store`s. Instances proceed concurrently without sharing
state — a plugin must not be able to observe or corrupt another's memory.

Instantiate per invocation unless the plugin is explicitly stateful; a long-lived
instance accumulates state that outlives the permission that authorized it.

## Failure handling

A plugin that exceeds a limit is **terminated, not retried**. Retrying an
out-of-fuel plugin re-runs whatever burned the fuel.

Surface the reason to the UI — "plugin X exceeded its 30 s budget" is
actionable; a generic error trains users to ignore it.

## What this does not cover

Capability granting, plugin UI surfaces, and update/revocation flows are
application concerns. This document covers only the execution sandbox.
