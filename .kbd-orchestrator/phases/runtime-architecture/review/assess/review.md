# Assessment review and required handoff supplement

Date: 2026-09-06. Read this receipt with [assessment.md](../../assessment.md); it supplies the final review findings and the additional goal-7 evidence gathered after review.

## Result and isolation

Independent critic: 0 CRITICAL, 0 WARNING, 1 SUGGESTION. C1's evidence-state identity collision was incorporated into assessment A3. See [critic.md](critic.md) for the native task's retained prior context and selective inspection limits.

Fresh REST judge: k3, producer gpt-6-astra, verified-distinct. Both rounds returned PASS with 0 CRITICAL, 2 WARNING and 1 SUGGESTION. The final judge reviewed assessment SHA-256 `a16491188822339f5d1406ee95b1d904b3f5481f2b99cb55528c31156b54c66d`; the file still matches. See [final findings](findings-final.json) and [final packet](packet-final.json). The packet contains 33 bounded current source excerpts. PASS is an assessment-artifact verdict, not runtime certification.

Both judge anti-theater checks printed `PASS (score=0.0, strictness=strict)` and exited 0. Assessment tone checks scored 0.017857, with one low length flag and no mandatory correction. The length retains five-repository findings and all 19 acceptance scenarios.

## Findings and disposition

| Finding | Disposition |
|---|---|
| Round 1: Gate TTL/caller evidence absent from packet | Added cache, configuration and pipeline excerpts. Recorded `rg -n invalidate_session crates` in Gate: definition at cache/mod.rs:198, only caller at :481 in a test. |
| Round 1: clinical pending-action replay exclusion omitted | Added explicit prohibition to A4. Epoch fencing alone is insufficient; signing/affirmation cannot enter automatic replay. No current ASO clinical replay caller is asserted. |
| Final W1: further source citations not excerpted, helper reports misleading MISSING paths | Carry evidence limitation. Root/independent source readers inspected the cited files, but the REST judge did not see every excerpt. The helper indexes the focus repository and cannot reliably resolve abbreviated companion paths. Source-observed claims are not runtime proof; planning must reopen exact companion paths before changing them. No claim of complete independent verification is made. |
| Final W2: generated tokens and no-query-cache invariant lacked current checks | Follow-up checks below close the token evidence gap and reveal transitive SWR. The dependency issue remains open for planning. |
| Final suggestion: signing trigger/Forge bootstrap excerpts omitted | Same packet limitation as W1. These source references were inspected by the server-boundary reader; no current execution of those controls is claimed. |

No third judge round was run. The remaining warnings and this supplement must travel with the assessment; they are not converted into zero-findings certification. This receipt's post-review diagnostic evidence was not itself judged by k3.

## Goal 7: additional current evidence

The existing generator was read, then run with a temporary root containing a copy of the current token source. Its generated outputs were compared byte-for-byte to the project files. Only the temporary root was written; it was removed afterward.

```text
Token generator isolated temp root: exit 0
web/src/theme.css MATCH
mobile/lib/core/theme/tokens.dart MATCH
```

Both project outputs contain their DO NOT EDIT banners. `git status --short -- web/src/theme.css mobile/lib/core/theme/tokens.dart assets/templates/design-tokens/tokens.toml` returned no entries. The single-source generated-token invariant is currently supported by exact regeneration equality, not just a banner.

A scan of the web manifest and lockfile for @tanstack/react-query, @tanstack/query-core, @apollo/client and swr returned:

```text
web/package.json query-cache matches: []
web/pnpm-lock.yaml query-cache matches: ['swr']

$ pnpm --dir web why swr
swr@2.5.1
└─┬ @ai-sdk/react@4.0.95
  └─┬ @assistant-ui/ai-sdk@0.0.4
    └── aso-web@0.1.0 (dependencies)
Found 1 version of swr
```

`rg -n 'swr|@tanstack/react-query|@tanstack/query-core|@apollo/client' web/src web/package.json` returned no matches (exit 1). The lockfile edge appears at web/pnpm-lock.yaml:4349–4356. This establishes a transitive dependency, not an observed running clinical query cache. Existing assistant-ui presentation imports do not establish that the ai-sdk runtime is mounted.

**Planning input G7-SWR:** the strict no-SWR dependency rule needs an explicit disposition of this existing transitive dependency before adoption of the assistant runtime or release certification. Do not infer that the manifest-only audit proves its absence, silently remove working dependencies during assessment, or authorize a clinical query cache. Goal 7 remains PARTIAL. Application/lockfile changes are deferred to a bounded plan.

## Verification and scope

Document checks: four assessment links resolve; all 19 acceptance rows are present; fences balanced; JSON parses; final packet hash matches assessment. Web typecheck/lint exited 0. Current DB metadata reports 60 base tables and 10 views. PEM pin/declaration/installation agrees at 4.0.0 for both packages.

No application code, dependency, source tokens or schema changed. No new application guards were added. Existing KBD/memory modifications were preserved. No integrated browser, live authorization, Rust/Flutter build, clinical command exploit, or native/device validation was run. The prior publication blocker stays active.
