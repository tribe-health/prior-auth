## ADDED Requirements

### Requirement: Shared allowlisted presentation
Web A2UI and MCP Apps SHALL share document view models and DraftPreviewBlock, QaFindingsBlock, ClaimsManifestBlock and conditional HaltMemoBlock presentation through distinct protocol adapters.

#### Scenario: Both renderers show a draft
- **WHEN** the same persisted document is opened in either renderer
- **THEN** the canonical text, claims and QA results agree.

### Requirement: Sandboxed host actions
MCP Apps SHALL expose tool-linked ui:// resources with explicit CSP and host-mediated actions and SHALL not render agent-originated signing, affirmation or submission controls.

#### Scenario: Injected clinical surface
- **WHEN** an agent requests a signing surface
- **THEN** the surface is refused and no clinical action is available.

### Requirement: Scoped responsive state
Both renderers SHALL distinguish provisional output from committed artifacts and preserve responsive accessibility while clearing scoped transient data on authorization loss.

#### Scenario: Authorization revoked
- **WHEN** an active document session loses its verified scope
- **THEN** streaming stops and protected transient content is removed.
