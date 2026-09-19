## Why

The browser application needs one assembled certification after its complete case-to-letter and denial-response workflow and its update coordinator have passed. Earlier runtime slices and native foundations do not prove that the web product works end to end.

## What Changes

Run the complete browser startup, case workflow, denial-response, update and security scenarios against the actual local deployment and supported browsers. Record observed command, service and actual-browser evidence with explicit results. Native and mobile certification remain later milestones.

## Capabilities

### New Capabilities

- `ra-22-runtime-certification`: Certify the assembled browser runtime and product workflow.

### Modified Capabilities

None. The root OpenSpec spec store has no existing capability to modify.

## Impact

ASO owns the local cross-repository browser acceptance runner, evidence and phase reflection. Companion repositories supply the already verified services and artifacts required by the browser composition.

Dependencies: `web-case-to-letter/web-17-browser-scenario-certification` and `ra-20-safe-browser-updates`. Runtime order: 7. Recommended agent: Codex; complexity L, High; model class frontier.

See the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md) and the normative [web workflow contract](../../../docs/architecture/web-case-to-letter-contract.md). This proposal authorizes no implementation during planning.
