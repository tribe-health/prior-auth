# Web07 task 1.1 eligibility evidence

- Phase: Execute.
- Dependency: `web-06-criteria-catalog-core` is `DONE` / `COMPLETE` with 7 of 7 tasks complete.
- Canonical state: `web-07-criteria-selection-ui` is `IN_PROGRESS` with no blockers.
- OpenSpec: `openspec validate web-07-criteria-selection-ui --strict` reported `Change 'web-07-criteria-selection-ui' is valid` before implementation.
- Frozen workflow contract: `docs/architecture/fixtures/web-case-to-letter/fixture-manifest.json` defines the criteria catalog and selection revisions, selection command route, capability, retry result, and downstream invalidation tokens.
- UI authority: `docs/design/prototype/screens/policy-panel.html`, `docs/design/prototype/screens/pathway-comparison.html`, `docs/aso-brand-guide.html`, and `assets/templates/design-tokens/tokens.toml`.
- Ownership: the root agent owns the Web07 host, PostgreSQL adapter/migration, Axum route, browser API/model/hook/view, and focused tests. No concurrent editor owns these files.
- Decision gates: web only; durable state remains in Postgres/PEM; Zustand contains transient view state; no query cache; browser HTTP is the only shell adapter in this change; Tauri and mobile are deferred.
- Plan revision 11: reload and resize hardening belongs to Web15a, broad browser certification belongs to Web17, and neither blocks implementation of the mounted Web07 route.
- Blockers: none.
