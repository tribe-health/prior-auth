# Web-06 repair confirmation scope

Review only the repair delta against these four required outcomes:

1. An obtained-by-request criterion can supersede only a criterion owned by the same verified practice. Published supersession remains global and cannot target a practice-owned criterion.
2. Effective-range overlap is namespaced by payer, evidence grade, and controlling practice scope, so published and obtained criteria and two practices do not block one another.
3. A processed policy source document's effective date must equal the imported policy's effective-from date before any criterion can become controlling.
4. A catalog revision token must use the exact `catalog:criteriaCatalogRevision:r<canonical decimal>` namespace and representation. An arbitrary prefix or a noncanonical zero is invalid before repository execution.

Blocking review dimensions are authority, tenant isolation, provenance, migration safety, idempotency/revision semantics, architecture contract, and test truthfulness. Report CRITICAL only for a product defect that violates one of those dimensions. Evidence formatting and packet hygiene may be WARNING or SUGGESTION.

The source digest is computed only over repaired product and focused-test sources. Evidence and review files do not participate, so writing this confirmation cannot invalidate its own source identity. The fresh, ordinary populated-upgrade, and frozen-migration forward-upgrade receipts must all report `Passed`. The forward-upgrade receipt must prove migrations 2026090624 and 2026090625 remained byte-for-byte recorded while migration 2026090626 repaired an existing populated catalog. The focused host test must prove every invalid revision-token form is rejected before any repository call. All four repair regression checks must be present before this confirmation can pass.
