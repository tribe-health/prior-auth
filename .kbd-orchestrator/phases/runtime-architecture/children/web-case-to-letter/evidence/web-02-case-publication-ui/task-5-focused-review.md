# Web-02 task 2.1 — focused verification and review

Result: Passed.

The Web-02 browser set passed 59/59 tests in 16 files with TypeScript and Oxlint clean. The ASO projection tests passed 3/3, the mounted server grant passed 1/1, and the feature-enabled FRF gateway test passed 3/3. The foreign-practice guard was removed temporarily: its selector suite failed 1/5 because the foreign row became `ready`; restoring the source returned 5/5.

Two review-driven boundaries have observed red-green evidence. Persistent storage combined with the experimental clinical materializer first failed because no guard existed; startup now refuses it before PGlite opens. Case command tests then failed because a protected-field mismatch received `confirmed` and uncertain reconciliation lost the submitted target; create/update now require an authorized detail read, and all command expectations survive uncertainty.

`python3 .refiner/artifacts/web-02-case-publication-ui/rebuild.py` passed 12/12 task-level constraints across 44 sources and strict OpenSpec validation. The final isolated `gpt-5.5` judge reviewed the `gpt-6-astra` diff and returned `PASS` with zero critical findings, one warning, and zero suggestions. The sycophancy screen passed at 0.0803571417927742.

The warning concerns attributed annotation body publication introduced by the earlier RA15 contract. Web-02 does not widen that grant. ADR-009 limits that projection to memory-only browser use, and this task added the missing structural refusal for persistent materialization. The warning is retained for the separate durable-data approval decision.

Project-wide build, workspace, Flutter, architecture-audit, and full-integration gates were not run at this mid-change task boundary. The repository verification tiers and the operator's browser-first instruction assign them to change or phase completion. Web-02 task 3.1 remains pending and owns final mounted-caller/spec-delta completion evidence.
