## Context

RA06 server revocation and the React/Zustand receiving boundary are implemented and candidate-bound.
`createEvidenceSyncAdapter` exists only as an exported definition in
`web/src/shared/sync/electric-shapes.ts`; RA11c owns its production construction site. The current
RA06 final task nevertheless requires that future caller. RA07 depends on RA06 and RA11c depends
transitively on RA07, so the task creates a cycle.

The desktop host currently returns `NativeAuthenticationUnavailable` for nine clinical commands.
RA17 already requires full operation parity, but its task and spec do not name those commands.

## Decisions

- RA06 certifies durable ASO authority events, the distributed Gate fence, nonempty FRF final
  server-frame cancellation, and synchronous responsive React/Zustand fencing.
- RA06 final review consumes a candidate-bound open-obligation receipt. That receipt passes only
  when `createEvidenceSyncAdapter` has its expected definition, no production call site exists,
  RA11c remains unchecked and owns failure publication, and RA06 makes no producer claim.
- A production call site is a non-declaration call expression in non-test TypeScript/TSX under
  `web/src`. Imports, comments, declarations and test/spec modules are recorded but excluded.
- The receipt hashes the current adapter file and RA06/RA11c contract files, records the candidate
  digest and command outcome, and marks the producer obligation `Blocked` while its verification
  result is `Passed`.
- RA17's Decisions section, tasks 1.3/1.4 and delta spec will enumerate `gate_state`,
  `affirm_gate`, `remove_gate`, `lookup_gate_command`, `signing_target`, `sign_letter`,
  `lookup_sign_letter_command`, `reassess_evidence`, and `lookup_reassessment_command`.
- Each RA17 command must use the host-owned credential and reject renderer actor, practice, epoch,
  or window hints that would confer authority. This is the concrete form of existing RA17 outcome
  2, not a separate capability.

## Failure behavior

The verifier fails if the adapter seam disappears, a production caller appears before supported
RA11c evidence, any RA11c task is checked without the expected completion evidence, the RA06 safe
ownership text drifts, or a receipt is requested without a candidate digest.

## Limits

This change does not implement the RA11c caller or activate native credentials. It records those
obligations in the phases that can execute them.
