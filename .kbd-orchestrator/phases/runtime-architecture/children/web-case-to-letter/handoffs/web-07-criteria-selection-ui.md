# Web-07 criteria-selection UI handoff

Prepared at the Web-06 close boundary on 2026-09-18. Do not activate Web-07 until the operator approves and the checkpoint commit split is complete.

## Authoritative position

- Branch: `codex/web-case-to-letter-checkpoint`.
- KBD revision: 1712; plan revision: 11.
- `children/web-case-to-letter/progress.json` is authoritative. Web-00 through Web-06 are complete; Web-07 is pending.
- The waypoint's missing or stale `exactNextWork` is the recorded KBD projection defect. Do not repair it with phase activation or transition.
- The intended next command after checkpoint approval is `/kbd-apply web-07-criteria-selection-ui`.

## Required session inputs

Read these before starting:

1. `/Users/gqadonis/.codex/attachments/78c02fa2-3b9b-43f6-8006-1dd52483cafa/pasted-text.txt`
2. `AGENTS.md`
3. `docs/architecture/web-case-to-letter-contract.md`
4. Web-07 OpenSpec tasks and specs after `/kbd-apply` creates or resolves them
5. `docs/design/prototype/`, `docs/aso-brand-guide.html`, and `assets/templates/design-tokens/tokens.toml`
6. `~/.codex/skills/pem-local-first/SKILL.md`, `~/.codex/skills/a11y-gate/SKILL.md`, `~/.codex/skills/hybrid-design-tokens/SKILL.md`, `~/.codex/skills/reference-ui-fidelity/SKILL.md`, and `~/.TOOLS/skills/agents/polish/SKILL.md`, with the operator overrides in the correction

Do not load `react-vite-stack`, `frontend-patterns`, or Impeccable `critique`.

## Web-07 work under revision 11

The registered tasks remain the source task surface. Apply these revision-11 interpretations:

- Implement immutable case criteria selection and invalidation tokens against the exact effective criteria snapshot.
- Register and verify lane, privacy class, exact columns, tenant predicate, revocation, projection, and materialization before publication.
- Mount the policy and pathway browser views. Native parity is deferred to RA19/RA21.
- Add a Tier 1 Vitest routed render test through the real route composition. Deliberately break the route wiring once, observe red, restore, and retain the proof. Do not mock both loading boundaries.
- Keep stale-selection sabotage-and-restore and the small-packet parallel critic round. Defer responsive resize/reload, artifact-refiner freezing, read-mostly conflicting retry, and packet/manifest hygiene to `web-15a-browser-hardening`; record every deferred item in Web-07 evidence.
- Run `cargo check` before `cargo fmt --check`. Use a migrated template database and checked-in populated synthetic fixture. Never run two Cargo processes concurrently.
- Commit Web-07 after its verdict and evidence, before activating Web-08.

## Ownership split

If a second implementation agent is used, assign it only `web/src/features/**/components`, the corresponding feature `model` files, and the Web-07 route file. The root agent owns publication, selectors, command reconciliation, shared registries, migration/schema files, and all files outside that explicit UI set. State the exact paths before editing.

## Checkpoint state that must be resolved first

`bash scripts/audit.sh` passed all six checks. The modified/untracked inventory scan covered 14,760 files and 2.57 GB. Text findings were source hashes, revision tokens, deterministic fixture identifiers, local storage names, and explicit synthetic credentials. No candidate occurred outside test, fixture, evidence, review, or refiner context, and no real patient data was identified.

Nested review source bundles contain test-only private-key fixtures at internal paths `flint-gate/crates/flint-gate-core/tests/mcp_e2e.rs` and `flint-realtime-fabric/crates/frf-identity-ory/tests/fixtures/test_private_rsa.pem`. Do not include the affected `candidate-source-bundle.zip` files in a commit unless the operator explicitly approves that treatment. No checkpoint commit or push has occurred.
