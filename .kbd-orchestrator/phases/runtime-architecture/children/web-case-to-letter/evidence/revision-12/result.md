# Web case-to-letter revision 12 result

**Result: Passed**

The browser-first candidate provides the branded responsive case workflow,
authorized source retrieval, durable Liter-LLM document tasks, canonical
assembly, claim and seven-finding QA persistence, review, approval, signing,
submission packet assembly, acknowledgement, A2A, MCP Streamable HTTP, and the
shared MCP App/A2UI document surfaces. Production patient-data inference stays
disabled and cannot fall back to the synthetic Qwen route.

## Observed local evidence

- `cargo test --workspace`: Passed. The retained output is
  `rust-workspace-final.log`.
- `pnpm exec vitest run --maxWorkers=4`: Passed: 108 files passed, one mounted
  integration file skipped; 689 tests passed and two skipped. The separately
  mounted campaign passed. The retained output is `web-full-suite-final.log`.
- `bash scripts/audit.sh`: Passed all six architecture checks. The retained
  output is `architecture-audit-final.log`.
- The mounted replica and browser lifecycle campaigns passed in
  `mounted-replica-campaign.json` and `mounted-browser-lifecycle.json`.
- Determination modes, durable document tasks, signed-case progress,
  submission custody, task-status projection, and repeat initialization passed
  in the corresponding revision-12 logs.
- Live protocol smoke passed A2A 0.3.0 discovery/task retrieval, MCP 2025-11-25
  negotiation/tools/resources, and the sandboxed `ui://aso/document-workspace`
  MCP App resource. The retained result is `live-protocol-smoke.json`.
- Actual browser review generated, reviewed, approved, and signed a Qwen-backed
  response letter. A prior request completed submission acknowledgement. Final
  1440x900 and 390x844 captures show no horizontal overflow; the reduced-motion
  check observed zero moving elements.
- Independent final critic and judge returned ACCEPT/PASS with no blocking
  finding after the responsive, signing-state, and reduced-motion repairs.

## Scope and remaining risk

Tauri, Flutter, PDF export, procedure-module migration, template governance,
and production provider qualification remain later work by explicit plan.

The uncomfortable limitation is unchanged: a citation and seven automated QA
checks do not establish clinical truth. An authorized surgeon still has to
review the cited source and approve the document before signing.
