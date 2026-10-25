# Rust Testing Reference — features-first
> `cargo test` · `tokio::test` · **insta / expect-test snapshots** · wiremock / tempdir fakes only

> **Read CLAUDE.md "Testing: features first, tests later" — it overrides any global TDD /
> 80%-coverage rule.** This file states how that policy is applied to `gen_ui_core` and the
> workspace crates. The short version: build the feature, get it clean under `cargo clippy`,
> exercise it end-to-end once, *then* add 3–5 behavior tests at the public boundary.

## Principles (binding)

- **Features first. Code first. Test later.** Do not write tests until a feature is complete,
  compiles clean under clippy, and has been run end-to-end once.
- **No mocks of internal code — ever.** Trait-injection ceremony to mock internal types
  distorts the design and bloats compile time. `mockall` is **not** a dependency here.
- **Fakes only at real IO boundaries:** `wiremock` for HTTP (the Anthropic API), `tempdir` /
  in-memory engines for the DB. Nothing else gets faked.
- **Test USEFUL COMBINATIONS at public API boundaries** — the FFI surface, Tauri commands,
  the protocol pipeline — behavior a user can observe. Unit tests of internal helpers are the
  lowest-value form and prove nothing about the system working.
- **Prefer snapshot tests** (`insta` / `expect-test`): input in, snapshot out. A behavior
  change costs one `cargo insta accept`, not a test rewrite.
- **One integration-test binary per crate:** put behavior tests in `tests/it/` with modules,
  not many `tests/*.rs` files. Every separate `tests/*.rs` links a separate binary and linking
  dominates the cycle.
- **Budget: 3–5 behavior tests per completed feature.** Coverage percentage is **not** a goal.
  There is no tarpaulin gate.
- **If you fail to fix the same test twice, STOP** and report the discrepancy. Never
  `#[ignore]`, delete, or edit a failing test to escape red without explicit approval.

## Dev-dependencies

```toml
[dev-dependencies]
insta       = { version = "1.40", features = ["json", "redactions"] }
expect-test = "1.5"
wiremock    = "0.6"     # fake at the HTTP boundary only
tempfile    = "3.12"    # tempdir DB at the IO boundary only
tokio       = { version = "1.40", features = ["macros", "rt-multi-thread", "test-util"] }
# NOTE: no mockall, no proptest-by-default, no tarpaulin. Add proptest only for a specific
# parser/fuzz need, and justify it in the test module.
```

## Boundary test: the protocol pipeline (snapshot)

Drive a real `StreamEvent` sequence through the real `A2uiAdapter` and snapshot the emitted
A2UI events. No mocks — the adapter is internal, so we exercise it, not fake it.

```rust
// tests/it/protocol.rs  (one binary: tests/it/main.rs declares `mod protocol;`)
use gen_ui_protocol::{A2uiAdapter, StreamEvent, ContentBlockType};

#[test]
fn text_block_folds_to_final_a2ui_event() {
    let mut adapter = A2uiAdapter::new("run-001");
    let mut out = Vec::new();
    out.extend(adapter.ingest(&StreamEvent::ContentBlockStart {
        index: 0, block_type: ContentBlockType::Text,
        tool_use_id: None, tool_name: None, language: None,
    }));
    out.extend(adapter.ingest(&StreamEvent::TextDelta { index: 0, delta: "Hello ".into() }));
    out.extend(adapter.ingest(&StreamEvent::TextDelta { index: 0, delta: "world".into() }));
    out.extend(adapter.ingest(&StreamEvent::ContentBlockStop { index: 0 }));

    // Snapshot the whole emitted sequence — behavior changes cost one `cargo insta accept`.
    insta::assert_json_snapshot!(out);
}
```

## Boundary test: the agent loop against a faked Anthropic API (wiremock)

`wiremock` fakes the **real IO boundary** (HTTP), not any internal type. The agent, protocol
pipeline, and client are all real.

```rust
// tests/it/agent.rs
use gen_ui_agent::{AgentRuntime, AgentConfig};
use gen_ui_client::AnthropicClient;
use tokio::sync::mpsc;
use wiremock::{MockServer, Mock, ResponseTemplate};
use wiremock::matchers::{method, path};

#[tokio::test]
async fn agent_reaches_end_turn_after_tool_use() {
    let server = MockServer::start().await;
    Mock::given(method("POST")).and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(200)
            .set_body_string(include_str!("fixtures/tool_use_response.sse")))
        .up_to_n_times(1).mount(&server).await;
    Mock::given(method("POST")).and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(200)
            .set_body_string(include_str!("fixtures/end_turn_response.sse")))
        .mount(&server).await;

    let (tx, mut rx) = mpsc::channel(64);
    let client = AnthropicClient::new_with_base_url("test-key", server.uri());
    let mut agent = AgentRuntime::new(
        AgentConfig { model: "claude-opus-4-8".into(), max_turns: 5, ..Default::default() },
        client, None, None, None,
    );
    agent.register_tool("test_tool", "A test tool", serde_json::json!({}),
        |_| Ok("tool result".into()));

    agent.run(vec![], "test message".into(), tx).await.unwrap();

    let mut events = Vec::new();
    while let Ok(ev) = rx.try_recv() { events.push(ev); }
    assert!(events.iter().any(|e| matches!(e, gen_ui_protocol::StreamEvent::Done)));
}
```

## Boundary test: the DB intent API against a tempdir engine

Test the **intent functions** (`memory_search`, `upsert_entity`, `graph_expand`) — the public
surface the UI actually calls — against a real SurrealDB `kv-rocksdb` in a `tempdir`. Never
mock the store; never assert against raw SurrealQL.

```rust
// tests/it/db.rs
use gen_ui_db::Db;
use tempfile::TempDir;

async fn tmp_db() -> (Db, TempDir) {
    let dir = TempDir::new().unwrap();
    (Db::open(dir.path()).await.unwrap(), dir)
}

#[tokio::test]
async fn upsert_then_graph_expand_returns_neighbor() {
    let (db, _dir) = tmp_db().await;
    let flutter = db.upsert_entity("Flutter", "framework", vec![0.0; 384]).await.unwrap();
    let rust    = db.upsert_entity("Rust", "language", vec![0.0; 384]).await.unwrap();
    db.relate(&flutter, "uses", &rust).await.unwrap();

    let hits = db.graph_expand(&flutter, 1).await.unwrap();
    assert!(hits.iter().any(|h| h.name == "Rust"));
}
```

## Running tests

```bash
# Inner loop is clippy, NOT test — see references/rust/compile-speed.md
cargo clippy --workspace -- -D warnings

# Behavior tests (once a feature is complete)
cargo test -p gen_ui_protocol
cargo test --test it              # the single per-crate integration binary

# Review / accept snapshot changes
cargo insta review
cargo insta accept
```

There is intentionally no coverage command here. Coverage percentage is not a completion
criterion in this repo or its scaffolded projects.
