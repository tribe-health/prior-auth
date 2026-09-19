# Pass 7 rejection feedback

Both critical findings contradict observed or packet-visible evidence.

1. `crates/aso-server-axum/src/routes/gate.rs` compiles as written. The current source completed `cargo test -p aso-server-axum routes::cases::tests --no-fail-fast`: 5 passed, 0 failed. The `PolicyTarget` arm binds only `Copy` data and does not make the later `target` use illegal. Reassess the language claim against the observed compiler result rather than inferring a move error.

2. The three-state evidence endpoint remains mounted. `crates/aso-server-axum/src/lib.rs` still contains `.merge(routes::evidence::router())`. The endpoint implementation moved earlier to `crates/aso-server-axum/src/routes/evidence.rs`, which still mounts `GET /api/cases/{case_id}/evidence` and serializes separate `met`, `gap`, and `void` fields. The Web-01 diff adds `.merge(routes::cases::router())`; it does not remove the independent evidence router.

Re-review the current packet for actual defects, with special attention to the repaired minimal command receipt and the write-only PostgreSQL lookup evidence. Do not repeat either contradicted finding.
