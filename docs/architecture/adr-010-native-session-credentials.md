# ADR-010 · Native session credential ownership

**Status** Accepted; facility and typed IPC slices implemented · **Date** 2026-09-16
**Relates to** [ADR-002](adr-002-clinical-authority.md), [ADR-008](adr-008-shared-runtime-state-and-sessions.md), and [ADR-009](adr-009-authorized-replicas-and-updates.md).

## Context

The shared React application runs in browsers and in Tauri. Browser sessions
use Kratos browser flows and an HttpOnly cookie. A native Kratos API flow
returns an opaque session token, so the desktop host needs a credential owner
that the renderer, Zustand stores, local graph, URLs, and logs cannot read.

The Tauri Stronghold plugin was considered. It adds a vault-unlock secret and
its normal command surface is callable from the renderer. That is a poor fit
for a token whose only consumer is trusted Rust host code. Plaintext files,
ordinary SQLite, graph persistence, and the Tauri Zustand plugin are also not
credential facilities.

## Decision

The Rust desktop host owns native credentials. It stores the opaque Kratos
session token through `keyring` 4.2.0, which maps to macOS Keychain, Windows
Credential Manager, and freedesktop Secret Service. `secrecy` 0.10.3 protects
the transient host value from ordinary debug output and zeroizes it on drop.
There is no plaintext fallback. A missing, locked, or failed platform facility
keeps the user unauthenticated or reports authentication unavailable.

The host starts a Kratos 26.2.0 native login flow at
`/self-service/login/api`, accepts only the expected login path and flow ID,
submits to the configured trusted origin, and validates the returned token at
`/sessions/whoami` before storing it. Redirects are disabled and identity
responses are bounded. The renderer receives only a sanitized projection:
session ID, identity ID, expiry, and assurance level. A shell-neutral
`SessionCredential::NativeToken` is created inside the host only while it
invokes a protected application operation.

Production social sign-in uses the system browser. The selected completion
mechanism is Tauri opener 2.5.5 plus deep-link 2.4.10 and single-instance
2.4.4. The host validates the callback scheme, path, state, and active
ceremony, then performs the one-time exchange with Kratos. Long-lived session
tokens do not travel in a callback URL. The current self-hosted Kratos
configuration enables password and code flows; it does not yet establish an
OIDC provider or callback, so social sign-in activation remains later work.

Credential ownership does not grant clinical authority. Gate policy,
`AppServices`, and PostgreSQL triggers still make independent decisions.
Logout keeps the credential until server revocation is confirmed or reconciled,
then removes it from the platform facility. The Tauri Zustand plugin may carry
non-sensitive shell presentation state only; it cannot carry credentials,
session authority, or clinical data.

## Consequences

Native password login and protected-session restoration now have a concrete
host facility and a synthetic macOS integration result. The desktop shell also
mounts closed, window-scoped Tauri commands for gate reads and mutations,
signing, evidence reassessment, annotations, and their command lookups. Every
clinical invocation checks the current access epoch before opening the host
credential and then reaches the existing Gate HTTP surface, where Gate,
`AppServices`, and PostgreSQL keep their independent controls. OIDC provider
activation, callback integration, a production Wry window, production
multi-window qualification, and Windows/Linux platform qualification remain
RA17 work. Host events now advance the access epoch and notify every Tauri
renderer on logout, verified scope replacement, or authentication failure. The
payload contains only its schema, reason and epoch. The uncomfortable
limitation is that mock-runtime two-window execution and one successful macOS
Keychain run do not prove behavior in those environments.

## Verification

RA17 task 1.2 runs a synthetic identity through the pinned local Kratos
26.2.0 service, stores the token in macOS Keychain, reopens a protected session
through the host credential owner, confirms that the serialized renderer
projection has no credential, removes the keychain entry, and deletes the
synthetic identity. A focused test rejects an unexpected provider action path;
removing that guard makes the test fail, and restoring it makes the test pass.
No real patient or user data is used.

RA17 task 1.3 invokes all eleven clinical operations through Tauri's local mock
IPC dispatcher. It proves that closed command payloads reject an actor hint,
that an unauthorized window and stale epoch stop before transport, and that
each accepted invocation receives the host-owned credential. A mounted local
HTTP endpoint then verifies every Gate path, method, practice query and
credential header while returning typed denials. Disabling the epoch comparison
makes the stale-request test fail; restoring it makes the test pass.

RA17 task 1.4 invokes every command with a foreign-practice selection under
typed policy denial, host-credential failure and uncertain transport outcomes.
A two-window Tauri mock run observes the same sanitized host event in both
renderers for scope replacement, authentication failure and logout, and proves
that the old epoch can no longer invoke a protected command. React adapter
tests synchronously lock two independent session stores from that event and
reject a payload containing an additional credential field. Removing the
closed-field check makes the credential-bearing-event test fail; restoring it
makes the test pass.

Evidence is recorded in
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-17-native-session-transport/`.

## Sources

- [Ory native and browser applications](https://www.ory.com/docs/identities/native-browser)
- [Ory session management](https://www.ory.com/docs/kratos/session-management/overview)
- [Tauri deep-link plugin](https://v2.tauri.app/plugin/deep-linking/)
- [Tauri opener plugin](https://v2.tauri.app/plugin/opener/)
- [Tauri single-instance plugin](https://v2.tauri.app/plugin/single-instance/)
- [keyring crate](https://docs.rs/keyring/4.2.0/keyring/)
