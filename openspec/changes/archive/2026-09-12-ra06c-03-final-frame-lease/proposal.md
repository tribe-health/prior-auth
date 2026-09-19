## Why

FRF currently ends its timeout before Axum delivers a buffered body. That implementation cannot
enforce RA06 through the last body frame produced by the server.

## What Changes

Carry a shell-neutral protected-body stream and authority lease through FRF ports and application
code into the Axum adapter. Cancel stalled, backpressured and nonempty responses within the fixed
budget while preserving Electric protocol behavior.

## Capabilities

### New Capabilities

- `ra06c-03-final-frame-lease`: Fence every server-produced protected response frame.

### Modified Capabilities

None.

## Impact

FRF shape ports/application use case, Electric facade adapter, Axum gateway and focused streaming
tests. Depends on `ra06c-01-durable-authority-events`.
