<!-- TJ-ARCH-MOB-001 compliant -->
# wasm32 targets — validation spike findings (C-002)

> Spike run 2026-07-15 against the C-001 layered workspace
> (`scripts/scaffold-rust-core.mjs`). Time-boxed compile probe on
> `wasm32-unknown-unknown`. Findings feed **C-004** (graph-RAG store), **C-005**
> (sync engine), and **C-007** (FFI/wasm leaves).
>
> **Read this before implementing any web/WASM code path.** These are the pins,
> engine names, MSRV constraints, and 3.x API gotchas proven to compile — not
> asserted from docs.

## TL;DR verdicts

| Probe | Verdict | Evidence |
|---|---|---|
| `gen_ui_types` + `gen_ui_protocol` on wasm32 | ✅ compiles clean | re-confirmed C-001 gate |
| **SurrealDB 3.2 `kv-indxdb`** on wasm32 | ✅ **compiles clean** | full dep tree + HNSW/FULLTEXT DDL + KNN query type-check |
| `fetch` transport stub (`web_sys`) | ✅ compiles clean | `gen_ui_wasm::spike_web::fetch_text` |
| `EventSource` (SSE) stub (`web_sys`) | ✅ compiles clean | `gen_ui_wasm::spike_web::open_sse` |
| **PGlite interop** from Rust | ✅ shape proven (JS-boundary only) | wasm-bindgen `extern` over a JS shim |
| `reqwest` / `reqwest-eventsource` on wasm32 | ❌ do NOT use on web | no wasm transport backend — use `fetch`/`EventSource` |
| native-Rust PGlite client (sqlx/tokio-postgres on web) | ❌ impossible | PGlite is JS/WASM-owned; only reachable via JS FFI |

## Toolchain / MSRV finding (BLOCKING for C-004, action for C-008)

> **Resolved 2026-07-16:** the pin has since moved to **1.96** and the authority
> docs (CLAUDE.md/AGENTS.md/SKILL.md/README, `versions.toml`) now state 1.96+.
> The narrative below is the original finding, kept for the rationale.

The workspace `rust-toolchain.toml` pins **1.93**, but SurrealDB 3.2.1 pulls a
transitive dep that fails to build on it:

```
error: rustc 1.93.1 is not supported by the following packages:
  fastnum@0.7.5 requires rustc 1.94
```

`fastnum` is a SurrealDB numeric dep. **Any crate depending on `surrealdb` needs
rustc ≥ 1.94.** This spike compiled everything on **1.96** (stable).

**Actions:**
- **C-004** (or a follow-up to C-001): bump `rust-toolchain.toml` channel to
  `1.96`+ *before* wiring `surrealdb` into `gen_ui_db`. (C-001 already flagged an
  earlier 1.80→1.93 bump for edition2024 deps; this pushes it once more.)
- **C-008**: the "Required tool versions" tables in CLAUDE.md/AGENTS.md say
  `Rust 1.80+` — must become `1.96+` (SurrealDB `fastnum` floor).
- Alternative if a lower MSRV is required: pin `fastnum` down via
  `cargo update fastnum --precise <ver>` — not attempted here; bumping the
  toolchain is the cleaner path since nightly and 1.95/1.96 are already present.

## SurrealDB `kv-indxdb` on wasm32 — details

**Engine selection.** Connect with the `any` engine and an `indxdb://` URL:

```rust
use surrealdb::engine::any::{connect, Any};
let db = connect(format!("indxdb://{db_name}")).await?;   // IndexedDB-backed
db.use_ns("gen_ui").use_db("graph").await?;
```

Cargo feature: `surrealdb = { version = "3.2", default-features = false, features = ["kv-indxdb"] }`.

**Dep tree that resolves on wasm32** (confirms browser-native storage path):
`idb 0.6.5`, `rexie 0.6.2`, `indxdb 0.12.0`, `wasmtimer 0.4.3` (timer shim),
`tokio-tungstenite-wasm 0.8.2`. No native-only KV backend leaks in.

**Graph-RAG DDL compiles on wasm** (the C-004 schema — proven target-safe, no
native-only parser/planner path):

```surql
DEFINE INDEX entity_hnsw ON entity FIELDS embedding HNSW DIMENSION 384 DIST COSINE;
DEFINE ANALYZER bm25 TOKENIZERS class FILTERS lowercase,ascii;
DEFINE INDEX entity_ft ON entity FIELDS content FULLTEXT ANALYZER bm25 BM25;
-- KNN recall operator:
SELECT id, content FROM entity WHERE embedding <|$k,64|> $vec;
```

### 3.x API gotchas C-004 will hit (found by the compiler, not the docs)

1. **`Query::take::<R>()` bounds `R: SurrealValue`, not `serde::Deserialize`.**
   A plain `#[derive(serde::Deserialize)]` struct is **rejected**; `serde_json::Value`
   is **rejected**. Options for C-004:
   - `res.take::<surrealdb::types::Value>(0)?` (always valid), then convert; or
   - `#[derive(surrealdb::types::SurrealValue)]` on the entity model.
2. **`Value` is at `surrealdb::types::Value`** (re-export of `surrealdb_types`),
   **not** `surrealdb::Value` (that path does not exist in 3.2).
3. `getrandom` needs the `js` feature on wasm32 (already handled in
   `gen_ui_types`; any new wasm crate depending on rand-family crates needs
   `getrandom = { version = "0.2", features = ["js"] }` under
   `[target.'cfg(target_arch = "wasm32")'.dependencies]`).

### Compile-cache caveat (reinforces the C-001 crate split)

The SurrealDB dep tree is large (aws-lc-rs, prost, html5ever, ndarray-stats,
ammonia, etc. all get pulled). First wasm check took ~minutes; incremental
re-checks were ~2s. **Keep SurrealDB isolated in its own crate** (`gen_ui_db`
graph subfeature / dedicated crate per C-004 plan) so this tree caches and does
not churn the fast-iterating leaves. This matches analysis §1.3's `#6954` note.

## Web transport (fetch / EventSource) — C-007 shape

`reqwest` and `reqwest-eventsource` have **no wasm32 transport backend** — the
browser owns HTTP/TLS. The wasm side of the `Transport`/streaming seam uses
`web_sys` directly. Proven-compiling shapes (`gen_ui_wasm::spike_web`):

- **fetch** → `web_sys::{Request, RequestInit, Response}` +
  `wasm_bindgen_futures::JsFuture`; `window.fetch_with_request(...)`.
- **SSE** → `web_sys::EventSource` + an `onmessage`
  `Closure<dyn FnMut(MessageEvent)>`. The native lane's `reqwest-eventsource`
  does not cross to wasm; `EventSource` is the equivalent.

`web-sys` features required: `Window`, `Request`, `RequestInit`, `Response`,
`EventSource`, `MessageEvent` (declare under the `cfg(target_arch = "wasm32")`
target table so native builds don't pull `web-sys`).

Layer-contract note (constraints.md): these are the **wasm implementation of the
existing seams**, not new networking logic in the UI. `gen_ui_client` (C-006)
owns the trait impl; the browser calls land here, still inside the Rust core.

## PGlite interop — C-007 shape and hard boundary

**PGlite is a JS/WASM package (`@electric-sql/pglite`), not a Rust crate.** The
only sound Rust↔PGlite boundary is a **wasm-bindgen `extern` block over a thin JS
shim**; the shim is resolved by the JS bundler at build time, not by cargo:

```rust
#[wasm_bindgen(module = "/js/pglite_shim.js")]
extern "C" {
    #[wasm_bindgen(js_name = "createPglite", catch)]
    async fn create_pglite(data_dir: &str) -> Result<JsValue, JsValue>;
    #[wasm_bindgen(js_name = "pgliteQuery", catch)]
    async fn pglite_query(db: &JsValue, sql: &str) -> Result<JsValue, JsValue>;
}
```

**Do NOT** attempt an sqlx / tokio-postgres path against PGlite on web — there is
no wire socket; PGlite runs in-process in JS. This confirms analysis §1.2's
per-platform matrix: web relational = **PGlite via JS**, desktop = pglite-oxide
via `PggliteServer`→sqlx (native Rust), mobile = SQLite via sqlx. The Rust core's
web relational access is the JS-FFI path above; the shim ships from C-007
(`crates/gen_ui_wasm/js/pglite_shim.js` — spike placeholder already stubbed).

**`cargo check` does not run the JS bundler**, so the `extern module` path only
needs to exist as a file for the check to pass; the real `import { PGlite }` lands
when C-007 runs `wasm-pack`/`wasm-bindgen`. `wasm-opt`/`wasm-bindgen` CLI were not
exercised in this spike (compile-only); C-007 owns that pipeline per plan.

## How to reproduce

```bash
# 1. generate the workspace
node scripts/scaffold-rust-core.mjs /tmp/spike-core

# 2. add the two throwaway probe crates (see this spike's completion log for the
#    exact files) OR consult git history; then, with a >=1.96 toolchain + wasm target:
rustup target add wasm32-unknown-unknown --toolchain 1.96
cargo +1.96 check --target wasm32-unknown-unknown -p db_wasm_spike   # SurrealDB kv-indxdb
cargo +1.96 check --target wasm32-unknown-unknown -p gen_ui_wasm     # fetch/SSE/PGlite
```

Probe crates (`db_wasm_spike`, the `spike_web` module) are **spike artifacts** —
they live in scratch, not in the scaffold. C-004/C-007 write the production code;
this doc is the durable output.
