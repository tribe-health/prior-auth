# Client-Side RAG — Vectors, Chat Threads, and Agent Retrieval

> How chat history and agent knowledge get embedded, indexed, and retrieved
> ENTIRELY on-device. Doctrine: [doctrine.md](doctrine.md); store matrix
> rationale: `docs/pglite-oxide-tauri-hybrid.md`.

## Vector store per tier (matrix + dimensions)

| Tier | Vector engine | Index | Notes |
|---|---|---|---|
| Web | pgvector inside PGlite | HNSW | budget ~180 MB per 100k vectors; build lazily |
| Tauri desktop | pgvector via pglite-oxide | HNSW | same SQL as web — one query dialect |
| Mobile | sqlite-vec | brute/IVF per size | same repository trait, different SQL behind it |
| Optional graph-RAG | SurrealDB 3.2 (`gen_ui_db_graph`) | HNSW + BM25 + RRF | benchmark-gated module; derived & rebuildable, never on the sync path |

**Embedding dimension is standardized at 384** (all-MiniLM-L6-v2 class, or a
matryoshka-truncated 768 model). One dimension everywhere means a vector
computed on any device is valid on every other after sync. Embedding runs
on-device via `fastembed`/candle inside `gen_ui_core` (desktop/mobile FFI); the
web tier calls the same core compiled to wasm, or defers embedding of its rows
to a paired native device when the wasm lane is disabled (rows carry
`embedded_at IS NULL` until covered).

## Schema shape (lane-1 tables, additive per LFS-INV-3)

```sql
-- chat messages are ordinary synced entities (conversation thread = PEM entity)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS embedding vector(384);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS embedded_at timestamptz;
CREATE INDEX IF NOT EXISTS messages_embedding_hnsw
  ON messages USING hnsw (embedding vector_cosine_ops);
```

- Embeddings are **derived data**: nullable, recomputable, and (per ADR-LFS-3)
  synced only when the entity type opts into columnar sync — the default is
  that each device embeds its own rows after hydration (an idempotent
  backfill job keyed on `embedded_at IS NULL`).
- Vault (`local`-class) content is embedded into a SEPARATE local-only index —
  vault vectors never land in synced tables (LFS-INV-4 applies to derived data
  too; an embedding of a secret is still a secret).

## Ingestion (embed-on-write)

1. Message/artifact row commits to the local store (normal PEM write path).
2. A store-level after-commit hook enqueues `EmbedJob{table, id}` into a local
   job queue (NOT the sync `_operation_queue` — different lifecycle, local-only).
3. The embedder worker (spawn_blocking in the core runtime) computes the
   vector, writes `embedding`/`embedded_at` in one UPDATE.
4. UI never waits on embedding; retrieval simply sees fewer candidates until
   backfill catches up.

## The retrieval loop (the part the master plan leaves unspecified)

Exposed as ONE typed API in `gen_ui_core` — feature code and agents call this;
they never write SQL:

```rust
pub struct RetrievalQuery {
    pub text: String,
    pub scope: RetrievalScope,   // ThisConversation | AllConversations | AgentMemory | Vault
    pub k: usize,                // default 8
    pub min_score: f32,          // cosine floor, default 0.3
}

pub struct RetrievedChunk {
    pub source_id: String,       // entity id (message, memory, vault key)
    pub text: String,
    pub score: f32,
    pub provenance: Provenance,  // table + privacy_class + timestamps
}

impl RagEngine {
    /// embed(query) → vector search (+ BM25 where available) → RRF/score merge
    /// → recency/dedup trim → Vec<RetrievedChunk> (never exceeds token_budget)
    pub async fn retrieve(&self, q: RetrievalQuery, token_budget: usize)
        -> Result<Vec<RetrievedChunk>>;
}
```

Pipeline stages (fixed order, each independently testable):

1. **Embed** the query (same 384-dim model as ingestion).
2. **Candidate search**: cosine HNSW top-`4k` per store; where BM25/FTS exists
   (SurrealDB module, sqlite FTS5), run it in parallel and merge with RRF.
3. **Trim**: dedup by source entity, apply `min_score`, prefer recent on ties,
   cut to `k` and to `token_budget` (chunks are whole messages; no
   mid-message splitting for chat history).
4. **Assemble**: chunks are returned with provenance; the AGENT decides prompt
   placement. `Vault`-scope chunks are marked `privacy_class: local` so the
   caller's sink rules apply (momentary context only — see
   [peer-crdt.md](peer-crdt.md)).

Agent wiring: UAR calls the governed `retrieve()` capability with a scope
chosen by verified intent (conversation recall, agent memory, or personal
context). Retrieval is read-only; UAR writes approved conclusions back as
entities (lane 1) or vault facts (`local`), never into indices directly.

## Non-rules (rejected designs)

- No server round-trip in the loop — this is CLIENT RAG; cloud RAG is a
  different feature with different privacy review.
- No LangChain-style chunker pipelines for chat threads — messages are already
  the right chunk size; artifacts chunk at paragraph boundaries only when a
  single artifact exceeds ~1k tokens.
- No second vector store per surface — one relational vector index per tier
  (matrix above); SurrealDB graph-RAG is an optional add-on, and disabling it
  must not change `RagEngine`'s API or results ordering contract.
- No embedding of `local`-class data into synced tables, ever.
