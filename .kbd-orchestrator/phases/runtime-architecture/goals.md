# Goals

- Use [the runtime execution handoff](../../../docs/handoff/codex-runtime-architecture-execute.md) as the phase brief. Read [the decision index](../../../docs/architecture/README.md) before ADRs; ADR-008 and ADR-009 supersede ADR-006 and ADR-007. Accepted target design is not implementation evidence.
- First delivery: a persisted synthetic clinical-domain row in Forge Postgres reaches the existing evidence timeline through Gate-authorized FRF Electric shapes, real local SQL materialization and coherent PEM graph projection. Demonstrate the row in a browser together with the network payload; unauthorized practices cannot receive it and excluded PHI columns are absent. Use no real patient data.
- Follow runtime architecture section 13 order 1 before orders 2-4: verified Kratos session and authoritative membership/projection/command contracts; authorized FRF Electric facade and downstream identity; scoped cancellable PEM lifecycle; exclusive worker database ownership, migrations, row/checkpoint commits and atomic graph hydration. Server constraints must reject a modified client attempting to broaden rows or columns.
- Resolve carried defects D1-D3: unused sync adapter and empty local tables; discarded startLocalFirstGraph runtime handle; conflated anonymous, unavailable and loading states with no public auth routes. Revalidate these observations during assessment and retain/drain or fence all runtime resources on scope changes.
- Implement runtime section 7 startup states and session-epoch fencing. Public login/recovery must mount without private database access; Anonymous and SessionUnavailable render distinctly; required initial sync gates Ready; account/practice changes and logout clear protected state; unsupported migration enters RecoveryRequired; offline protected rendering remains locked without an approved grant.
- Treat [runtime architecture](../../../docs/architecture/application-runtime-architecture.md) section 13 and [React UI architecture](../../../docs/architecture/react-ui-component-architecture.md) section 11 as one dependency sequence. Preserve the twelve intentional placeholder routes; prioritize the existing reference slice and required authentication/runtime surfaces. Map annotations/source preview prerequisites, native order 5 and update/release orders 6-7 during assessment and planning; the first row proof is not completion of the entire architecture.
- Preserve all four invariants: met/gap/void, independent Gate/AppServices/Postgres clinical authority, one generated design-token source, and no query cache. Keep PEM exact 4.0.0 pins. Use trigger-forced practice_id on base tables and server-authorized column projections; views and snapshot persistence are not relational materializers. Clinical commands remain authoritative and cannot be replayed by local SQL or Zustand actions.
- Assess then plan concrete cross-repository ownership and bounded changes before implementation. Use the runtime section 14 acceptance matrix and UI dependency gates to define evidence. Check callers and demonstrate user-facing behavior in a browser, including denied shape requests, public cold start and identity-change teardown. Build Rust services sequentially. Run the required artifact-refiner and isolated adversarial review gates before reflection; retain the previous publication blocker until the read-path proof actually passes.

## Handoff interpretation for assessment

The handoff is the phase brief; the accepted runtime and UI architecture
contracts govern design. Its canary projection is evidence that column
filtering works, not proof that a modified client is denied. Derive practice,
rows, columns and predicates server-side, authorize every continuation and keep
upstream Electric inaccessible to untrusted clients. The full runtime section 7
state machine includes invalidation during hydration/catch-up and locked
offline rendering; its abbreviated handoff list must not remove those cases.

The first row proof uses synthetic clinical-domain data persisted in Postgres,
not real patient information. Phase creation does not clear the prior phase's
publication blocker or certify a native/runtime release. Assessment and planning
must make later delivery scope explicit while preserving orders 1, then 2–4.

Phase creation scope review: an independent reader checked the handoff against
the decision index and both sequence documents. The interpretation above
resolves its identified authorization/startup/publication ambiguities. No
application source or live-stack behavior was verified by that scope review.
