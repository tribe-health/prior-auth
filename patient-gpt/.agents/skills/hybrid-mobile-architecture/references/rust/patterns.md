# Rust Core Patterns Reference
> gen_ui_core · Rust 1.97.1 · Tokio 1.40 · per-device inference (desktop llama-cpp-2 · Android LiteRT-LM · iOS MLX-Swift · web WebLLM; mistral.rs optional) · **SurrealDB 3.2.1** · flutter_rust_bridge 2.12.0 · Tauri 2.11.4

## Workspace layout (layered — compile-cache friendly)

The Rust code is a **layered workspace**, not a single crate. Trait boundaries live in
`gen_ui_types` (frozen after c001) so downstream crates develop in parallel worktrees without
conflicts, and heavy dependencies (SurrealDB, inference engines) sit in leaf crates that cache
independently. See `references/rust/compile-speed.md` for the caching rationale — SurrealDB is
isolated in its own crate specifically because `surrealdb-core`'s `build.rs` re-run issue
(#6954) causes long recompiles otherwise.

```
rust/crates/
  gen_ui_types/        # L0  shared traits + newtypes + enums (FROZEN seam — c001)
                       #     inference.rs · events.rs · lifecycle.rs · content_block.rs
  gen_ui_runtime/      # L1  runtime abstraction (native / web split)
  gen_ui_protocol/     # L1  A2UI / AG-UI adapters, ProtocolPipeline
  gen_ui_client/       # L2  Flint client (gate · forge · frf) + HTTP/SSE
  gen_ui_mcp/          # L2  internal UAR transport adapters; never app-facing
  gen_ui_db/           # L2  relational + sync
  gen_ui_db_graph/     # L2  SurrealDB embedded hybrid graph-RAG — ISOLATED for caching
  gen_ui_inference/    # L2  InferenceProvider impls, per-DEVICE (CPU-bound → spawn_blocking)
  gen_ui_context/      # L2  deterministic, engine-neutral context assembly
  gen_ui_uar/          # L3  pinned UarRuntimeFacade adapters; no competing loop
  gen_ui_ffi/          # LEAF flutter_rust_bridge surface
  tauri-plugin-gen-ui/ # LEAF Tauri commands/events/permissions
  gen_ui_wasm/         # LEAF wasm-bindgen surface
  workspace-hack/      # cargo-hakari feature unification
```

**There is no `gen_ui_core` crate.** "gen_ui_core" names an *invariant* — all
networking, LLM interaction, inference, and persistence live in Rust — realised as
the layered `gen_ui_*` family above. Treat any reference to a single `gen_ui_core`
crate as shorthand for that family, not a path.

Core crates (`gen_ui_types` … `gen_ui_agent`) compile to **native AND wasm32**. Leaves are
platform-specific. Isolating `gen_ui_db_graph` keeps SurrealDB's slow build out of the
app-code inner loop.

## Per-device inference and lanes

`gen_ui_inference` holds one engine per **device**, not one per "mobile/desktop":
llama.cpp on desktop, LiteRT-LM on Android, MLX-Swift on iOS, MLX-C on macOS,
WebLLM on web. All sit behind `gen_ui_types::inference::InferenceProvider`, so no
caller branches on engine. Values live in `versions.toml` `[inference]`.

Independently, a chat turn runs on one of three **lanes** — `cloud`, `local`,
`uar` (`gen_ui_agent::lane`). Engine ≠ lane: the `local` lane picks whichever
engine that device uses. Parse lanes through the `Lane` enum and reject unknown
values loudly; a silent default can route a turn off-device.

See `references/rust/inference-lanes.md`.

## Cargo.toml (workspace — current July 2026)

```toml
[workspace]
members = [
  "crates/gen_ui_types", "crates/gen_ui_runtime", "crates/gen_ui_protocol",
  "crates/gen_ui_client", "crates/gen_ui_mcp", "crates/gen_ui_db",
  "crates/gen_ui_db_graph", "crates/gen_ui_inference", "crates/gen_ui_context",
  "crates/gen_ui_agent", "crates/gen_ui_ffi", "crates/tauri-plugin-gen-ui",
  "crates/gen_ui_wasm", "crates/workspace-hack",
]
resolver = "2"

[workspace.package]
version = "0.1.0"
edition = "2021"
# From versions.toml [toolchain]; keep in sync with rust-toolchain.toml.
rust-version = "1.97.1"

[workspace.dependencies]
tokio          = { version = "1.40",  features = ["full"] }
tokio-stream   = { version = "0.1",   features = ["sync"] }
futures        = "0.3"
flutter_rust_bridge = { version = "2.12", features = ["dart-opaque", "anyhow"] }
reqwest        = { version = "0.12",  features = ["json", "stream", "rustls-tls"], default-features = false }
reqwest-eventsource = "0.6"
serde          = { version = "1.0",   features = ["derive"] }
serde_json     = "1.0"
# Inference engines are per-lane (versions.toml [inference]): pinned llama-cpp-2
# on desktop/mobile, with mistral.rs optional — consumed ONLY by gen_ui_inference
# behind gen_ui_types::inference::InferenceProvider. Pin by git SHA per Rule 22.
# mistral-rs   = { git = "...", rev = "<sha>" }         # optional desktop experiment
# llama-cpp-2  = "<version>"                            # desktop/mobile default
hf-hub         = { version = "0.3",   features = ["tokio"] }
tokenizers     = { version = "0.20",  features = ["http"] }
# SurrealDB 3.2 — native uses kv-rocksdb; wasm32 uses kv-indxdb (set per-crate/target).
surrealdb      = { version = "3.2",   features = ["kv-rocksdb"] }
rayon          = "1.10"
dashmap        = "6.1"
parking_lot    = "0.12"
tracing        = "0.1"
anyhow         = "1.0"
thiserror      = "1.0"
uuid           = { version = "1.10",  features = ["v4", "fast-rng"] }
chrono         = { version = "0.4",   features = ["serde"] }
once_cell      = "1.20"
async-trait    = "0.1"
```

For the wasm32 target, `gen_ui_db` selects the indxdb engine instead of rocksdb:

```toml
# rust/gen_ui_db/Cargo.toml
[target.'cfg(not(target_arch = "wasm32"))'.dependencies]
surrealdb = { workspace = true, features = ["kv-rocksdb"] }

[target.'cfg(target_arch = "wasm32")'.dependencies]
surrealdb = { version = "3.2", default-features = false, features = ["kv-indxdb"] }
```

## gen_ui_core module structure (composition crate)

The single-crate layout below still describes `gen_ui_core`'s internal modules; in the
layered workspace, `protocol/`, `inference/`, `mcp/`, and `db/` are separate crates that
`gen_ui_core` composes and re-exports.

```
gen_ui_core/src/
  lib.rs              # module declarations / re-exports
  api.rs              # (moved to gen_ui_ffi) FFI surface for Flutter
                      # (moved to tauri-plugin-gen-ui) Tauri commands/events for desktop
  api_http.rs         # Anthropic HTTP/2 client (gen_ui_client)
  runtime.rs          # global Tokio runtime (one per process)
  streaming.rs        # SSE parser → StreamEvent sealed enum
  config.rs           # UarMode, feature flags
  protocol/           # → gen_ui_protocol
    mod.rs            # ProtocolPipeline (dual broadcast channels)
    a2ui.rs           # A2UI adapter + 27-variant event enum
    agui.rs           # AG-UI adapter + bidirectional events
  uar/mod.rs          # → gen_ui_uar — embedded/service/test facade adapters
  inference/          # → gen_ui_inference
    mod.rs            # InferenceEngine, ModelId, ChatTemplate
    sampler.rs        # temperature / top-p / top-k
  mcp/                # → gen_ui_mcp
    mod.rs            # Internal UAR MCP transports behind governance
    sse_transport.rs  # HTTP SSE transport
    stdio_transport.rs
  db/mod.rs           # → gen_ui_db — SurrealDB 3.2 (MemoryStore, EntityGraph)
```

## FFI surface rules (api.rs)

The FFI surface is the ONLY file flutter_rust_bridge processes. Keep it clean:

```rust
// ✓ Correct: clean FFI types, no complex lifetimes
pub struct FrbAgentConfig {
    pub model: String,
    pub max_tokens: u32,
    // ... simple owned types only
}

// ✓ Correct: async fn → Dart Future
pub async fn stream_agent_a2ui(
    messages: Vec<String>,
    user_message: String,
    config: FrbAgentConfig,
    sink: flutter_rust_bridge::StreamSink<FrbA2uiEvent>,
) -> anyhow::Result<()> { ... }

// ✗ Wrong: complex types, references, Box<dyn>
pub fn bad_api(handler: Box<dyn Fn()>) -> &str { ... }
```

## Tauri commands (for desktop builds)

```rust
// src-tauri/src/commands.rs — Tauri-specific API surface
// (separate from api.rs which is for Flutter FFI)

#[tauri::command]
async fn stream_agent_a2ui(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    user_message: String,
    messages: Vec<String>,
    config: FrbAgentConfig,
) -> Result<(), String> {
    let (raw_tx, raw_rx) = mpsc::channel::<StreamEvent>(256);
    let pipeline = ProtocolPipeline::new(Uuid::new_v4().to_string());
    let mut a2ui_rx = pipeline.subscribe_a2ui();

    runtime::spawn(async move { pipeline.drive(raw_rx).await });

    let client = state.anthropic_client.clone();
    runtime::spawn(async move {
        let agent = AgentRuntime::new(/* ... */);
        let _ = agent.run(pairs(messages), user_message, raw_tx).await;
    });

    // Forward A2UI events via Tauri emit
    loop {
        match a2ui_rx.recv().await {
            Ok(ev) => {
                let done = matches!(ev, A2uiEvent::RunFinished { .. });
                app.emit("a2ui_event", FrbA2uiEvent::from(ev)).map_err(|e| e.to_string())?;
                if done { break; }
            }
            Err(_) => break,
        }
    }
    Ok(())
}
```

## UAR configuration

```rust
// config.rs
#[derive(Debug, Clone, serde::Deserialize)]
pub enum UarMode {
    /// The pinned UAR implementation runs in-process behind the facade
    Embedded,
    /// Connect to the UAR service through a governed adapter
    Service {
        url: String,
        timeout_secs: u64,
    },
    /// Deterministic implementation for contract tests only
    Deterministic,
}

pub struct AppConfig {
    pub uar_mode: UarMode,
    pub data_dir: std::path::PathBuf,
    pub db_path: Option<std::path::PathBuf>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            uar_mode: UarMode::Embedded, // default: embedded
            data_dir: dirs::data_dir().unwrap_or_default().join("gen_ui"),
            db_path: None,
        }
    }
}
```

## Adding a new ContentBlock type (full stack — 7 steps)

See the complete guide in `references/rust/new-block-type.md`.

**Summary:**
1. Add `StreamEvent` variant in `streaming.rs`
2. Add `A2uiEvent` variant in `protocol/a2ui.rs` + ingestion in `A2uiAdapter::ingest()`
3. Add AG-UI translation in `protocol/agui.rs` + `AguiAdapter::translate()`
4. Run `flutter_rust_bridge_codegen generate` (Flutter) or update Tauri commands
5. Add Dart sealed class in `bridge/a2ui/a2ui_event.dart` (Flutter)
   OR TypeScript type in `bridge/a2ui/types.ts` (Tauri)
6. Add driver case in `A2uiContentDriver._handle()` ← compiler enforces
7. Add `ContentBlock` variant → widget/component ← compiler enforces

## Local model catalog

| Rust ModelId | HF Repo | GGUF Size | Best for |
|---|---|---|---|
| `Qwen2_5_0_5B` | Qwen/Qwen2.5-0.5B-Instruct-GGUF | ~400MB | Ultra-fast |
| `Qwen2_5_1_5B` | Qwen/Qwen2.5-1.5B-Instruct-GGUF | ~1.0GB | Quality+speed |
| `Phi3_5Mini` | bartowski/Phi-3.5-mini-instruct-GGUF | ~2.2GB | Best reasoning |
| `Llama3_2_1B` | bartowski/Llama-3.2-1B-Instruct-GGUF | ~650MB | Llama compact |
| `Llama3_2_3B` | bartowski/Llama-3.2-3B-Instruct-GGUF | ~1.8GB | Strong 3B |
| `Gemma2_2B` | bartowski/gemma-2-2b-it-GGUF | ~1.5GB | Google instruction |
| `SmolLm2_1_7B` | HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF | ~1.1GB | Compact+capable |

## SurrealDB 3.2 embedded graph RAG (`gen_ui_db`)

SurrealDB provides the graph + vector + full-text layer for memory and the entity graph on
every target: `kv-rocksdb` native (iOS / Android / desktop), `kv-indxdb` on wasm32. It lives
in its own crate (`gen_ui_db`) for compile caching (build.rs issue #6954).

### 2.x → 3.x breaking changes that touch our schema / DDL

The reference schemas and scaffold templates must use the **3.x** forms — the 2.x forms below
no longer compile against SurrealDB 3.2:

| Concern | 2.x (removed) | **3.2 (use this)** |
|---|---|---|
| Vector index | `MTREE` | **`HNSW`** — `DEFINE INDEX … HNSW DIMENSION 384 DIST COSINE` |
| Full-text | `SEARCH ANALYZER` | **`FULLTEXT ANALYZER`** |
| Record ctor fn | `type::thing(...)` | **`type::record(...)`** |
| Random id fn | `rand::guid()` | **`rand::id()`** |
| Variables | (optional) | **`LET` required** |
| KNN operator | — | **`<|K,EF|>`** (e.g. `<|8,64|>`) |

Writes are **synced by default** in 3.x (slower but durable); keep bulk ingestion off the hot
path. There is **no in-place 2.x→3.x RocksDB upgrade** — migrate via in-app export→import.

### Schema (3.2 DDL)

```sql
-- entity table with a 384-dim embedding (matryoshka-truncated ok)
DEFINE TABLE entity SCHEMAFULL;
DEFINE FIELD name      ON entity TYPE string;
DEFINE FIELD kind      ON entity TYPE string;
DEFINE FIELD embedding ON entity TYPE array<float>;
DEFINE FIELD body      ON entity TYPE option<string>;

-- HNSW vector index (replaces MTREE); COSINE distance, 384 dims
DEFINE INDEX entity_hnsw ON entity FIELDS embedding HNSW DIMENSION 384 DIST COSINE;

-- BM25 full-text lane (FULLTEXT replaces SEARCH ANALYZER)
DEFINE ANALYZER content_analyzer TOKENIZERS blank,class FILTERS lowercase,ascii;
DEFINE INDEX entity_ft ON entity FIELDS body FULLTEXT ANALYZER content_analyzer BM25;

-- graph edge
DEFINE TABLE relates_to SCHEMALESS TYPE RELATION IN entity OUT entity;
```

### Graph RAG pattern (verified)

HNSW vector recall → `RELATE` graph expansion (recursive) → BM25 full-text lane →
reciprocal-rank fusion **in Rust**:

```sql
-- vector recall: KNN operator with ef search width
LET $q = $query_embedding;
SELECT id, name, vector::distance::knn() AS dist
FROM entity
WHERE embedding <|8,64|> $q
ORDER BY dist ASC;

-- graph expansion (recursive 1..3 hops)
SELECT * FROM entity:⟨seed⟩.{1..3}(->relates_to->entity);

-- full-text lane
SELECT id, name, search::score(0) AS score
FROM entity WHERE body @0@ $terms ORDER BY score DESC;
```

Fuse the three result sets (reciprocal-rank fusion) in Rust; do not push fusion into
SurrealQL.

### FFI / layer contract (BLOCKING)

**Dart never sees raw SurrealQL.** There is no embedded Dart SDK (the pub.dev community
package is WebSocket-only). `gen_ui_db` exposes **intent-level functions** over the FFI
surface — `memory_search(query, k)`, `graph_expand(id, depth)`, `upsert_entity(...)` — and
those are what `gen_ui_ffi` / `tauri-plugin-gen-ui` re-export. Raw query strings stay in Rust.

```rust
// gen_ui_db intent API — the ONLY graph surface the UI layers see
pub async fn memory_search(query: &str, k: usize) -> anyhow::Result<Vec<EntityHit>>;
pub async fn graph_expand(id: &RecordId, depth: u8) -> anyhow::Result<Vec<EntityHit>>;
pub async fn upsert_entity(name: &str, kind: &str, embedding: Vec<f32>) -> anyhow::Result<RecordId>;
```

### Embedded engine lifecycle (PGlite, SurrealDB, and any future engine)

Both `gen_ui_db`'s PGlite-backed config store and this crate's SurrealDB store take
an exclusive lock on their data directory when they start, the same way a
standalone PostgreSQL server does. Open each one through a **coalesced** async
singleton — `tokio::sync::OnceCell::get_or_try_init` (`PgliteStore::open`,
`GraphStore::open`), never a check-then-act `get()`→start→`set()` cell, which
loses to concurrent callers (React StrictMode double-invokes startup in dev) —
and pair it with a single-instance guard at the app-shell level on desktop.
Stale locks cannot occur (the OS advisory lock dies with the process), so no
lock-file cleanup code belongs anywhere. See "Embedded engine lifecycle:
singleton ownership and lock recovery" in `docs/pglite-oxide-tauri-hybrid.md`
for the full pattern and the incident that motivated it.
