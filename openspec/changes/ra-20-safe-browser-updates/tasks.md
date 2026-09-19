## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (web-case-to-letter/web-17-browser-scenario-certification), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Implement compatibility metadata and additive server deployment migration flow for existing installations. Verification: A compatible update arrives with dirty drafts or an unresolved clinical command must produce this observed outcome: The page does not force reload or lose work; command outcome is reconciled before activation.
- [ ] 1.3 Add safe activation across tabs with retained chunks, draft resolution and clinical idempotency reconciliation; add a service worker only if required, static-only by default. Verification: An incompatible old tab resumes while schema migration begins must produce this observed outcome: It is fenced or the upgrade waits; checksummed migration/generation handover cannot partially corrupt the active replica.
- [ ] 1.4 Exercise dirty-work updates, old-tab schema conflicts, migration failure, quota/rebuild and post-activation revalidation. Verification: Quota eviction, incompatible snapshot or migration failure occurs must produce this observed outcome: RecoveryRequired distinguishes rebuildable rows from retained drafts; session and data are revalidated after recovery.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when A compatible update arrives with dirty drafts or an unresolved clinical command, then The page does not force reload or lose work; command outcome is reconciled before activation. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when An incompatible old tab resumes while schema migration begins, then It is fenced or the upgrade waits; checksummed migration/generation handover cannot partially corrupt the active replica. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when Quota eviction, incompatible snapshot or migration failure occurs, then RecoveryRequired distinguishes rebuildable rows from retained drafts; session and data are revalidated after recovery. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
