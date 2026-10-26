# Design

## Context

From `analysis.md` → UAR consumption (read at `origin/main`, re-checked at v1.3.0
by `uar-embedding-spike` task 1.1): `EmbeddedRuntimeBuilder::local_provider`
registers a host driver (`src/embedded.rs:315`); the builder refuses to build
without persistence, governance, tool admission and a driver (`493-595`);
in-process AG-UI per ADR 0012. This change is written against the spike's report
(`docs/plan/uar-embedding-spike.md`); where the report contradicts this design,
the report wins and this design is amended before implementation.

## Goals / Non-Goals

**Goals:** embedded UAR on iOS with all four host components explicit; the
decision-14 driver rule enforced in code; the clinical-command boundary held.

**Non-Goals:** Android UAR; desktop process topology (`desktop-uar-topology`);
clinical agents or a cloud driver; configuring UAR memory to share PatientGPT's
embedder.

## Decisions

1. **Driver rule where the agent id is visible.** UAR v1.3.0 takes one driver for
   the whole runtime (`EmbeddedRuntimeBuilder::local_provider(driver, provider)`,
   `src/embedded.rs:315`), and neither `ProviderConfig` nor `LlmRequest`
   (`src/llm/mod.rs:335-364`) carries an agent id, so the driver itself cannot tell
   agents apart. Enforcement therefore sits in two places that can: (i) an embedded
   runtime whose only driver is local has only the onboarding agent installed, and
   (ii) the PatientGPT facade refuses `start_run` for any other agent id with
   `driver_not_permitted` before calling UAR. D-014's wording named the tool
   admission port; admission cannot see the driver, so this design moves the rule
   and the operator accepted the move in D-018.
2. **Deny-by-default admission.** An empty allowlist is simpler and stronger than
   classifying tool effects this phase; effect classification arrives with the
   first tool. Start-up refuses clinical command names in any allowlist. UAR v1.3.0
   returns a denial to the model and continues (`src/llm/orchestrator.rs:559-560`,
   `2858-2861`), so a denial is not a run error; the evidence is that nothing ran.
6. **No seeded agents.** `EmbeddedRuntimeBuilder` seeds built-in agents by default
   (`seed_defaults: true`, `src/embedded.rs:285-289`), and `start_run` takes an
   agent artifact directly, so installation alone is not a gate: the builder is
   called with `seed_defaults(false)` and the facade check is the effective rule.
3. **Governance engine explicit.** UAR's governance engine is constructed with
   PatientGPT's policy (no tools, onboarding agent only), never a permissive default.
4. **Persistence under the data directory**, sharing nothing with PatientGPT's
   conversation store; UAR memory uses UAR's candle embedder in its own space.
5. **Workspace patch overlay** applied at the PatientGPT root exactly as the spike
   prescribes, with the spike's observed effect on desktop `surrealdb` recorded.

## Risks / Trade-offs

- [UAR's embedding API is not a compatibility contract] → pinned to the v1.3.0
  commit; upgrades are explicit changes (accepted risk, decision 12).
- [Nightly toolchain if stable fails] → applied per the operator's decision 4
  answer after the spike, to the whole FFI build that links UAR.
- [Start/subscribe race] → the spike measures it; if events are lost, subscription
  happens before `start_run` returns or the run is refused, per the report.
