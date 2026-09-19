# Web-05 task 5 — focused verification and review

Result: **Passed** at Tier 1. The verified scope is browser-first document processing, minimized document-status publication, mounted document intake, PGlite upgrade safety, and the authorized shape boundary. Actual-browser case-to-letter certification remains assigned to Web-17. No Tauri or mobile source was changed.

## Observed checks

- `python3 scripts/test-web05-document-status-projection.py --install-mode fresh ...` — Passed against a disposable database.
- `python3 scripts/test-web05-document-status-projection.py --install-mode upgrade ...` — Passed against a populated upgrade database.
- Focused Vitest run — 45/45 document intake, source preview, case intake, HTTP client, and session tests passed.
- Rust focused tests — aso-host projection 3/3; case management 2/2; Axum cases 9/9; Axum documents 6/6; document processor 2/2.
- `cargo fmt --all -- --check`, three crate-scoped `cargo check` runs, and prescribed crate-scoped `cargo clippy --no-deps` runs passed. Axum retained five pre-existing large-Response warnings.
- `pnpm --dir web typecheck`, `pnpm --dir web lint`, and `pnpm --dir web build` passed. Vite retained the existing PGlite browser-external/eval and chunk-size warnings.
- `openspec validate web-05-document-processing-ui --strict` passed.
- Production projection sabotage — adding `storage_uri` failed the allow-list guard with exit 101; byte-identical restoration passed.
- Electric automatic publication — a uniquely named empty relation was added only to `electric_publication_default` after a shape request and disappeared after cleanup. No clinical rows were touched.
- Populated PGlite upgrade negative control — failed before repair with `case_number` null values. The repaired upgrade clears the obsolete replica generation and checkpoint before required columns are added.
- Generation cutover negative control — failed at stored generation 9 versus expected generation 10. `startsNewGeneration` now advances the generation inside the migration transaction before destructive SQL; 19/19 focused sync tests passed.
- Raw Electric endpoint negative control — rendered default Compose config exposed host port 3000. The corrected config has no Electric host mapping and exposes port 3000 only inside the Compose network.
- Artifact Refiner — Passed 17 deterministic checks across 124 frozen inputs after final review evidence was added.
- Isolated adversarial review — gpt-5.5, distinct from producer gpt-6-astra, final verdict PASS with 0 critical, 0 warning, and 0 suggestion findings. Its report passed the strict anti-sycophancy screen at score 0.0.

## Retained diagnostics

The first fresh integration attempt timed out during shared Cargo target contention; the unchanged run later passed. A temporary disposable Electric proof could not reach its container; cleanup passed, and the subsequent live empty-relation proof passed. An exploratory all-targets `clippy -D warnings` command exceeded the prescribed T0 contract and surfaced existing unrelated warnings; the required crate-scoped checks passed. These diagnostics are retained and are not qualifying evidence.

## Remaining boundary

This task does not claim an actual-browser full scenario. Web-17 must stand up the browser stack and certify case creation through letter generation. The next KBD task records change completion evidence; it is intentionally separate from this task.
