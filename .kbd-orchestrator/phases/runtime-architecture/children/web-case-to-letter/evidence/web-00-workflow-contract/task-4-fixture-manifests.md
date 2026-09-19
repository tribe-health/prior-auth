# web-00 task 4 deterministic fixture manifests

Date: 2026-09-16
Phase: `runtime-architecture › web-case-to-letter`
Change: `web-00-workflow-contract`
Task: `1.4`

## Result

**Passed.** The frozen workflow now has immutable, locked JSON input and expected-output manifests for the prior-authorization request, administrative corrected resubmission, and clinical appeal. The same manifests include the required low-confidence denial, missing-citation claim, unrelated-page claim, and foreign-practice negative controls.

The manifests contain only explicitly synthetic people, organizations, identifiers, dates, documents, policy text, clinical text, and letter prose. Contact data uses `example.invalid`. No real patient, member, provider, payer, or practice data was introduced.

## Artifacts

- `docs/architecture/fixtures/web-case-to-letter/fixture-manifest.json`
- `docs/architecture/fixtures/web-case-to-letter/expected-output-manifest.json`
- `docs/architecture/fixtures/web-case-to-letter/manifest-lock.json`
- `docs/architecture/fixtures/web-case-to-letter/verify.py`
- `docs/architecture/fixtures/web-case-to-letter/README.md`
- `docs/architecture/web-case-to-letter-contract.md` now links these artifacts.
- `openspec/changes/web-00-workflow-contract/specs/workflow-contract/spec.md` requires later changes to load the locked manifests and retain all four negative controls.

The input manifest freezes three standalone positive cases, their document page text, source dates, criteria, evidence, case state, gate state, denial state, stable command UUIDs, and cross-resource links. The expected-output manifest freezes lifecycle transitions, met/gap/void outcomes, response classification, exact letter bodies, ordered claims, letter hashes, linkages, submission acknowledgement, UI copy, and refusal results.

## Locked hashes

```text
fixture-manifest.json
37cae4665649a0da36aa08d8e7e56627ed436b897800ae48672addf7429a78d2

expected-output-manifest.json
1ff11ca64c19957fcdc26fa82585d26c42d58d2ae5e634cfcff71d1d30ee7229
```

Expected letter body hashes:

```text
request-case
125344a7c2cdbcd649154202f56afcfa3093646e1273b79f0396355503fa8c0b

corrected-resubmission-case
861aed95636b94c7e877a4b2a2b0394aeda3e7ca11737a646a166f94676a509d

clinical-appeal-case
2cd19bc2c461bd9c3f00f736a75324d95fca43d3dd4583ed0e6cfe303f7515b6
```

## Provenance correction made during review

The initial request draft briefly combined a six-week therapy fact and the policy's twelve-week requirement in one claim sourced only to the therapy record. That would have satisfied non-null fields while violating sentence-level provenance. Before task closure it was split into separate ordered claims: the therapy fact cites the therapy record and the requirement cites the policy document. The manifests and lock were regenerated after this correction.

Task 2.1 review then required each standalone workflow to carry its signature
record, moved the missing-citation candidate behind the deterministic inference
adapter, and specified the UUIDv5 name bytes and canonical encoding. The
verifier now recomputes those contracts, and the hashes above are the resulting
reviewed values.

## Commands and observed output

```text
python3 -m json.tool <each manifest>
exit 0 for all three JSON files

python3 docs/architecture/fixtures/web-case-to-letter/verify.py
Passed: 3 standalone positive fixture families and 4 isolated negative controls
Passed: 96 command UUIDs are disjoint across positive fixtures
Passed: every lifecycle transition has an owning command with actor, capability, lookup anchor, and named revision tokens
Passed: every positive command has directly dispatchable relationships and continuous revision ownership
Passed: initial and response submissions freeze attempt, ordered manifest, page count, and receipt custody evidence
Passed: clinical appeal executes a post-classification four-part response gate
Passed: every expected letter claim has exact span/version/date/hash provenance and human support review
Passed: every negative control has disjoint loadable state and reset semantics
Passed: manifests contain explicit synthetic labels and reserved .invalid contacts
Passed: manifest lock hashes match

openspec validate web-00-workflow-contract --strict
Change 'web-00-workflow-contract' is valid

focused trailing-whitespace scan across the eight task-owned files
Passed: 8 task-owned files have no trailing whitespace
```

A controlled copy of the manifests replaced the request fixture's patient label with `Unmarked Person`, regenerated the copy's hashes, and ran the real verifier. It failed with:

```text
Failed: request-case: patient label is not explicitly synthetic
```

The unchanged tracked fixtures then passed again. This proves the synthetic-label guard rather than relying on a green-only check.

## Limits

These are contract fixtures, not proof that the application consumes them. `web-16` must assemble them through current local services and its browser runner; `web-17` must execute the unchanged candidate in actual supported browsers. No application source, Tauri runtime, mobile source, dependency pin, or generated waypoint was edited.

## Exit

Task 1.4 may close. Task 2.1 must run strict OpenSpec/documentation checks and the required artifact-refiner plus fresh isolated adversarial review. Only a PASS may proceed to completion evidence.
