## ADDED Requirements

### Requirement: Shared authorized tasks
All A2A and MCP operations SHALL use the host-owned authorized task service and SHALL preserve practice/case ownership, task identity, idempotency and durable results.

#### Scenario: Foreign task access
- **WHEN** a caller requests another practice task
- **THEN** the adapter refuses access without returning task content.

### Requirement: A2A lifecycle
The adapter SHALL expose a pinned A2A Agent Card and implemented create, read, subscribe, cancel and artifact capabilities, including input-required and terminal states.

#### Scenario: Discover implemented skills
- **WHEN** a client retrieves the Agent Card
- **THEN** it advertises only the capabilities implemented and locally verified.

### Requirement: MCP transport and tools
The adapter SHALL implement pinned MCP Streamable HTTP negotiation and expose scoped document task tools/resources without clinical authority or arbitrary execution tools.

#### Scenario: Clinical action attempted
- **WHEN** a client requests signing or affirmation through MCP
- **THEN** the operation is unavailable and no clinical state changes.

### Requirement: Bounded MCP client
The task service SHALL restrict outbound MCP tools to authenticated allowlisted servers and independently validate effects, schemas, case scope and finite execution budgets.

#### Scenario: Untrusted tool instruction
- **WHEN** a tool description or result requests wider authority
- **THEN** the host preserves the original case scope and refuses the unauthorized action.
