# decisions

Append-only. Dated entries. Mark superseded entries; do not delete them.

## 2026-10-04
- Initialized by prometheus-context-bootstrap.

## 2026-10-04 — PatientGPT scope and bootstrap authority

- The operator requested context bootstrap toward full implementation of the
  UI and workflows in `docs/design`, using the architecture skill in
  `/Users/gqadonis/Projects/hybrid-mobile-architecture-src`. The local design
  reference governs product behavior, branding, and layout across all shells.
- Keep one resident project contract in `AGENTS.md` with `CLAUDE.md` linked to
  it, so agent-team policy cannot drift between entrypoints. Default to teams;
  actual project team definitions and installation are deferred by the operator.
- Use the mixed-model bootstrap profile and Rust/TypeScript/Flutter path rules
  because the intended product includes shared Rust services, web/Tauri, and
  Flutter. No application scaffold or dependency installation is included.
- Record architecture decisions in `versions.toml` without importing unverified
  dependency pins from the source checkout. Preserve existing OpenSpec 1.14.0.
- Preserve the reference's existing green met-state token as semantic status
  color under the operator's explicit branding instruction. Do not introduce
  another decorative color family or recolor the prototype during bootstrap.

## 2026-10-04 — PatientGPT team setup

Adopted patientgpt-delivery as default 17-role development team. PM owns acceptance, lead owns integration, UAR expert owns immutable product agents and full registered AG-UI/A2UI contract. Native Codex model selected from local configuration; other harness model inheritance remains explicit. User cadence overrides managed per-edit testing: tests/review at complete phase end, builds/demo each two-hour increment, full web/Tauri every even increment. Rationale: preserve shared contracts and visible vertical flows without premature test gates.

## 2026-10-04 — KBD project initialization

Initialized PatientGPT as sole focus, with the parent workspace dependencies as read-only references and explicit narrow root workflow ownership preserved. Retained Codex/patientgpt-delivery over the generic template agent/model defaults. Omitted speculative model registry and executable workflow triggers; no app manifests establish commands. Preserved bootstrap waypoint and activePhase=null.
